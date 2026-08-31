use crate::models::{InstallOutputEvent, InstallResult, InstallRecord, SkillManifest};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::SystemTime;
use tauri::Emitter;
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Create a command whose console window is hidden on Windows.
fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn emit(app: &tauri::AppHandle, event: InstallOutputEvent) {
    let _ = app.emit("install-output", event);
}

/// Generate a unique ID for history records.
fn generate_id(prefix: &str) -> String {
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}-{}", prefix, ts)
}

/// Get current timestamp in milliseconds.
fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Count files recursively in a directory.
fn count_files(path: &Path) -> u32 {
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_files(&path);
            } else {
                count += 1;
            }
        }
    }
    count
}

/// Register a skill in TRAE's managedSkills registry (skill-config.json) so it
/// appears in the TRAE Work skill manager UI. The registry sits next to the
/// skills directory (e.g. ~/.trae-cn/skill-config.json).
fn register_managed_skill(skills_path: &Path, skill_name: &str) {
    let config_path = match skills_path.parent() {
        Some(p) => p.join("skill-config.json"),
        None => return,
    };
    if !config_path.exists() {
        return;
    }

    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut json: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };

    let managed = match json.get_mut("managedSkills").and_then(|v| v.as_object_mut()) {
        Some(m) => m,
        None => return,
    };
    if managed.contains_key(skill_name) {
        return;
    }

    managed.insert(
        skill_name.to_string(),
        Value::String("user_upload".to_string()),
    );
    if let Ok(new_content) = serde_json::to_string_pretty(&json) {
        let _ = std::fs::write(&config_path, new_content);
    }
}

// ─── Skill Verification ───────────────────────────────────────────────────

/// Verify that a directory contains a valid skill.
/// Checks: directory exists, SKILL.md exists and is non-empty.
fn verify_skill(path: &Path) -> bool {
    if !path.exists() || !path.is_dir() {
        return false;
    }

    let skill_md = path.join("SKILL.md");
    if !skill_md.exists() {
        return false;
    }

    match std::fs::read_to_string(&skill_md) {
        Ok(content) => !content.trim().is_empty(),
        Err(_) => false,
    }
}

// ─── Find skill directory in repo ─────────────────────────────────────────

/// Find the skill subdirectory within a cloned repo.
/// Tries, in order:
/// 1. The provided path_hint (most accurate, from list_repo_skills)
/// 2. skills/<skill_name>
/// 3. <skill_name>
/// 4. src/skills/<skill_name>
/// 5. Recursive search (max depth 3, 50 dirs limit)
fn find_skill_dir(
    repo_root: &Path,
    skill_name: &str,
    is_root_skill: bool,
    path_hint: Option<&str>,
) -> Result<PathBuf, String> {
    if is_root_skill {
        return Ok(repo_root.to_path_buf());
    }

    // Candidate 0: path_hint from list_repo_skills
    if let Some(hint) = path_hint {
        let hint_path = repo_root.join(hint.trim_matches('/'));
        if hint_path.join("SKILL.md").exists() {
            return Ok(hint_path);
        }
    }

    // Candidate 1: skills/<skill_name>
    let candidate1 = repo_root.join("skills").join(skill_name);
    if candidate1.join("SKILL.md").exists() {
        return Ok(candidate1);
    }

    // Candidate 2: <skill_name>
    let candidate2 = repo_root.join(skill_name);
    if candidate2.join("SKILL.md").exists() {
        return Ok(candidate2);
    }

    // Candidate 3: src/skills/<skill_name>
    let candidate3 = repo_root.join("src").join("skills").join(skill_name);
    if candidate3.join("SKILL.md").exists() {
        return Ok(candidate3);
    }

    // Fallback: recursive search (max depth 3, limited to 50 dirs)
    if let Some(found) = search_skill_recursive(repo_root, skill_name, 3, &mut 0) {
        return Ok(found);
    }

    let tried = vec![
        format!("{} (hint)", path_hint.unwrap_or("none")),
        candidate1.display().to_string(),
        candidate2.display().to_string(),
        candidate3.display().to_string(),
    ];
    Err(format!(
        "仓库中未找到 Skill 目录: 尝试了 {}",
        tried.join(", ")
    ))
}

/// Recursively search for a skill directory with SKILL.md.
fn search_skill_recursive(
    dir: &Path,
    skill_name: &str,
    max_depth: usize,
    dirs_visited: &mut usize,
) -> Option<PathBuf> {
    if max_depth == 0 || *dirs_visited > 50 {
        return None;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return None,
    };

    // Skip common non-skill directories
    let skip_dirs = [
        ".git", "node_modules", "dist", "build", ".github",
        "docs", "examples", "tests", "test", "__tests__",
    ];

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let dir_name = path.file_name()?.to_string_lossy().to_string();
        if skip_dirs.contains(&dir_name.as_str()) {
            continue;
        }

        *dirs_visited += 1;

        // Check if this is the skill we're looking for
        if dir_name.to_lowercase() == skill_name.to_lowercase()
            && path.join("SKILL.md").exists()
        {
            return Some(path);
        }

        // Recurse
        if let Some(found) = search_skill_recursive(&path, skill_name, max_depth - 1, dirs_visited) {
            return Some(found);
        }
    }

    None
}

// ─── Copy directory ───────────────────────────────────────────────────────

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

// ─── Temporary directory helper ───────────────────────────────────────────

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(prefix: &str) -> Result<Self, String> {
        let pid = std::process::id();
        let ts = timestamp_ms();
        let path = std::env::temp_dir().join(format!("trae-skill-{}-{}-{}", prefix, pid, ts));

        if path.exists() {
            let _ = std::fs::remove_dir_all(&path);
        }
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create temp dir: {}", e))?;

        Ok(TempDir { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

// ─── Main Install Function ────────────────────────────────────────────────

/// Install a skill from a GitHub source.
///
/// Tries, in order:
/// 1. `git clone --depth 1` (fastest, no npm download)
/// 2. `npx degit owner/repo[/skill]` (works without git, needs npx)
/// 3. `npx skills add` (TRAE skills CLI if available)
///
/// Uses transactional install: download to temp dir → verify → move to target.
/// Automatically writes history record after install.
pub async fn install_skill_streamed(
    app: tauri::AppHandle,
    source: &str,
    skill_name: &str,
    target_path: Option<&str>,
    skill_path_hint: Option<&str>,
) -> Result<InstallResult, String> {
    let start_time = timestamp_ms();
    let normalized_source = normalize_source(source);
    let repo_name = normalized_source
        .split('/')
        .next_back()
        .unwrap_or(&normalized_source)
        .to_string();
    let owner = normalized_source
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();

    let is_root_skill = skill_name.is_empty() || skill_name == repo_name;
    let target_label = if is_root_skill {
        normalized_source.clone()
    } else {
        format!("{}/{}", normalized_source, skill_name)
    };

    // Manifest ID: "<source>/<skill_name>"
    let manifest_id = if is_root_skill {
        normalized_source.clone()
    } else {
        format!("{}/{}", normalized_source, skill_name)
    };

    // Resolve target skills directory
    let skills_path = match target_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => crate::utils::path::detect_skills_path(),
    };

    // Ensure skills directory exists
    if !skills_path.exists() {
        std::fs::create_dir_all(&skills_path)
            .map_err(|e| format!("Failed to create skills directory: {}", e))?;
    }

    emit(&app, InstallOutputEvent::Stdout {
        data: format!("目标路径: {}", skills_path.display()),
    });

    let install_method;
    let mut last_error: Option<String>;

    // 1. Try git clone (transactional: temp → verify → move)
    emit(&app, InstallOutputEvent::Stdout {
        data: format!("[1/3] 尝试 git clone 安装 {} ...", target_label),
    });

    match try_git_install(
        &app,
        &owner,
        &repo_name,
        skill_name,
        is_root_skill,
        &skills_path,
        skill_path_hint,
    )
    .await
    {
        Ok((dest, files)) => {
            emit(&app, InstallOutputEvent::Stdout {
                data: format!("git clone 安装成功: {} ({} 个文件)", target_label, files),
            });
            install_method = "git".to_string();

            // Verify installation
            let verified = verify_skill(&dest);

            // Generate and write manifest
            let manifest = SkillManifest {
                id: manifest_id.clone(),
                name: skill_name.to_string(),
                source: normalized_source.clone(),
                source_type: "github".to_string(),
                install_method: install_method.clone(),
                installed_at: start_time,
                updated_at: timestamp_ms(),
                version: None,
                hash: None,
                files_installed: files,
                schema_version: 1,
                remote_hash: None,
                last_checked_at: None,
                update_available: false,
                latest_version: None,
            };
            let _ = crate::commands::scan::write_manifest(&dest, &manifest);
            register_managed_skill(&skills_path, skill_name);

            let result = build_install_result(
                true,
                skill_name,
                &dest,
                &install_method,
                verified,
                None,
                files,
                &skills_path,
            );

            // Write history record
            let _ = write_history_install(
                &normalized_source,
                skill_name,
                &install_method,
                &dest,
                true,
                &format!("Installed via git to {}", dest.display()),
                start_time,
            );

            emit_done(&app, true, &target_label);
            return Ok(result);
        }
        Err(e) => {
            emit(&app, InstallOutputEvent::Stderr {
                data: format!("git clone 失败: {}", e),
            });
            last_error = Some(e);
        }
    }

    // 2. Try npx degit
    emit(&app, InstallOutputEvent::Stdout {
        data: "[2/3] 回退到 npx degit 安装...".to_string(),
    });

    match try_degit_install(
        &app,
        &owner,
        &repo_name,
        skill_name,
        is_root_skill,
        &skills_path,
        skill_path_hint,
    )
    .await
    {
        Ok((dest, files)) => {
            emit(&app, InstallOutputEvent::Stdout {
                data: format!("npx degit 安装成功: {} ({} 个文件)", target_label, files),
            });
            install_method = "degit".to_string();

            let verified = verify_skill(&dest);

            // Generate and write manifest
            let manifest = SkillManifest {
                id: manifest_id.clone(),
                name: skill_name.to_string(),
                source: normalized_source.clone(),
                source_type: "github".to_string(),
                install_method: install_method.clone(),
                installed_at: start_time,
                updated_at: timestamp_ms(),
                version: None,
                hash: None,
                files_installed: files,
                schema_version: 1,
                remote_hash: None,
                last_checked_at: None,
                update_available: false,
                latest_version: None,
            };
            let _ = crate::commands::scan::write_manifest(&dest, &manifest);
            register_managed_skill(&skills_path, skill_name);

            let result = build_install_result(
                true,
                skill_name,
                &dest,
                &install_method,
                verified,
                None,
                files,
                &skills_path,
            );

            let _ = write_history_install(
                &normalized_source,
                skill_name,
                &install_method,
                &dest,
                true,
                &format!("Installed via degit to {}", dest.display()),
                start_time,
            );

            emit_done(&app, true, &target_label);
            return Ok(result);
        }
        Err(e) => {
            emit(&app, InstallOutputEvent::Stderr {
                data: format!("npx degit 失败: {}", e),
            });
            let git_err = last_error.unwrap_or_default();
            last_error = Some(format!("git: {}; degit: {}", git_err, e));
        }
    }

    // 3. Try npx skills add
    emit(&app, InstallOutputEvent::Stdout {
        data: "[3/3] 回退到 npx skills add 安装...".to_string(),
    });

    match try_npx_install(&app, &normalized_source, skill_name, &target_label).await {
        Ok(()) => {
            install_method = "npx".to_string();

            // For npx install, we don't control the target path,
            // so we scan to find and verify the installed skill
            let skills = crate::commands::scan::scan_directory(&skills_path);
            let installed = skills.iter().find(|s| s.name == skill_name);
            let (dest_path, verified, files) = match installed {
                Some(s) => {
                    let p = PathBuf::from(&s.path);
                    let v = verify_skill(&p);
                    let f = count_files(&p);

                    // Generate manifest for npx-installed skills too
                    let manifest = SkillManifest {
                        id: manifest_id.clone(),
                        name: skill_name.to_string(),
                        source: normalized_source.clone(),
                        source_type: "github".to_string(),
                        install_method: install_method.clone(),
                        installed_at: start_time,
                        updated_at: timestamp_ms(),
                        version: s.version.clone(),
                        hash: None,
                        files_installed: f,
                        schema_version: 1,
                        remote_hash: None,
                        last_checked_at: None,
                        update_available: false,
                        latest_version: None,
                    };
                    let _ = crate::commands::scan::write_manifest(&p, &manifest);
                    register_managed_skill(&skills_path, skill_name);

                    (s.path.clone(), v, f)
                }
                None => (String::new(), false, 0),
            };

            let result = build_install_result(
                true,
                skill_name,
                Path::new(&dest_path),
                &install_method,
                verified,
                None,
                files,
                &skills_path,
            );

            let _ = write_history_install(
                &normalized_source,
                skill_name,
                &install_method,
                Path::new(&dest_path),
                true,
                "Installed via npx skills add",
                start_time,
            );

            emit_done(&app, true, &target_label);
            return Ok(result);
        }
        Err(e) => {
            let combined = format!("{}; npx skills add: {}", last_error.unwrap_or_default(), e);

            // Write failure history
            let _ = write_history_install(
                &normalized_source,
                skill_name,
                "unknown",
                Path::new(""),
                false,
                &combined,
                start_time,
            );

            emit_done(&app, false, &target_label);
            return Err(combined);
        }
    }
}

fn emit_done(app: &tauri::AppHandle, success: bool, target_label: &str) {
    emit(
        app,
        InstallOutputEvent::Done {
            success,
            message: if success {
                format!("Successfully installed {}", target_label)
            } else {
                format!("Failed to install {}", target_label)
            },
        },
    );
}

fn build_install_result(
    success: bool,
    skill_name: &str,
    skill_path: &Path,
    method: &str,
    verified: bool,
    error: Option<String>,
    files_installed: u32,
    skills_dir: &Path,
) -> InstallResult {
    let local_skills = crate::commands::scan::scan_directory(skills_dir);
    InstallResult {
        success,
        skill_name: skill_name.to_string(),
        skill_path: skill_path.to_string_lossy().to_string(),
        method: method.to_string(),
        verified,
        error,
        files_installed,
        local_skills,
    }
}

fn write_history_install(
    source: &str,
    skill_name: &str,
    _method: &str,
    _install_path: &Path,
    success: bool,
    message: &str,
    _start_time: i64,
) -> Result<(), String> {
    let record = InstallRecord {
        id: generate_id("install"),
        action: "install".to_string(),
        skill_name: skill_name.to_string(),
        source: source.to_string(),
        timestamp: timestamp_ms(),
        success,
        message: message.to_string(),
    };
    crate::commands::history::add_history_record(record)
}

// ─── npx skills add ───────────────────────────────────────────────────────

async fn try_npx_install(
    app: &tauri::AppHandle,
    source: &str,
    skill_name: &str,
    _target_label: &str,
) -> Result<(), String> {
    // The skills CLI expects the repo as the source arg and the skill name via
    // --skill. Splitting on '/' keeps owner/repo as the repo and treats any
    // deeper path as a sub-skill (previously is_root_skill was wrongly true for
    // "owner/repo/skill" because repo_name was the last segment).
    let parts: Vec<&str> = source.split('/').collect();
    let repo_source = parts[..parts.len().min(2)].join("/");
    let is_root_skill = parts.len() <= 2;

    // Install globally into the TRAE agent dir the app scans. `--yes` skips the
    // interactive agent-selection prompt (would otherwise hang in a non-TTY).
    let agent = if crate::utils::path::detect_skills_path()
        .to_string_lossy()
        .contains(".trae-cn")
    {
        "trae-cn"
    } else {
        "trae"
    };

    let mut cmd = hidden_command(crate::utils::npx_program());
    cmd.args(["-y", "skills", "add", &repo_source, "--yes", "--global", "--agent", agent]);

    if !is_root_skill {
        cmd.args(["--skill", skill_name]);
    }

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 npx 进程: {}。请确认已安装 Node.js 和 npx。", e))?;

    let stdout = child.stdout.take().ok_or("无法捕获 stdout")?;
    let stderr = child.stderr.take().ok_or("无法捕获 stderr")?;

    let app_stdout = app.clone();
    let stdout_handle = tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stdout.emit("install-output", InstallOutputEvent::Stdout { data: line });
        }
    });

    let app_stderr = app.clone();
    let stderr_handle = tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stderr.emit("install-output", InstallOutputEvent::Stderr { data: line });
        }
    });

    let _ = tokio::join!(stdout_handle, stderr_handle);

    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待 npx 进程时出错: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "npx skills add 退出码: {:?}",
            status.code()
        ))
    }
}

// ─── Git Install (Transactional) ──────────────────────────────────────────

async fn try_git_install(
    app: &tauri::AppHandle,
    owner: &str,
    repo_name: &str,
    skill_name: &str,
    is_root_skill: bool,
    skills_path: &Path,
    path_hint: Option<&str>,
) -> Result<(PathBuf, u32), String> {
    if owner.is_empty() || repo_name.is_empty() {
        return Err("无法解析 GitHub owner/repo".to_string());
    }

    let repo_url = format!("https://github.com/{}/{}.git", owner, repo_name);

    // Clone into temporary directory
    let temp_dir = TempDir::new("git")?;

    emit(app, InstallOutputEvent::Stdout {
        data: format!("git clone {} ...", repo_url),
    });

    let clone_status = hidden_command("git")
        .args([
            "clone",
            "--depth",
            "1",
            "--",
            &repo_url,
            temp_dir.path().to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .await
        .map_err(|e| format!("无法启动 git: {}。请确认已安装 Git。", e))?;

    if !clone_status.success() {
        return Err(format!(
            "git clone 失败，退出码: {:?}。请确认 {} 是公开仓库且 Git 已安装。",
            clone_status.code(),
            repo_url
        ));
    }

    // Find the skill directory within the cloned repo
    let skill_src = find_skill_dir(temp_dir.path(), skill_name, is_root_skill, path_hint)?;

    // Verify skill in temp dir before moving
    if !verify_skill(&skill_src) {
        return Err("克隆成功但未找到有效的 SKILL.md".to_string());
    }

    // Determine destination path
    let dest_name = if is_root_skill { repo_name } else { skill_name };
    let dest = skills_path.join(dest_name);

    // Back up existing installation if present
    let backup = if dest.exists() {
        let backup_path = skills_path.join(format!("{}.bak", dest_name));
        if backup_path.exists() {
            let _ = std::fs::remove_dir_all(&backup_path);
        }
        match std::fs::rename(&dest, &backup_path) {
            Ok(()) => Some(backup_path),
            Err(e) => return Err(format!("无法备份旧版本: {}", e)),
        }
    } else {
        None
    };

    // Copy skill to destination
    let files = count_files(&skill_src);
    if let Err(e) = copy_dir_all(&skill_src, &dest) {
        // Rollback: restore backup if available
        if let Some(backup_path) = backup {
            let _ = std::fs::remove_dir_all(&dest);
            let _ = std::fs::rename(&backup_path, &dest);
        }
        return Err(format!("复制 Skill 文件失败: {}", e));
    }

    // Final verification
    if !verify_skill(&dest) {
        // Rollback
        if let Some(backup_path) = backup {
            let _ = std::fs::remove_dir_all(&dest);
            let _ = std::fs::rename(&backup_path, &dest);
        }
        return Err("安装后验证失败: SKILL.md 不存在或为空".to_string());
    }

    // Clean up backup (temp_dir is cleaned automatically by Drop)
    if let Some(backup_path) = backup {
        let _ = std::fs::remove_dir_all(&backup_path);
    }

    emit(app, InstallOutputEvent::Stdout {
        data: format!("已安装到 {} ({} 个文件)", dest.display(), files),
    });

    Ok((dest, files))
}

// ─── Degit Install (Transactional) ────────────────────────────────────────

async fn try_degit_install(
    app: &tauri::AppHandle,
    owner: &str,
    repo_name: &str,
    skill_name: &str,
    is_root_skill: bool,
    skills_path: &Path,
    path_hint: Option<&str>,
) -> Result<(PathBuf, u32), String> {
    if owner.is_empty() || repo_name.is_empty() {
        return Err("无法解析 GitHub owner/repo".to_string());
    }

    let repo_source = format!("{}/{}", owner, repo_name);

    // Download into temp directory
    let temp_dir = TempDir::new("degit")?;

    emit(app, InstallOutputEvent::Stdout {
        data: format!("npx degit {} ...", repo_source),
    });

    run_degit(&repo_source, temp_dir.path()).await?;

    // Find skill directory
    let skill_src = find_skill_dir(temp_dir.path(), skill_name, is_root_skill, path_hint)?;

    // Verify in temp dir
    if !verify_skill(&skill_src) {
        return Err("下载成功但未找到有效的 SKILL.md".to_string());
    }

    // Determine destination
    let dest_name = if is_root_skill { repo_name } else { skill_name };
    let dest = skills_path.join(dest_name);

    // Backup existing
    let backup = if dest.exists() {
        let backup_path = skills_path.join(format!("{}.bak", dest_name));
        if backup_path.exists() {
            let _ = std::fs::remove_dir_all(&backup_path);
        }
        match std::fs::rename(&dest, &backup_path) {
            Ok(()) => Some(backup_path),
            Err(e) => return Err(format!("无法备份旧版本: {}", e)),
        }
    } else {
        None
    };

    // Copy to destination
    let files = count_files(&skill_src);
    if let Err(e) = copy_dir_all(&skill_src, &dest) {
        if let Some(backup_path) = backup {
            let _ = std::fs::remove_dir_all(&dest);
            let _ = std::fs::rename(&backup_path, &dest);
        }
        return Err(format!("复制 Skill 文件失败: {}", e));
    }

    // Final verification
    if !verify_skill(&dest) {
        if let Some(backup_path) = backup {
            let _ = std::fs::remove_dir_all(&dest);
            let _ = std::fs::rename(&backup_path, &dest);
        }
        return Err("安装后验证失败: SKILL.md 不存在或为空".to_string());
    }

    // Clean up backup
    if let Some(backup_path) = backup {
        let _ = std::fs::remove_dir_all(&backup_path);
    }

    emit(app, InstallOutputEvent::Stdout {
        data: format!("已安装到 {} ({} 个文件)", dest.display(), files),
    });

    Ok((dest, files))
}

async fn run_degit(source: &str, dest: &Path) -> Result<(), String> {
    let status = hidden_command(crate::utils::npx_program())
        .args(["-y", "degit", "--force", source, dest.to_string_lossy().as_ref()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .await
        .map_err(|e| format!("无法启动 npx degit: {}。请确认已安装 Node.js 和 npx。", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("npx degit 退出码: {:?}", status.code()))
    }
}

// ─── Normalize source ─────────────────────────────────────────────────────

/// Normalize source: extract owner/repo from full GitHub URL.
fn normalize_source(source: &str) -> String {
    let trimmed = source.trim();
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        return rest.trim_end_matches('/').to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("http://github.com/") {
        return rest.trim_end_matches('/').to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("github.com/") {
        return rest.trim_end_matches('/').to_string();
    }
    trimmed.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_managed_skill_adds_to_registry() {
        let tmp = std::env::temp_dir().join("tsm-reg-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp.join("skills")).unwrap();
        let config = tmp.join("skill-config.json");
        std::fs::write(&config, r#"{"disabledSkills":[],"managedSkills":{"existing":"marketplace"},"deletedSkills":[]}"#).unwrap();

        register_managed_skill(&tmp.join("skills"), "test-skill");

        let content = std::fs::read_to_string(&config).unwrap();
        let json: Value = serde_json::from_str(&content).unwrap();
        let managed = json["managedSkills"].as_object().unwrap();
        assert!(managed.contains_key("test-skill"), "test-skill should be registered");
        assert_eq!(managed["test-skill"], "user_upload");
        assert!(managed.contains_key("existing"), "existing entry preserved");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn register_managed_skill_skips_duplicate() {
        let tmp = std::env::temp_dir().join("tsm-reg-test2");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp.join("skills")).unwrap();
        let config = tmp.join("skill-config.json");
        std::fs::write(&config, r#"{"managedSkills":{"dup":"marketplace"}}"#).unwrap();

        register_managed_skill(&tmp.join("skills"), "dup");
        register_managed_skill(&tmp.join("skills"), "dup");

        let content = std::fs::read_to_string(&config).unwrap();
        let json: Value = serde_json::from_str(&content).unwrap();
        let managed = json["managedSkills"].as_object().unwrap();
        assert_eq!(managed.len(), 1, "duplicate should not be added twice");
        assert_eq!(managed["dup"], "marketplace", "original value preserved");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
