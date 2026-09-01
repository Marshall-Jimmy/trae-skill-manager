use crate::event::SharedSink;
use crate::models::{SkillManifest, UpdateCheckResult, UpdateResult};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::SystemTime;
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

// ─── Manifest helpers ─────────────────────────────────────────────────────

const MANIFEST_FILE: &str = "skill.manifest.json";

fn read_manifest(skill_dir: &Path) -> Option<SkillManifest> {
    let manifest_path = skill_dir.join(MANIFEST_FILE);
    if !manifest_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&manifest_path).ok()?;
    serde_json::from_str::<SkillManifest>(&content).ok()
}

fn write_manifest(skill_dir: &Path, manifest: &SkillManifest) -> Result<(), String> {
    let manifest_path = skill_dir.join(MANIFEST_FILE);
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    std::fs::write(&manifest_path, json)
        .map_err(|e| format!("Failed to write manifest: {}", e))
}

// ─── Verify skill ─────────────────────────────────────────────────────────

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

// ─── Find skill directory in repo ─────────────────────────────────────────

fn find_skill_dir(
    repo_root: &Path,
    skill_name: &str,
    is_root_skill: bool,
    path_hint: Option<&str>,
) -> Result<PathBuf, String> {
    if is_root_skill {
        return Ok(repo_root.to_path_buf());
    }

    if let Some(hint) = path_hint {
        let hint_path = repo_root.join(hint.trim_matches('/'));
        if hint_path.join("SKILL.md").exists() {
            return Ok(hint_path);
        }
    }

    let candidate1 = repo_root.join("skills").join(skill_name);
    if candidate1.join("SKILL.md").exists() {
        return Ok(candidate1);
    }

    let candidate2 = repo_root.join(skill_name);
    if candidate2.join("SKILL.md").exists() {
        return Ok(candidate2);
    }

    let candidate3 = repo_root.join("src").join("skills").join(skill_name);
    if candidate3.join("SKILL.md").exists() {
        return Ok(candidate3);
    }

    if let Some(found) = search_skill_recursive(repo_root, skill_name, 3, &mut 0) {
        return Ok(found);
    }

    Err(format!(
        "仓库中未找到 Skill 目录: {}",
        skill_name
    ))
}

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

        if dir_name.to_lowercase() == skill_name.to_lowercase()
            && path.join("SKILL.md").exists()
        {
            return Some(path);
        }

        if let Some(found) = search_skill_recursive(&path, skill_name, max_depth - 1, dirs_visited) {
            return Some(found);
        }
    }

    None
}

// ─── Normalize source ─────────────────────────────────────────────────────

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

// ─── GitHub API: fetch latest commit hash ─────────────────────────────────

async fn fetch_latest_commit_hash(
    owner: &str,
    repo: &str,
    branch: &str,
    skill_path: Option<&str>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = if let Some(sp) = skill_path {
        format!(
            "https://api.github.com/repos/{}/{}/commits/{}?path={}",
            owner, repo, branch, sp
        )
    } else {
        format!(
            "https://api.github.com/repos/{}/{}/commits/{}",
            owner, repo, branch
        )
    };

    let response = client
        .get(&url)
        .header("User-Agent", "trae-skill-manager")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API 请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API 返回错误状态: {}",
            response.status()
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 GitHub API 响应失败: {}", e))?;

    let sha = json["sha"]
        .as_str()
        .ok_or_else(|| "无法从响应中提取 commit hash".to_string())?;

    Ok(sha.to_string())
}

// ─── Backup helpers ───────────────────────────────────────────────────────

fn find_latest_backup(skills_dir: &Path, skill_name: &str) -> Option<PathBuf> {
    let prefix = format!("{}.bak-", skill_name);
    let mut backups: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path.file_name()?.to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                backups.push(path);
            }
        }
    }

    backups.sort_by(|a, b| {
        let a_name = a.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let b_name = b.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        b_name.cmp(&a_name) // descending (newest first)
    });

    backups.into_iter().next()
}

fn cleanup_old_backups(skills_dir: &Path, skill_name: &str) {
    let prefix = format!("{}.bak-", skill_name);
    let mut backups: Vec<(PathBuf, String)> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                backups.push((path, name));
            }
        }
    }

    backups.sort_by(|a, b| b.1.cmp(&a.1)); // descending

    // Keep only the most recent one
    for (path, _) in backups.into_iter().skip(1) {
        let _ = std::fs::remove_dir_all(&path);
    }
}

// ─── Check for updates ────────────────────────────────────────────────────

pub async fn check_for_updates(
    skill_paths: Vec<String>,
) -> Vec<UpdateCheckResult> {
    let mut results = Vec::new();

    for skill_path_str in skill_paths {
        let skill_path = Path::new(&skill_path_str);
        let now = timestamp_ms();

        let skill_name = skill_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Read manifest
        let manifest = match read_manifest(skill_path) {
            Some(m) => m,
            None => {
                results.push(UpdateCheckResult {
                    skill_path: skill_path_str.clone(),
                    skill_name,
                    has_update: false,
                    current_hash: None,
                    latest_hash: None,
                    last_checked_at: now,
                    error: Some("未找到 manifest 文件，无法检查更新".to_string()),
                });
                continue;
            }
        };

        // Only check github sources
        if manifest.source_type != "github" {
            results.push(UpdateCheckResult {
                skill_path: skill_path_str.clone(),
                skill_name,
                has_update: false,
                current_hash: manifest.hash.clone(),
                latest_hash: None,
                last_checked_at: now,
                error: Some("非 GitHub 来源，暂不支持更新检查".to_string()),
            });
            continue;
        }

        // Parse owner/repo from source
        let normalized_source = normalize_source(&manifest.source);
        let parts: Vec<&str> = normalized_source.splitn(2, '/').collect();
        if parts.len() != 2 {
            results.push(UpdateCheckResult {
                skill_path: skill_path_str.clone(),
                skill_name,
                has_update: false,
                current_hash: manifest.hash.clone(),
                latest_hash: None,
                last_checked_at: now,
                error: Some(format!("无法解析 source: {}", manifest.source)),
            });
            continue;
        }
        let owner = parts[0];
        let repo = parts[1];

        // Determine skill path in repo (for path-specific commit check)
        let repo_name = repo.to_string();
        let is_root_skill = manifest.name.is_empty() || manifest.name == repo_name;
        let skill_path_in_repo = if is_root_skill {
            None
        } else {
            Some(format!("skills/{}", manifest.name))
        };

        // Fetch latest commit hash
        match fetch_latest_commit_hash(owner, repo, "main", skill_path_in_repo.as_deref()).await {
            Ok(latest_hash) => {
                let current_hash = manifest.hash.clone();
                let has_update = match &current_hash {
                    Some(h) => h != &latest_hash,
                    None => true, // no local hash, treat as update available
                };

                // Update manifest with remote info
                let mut updated_manifest = manifest.clone();
                updated_manifest.remote_hash = Some(latest_hash.clone());
                updated_manifest.last_checked_at = Some(now);
                updated_manifest.update_available = has_update;
                let _ = write_manifest(skill_path, &updated_manifest);

                results.push(UpdateCheckResult {
                    skill_path: skill_path_str.clone(),
                    skill_name,
                    has_update,
                    current_hash,
                    latest_hash: Some(latest_hash),
                    last_checked_at: now,
                    error: None,
                });
            }
            Err(e) => {
                // Try with "master" branch if "main" fails
                let fallback_result = fetch_latest_commit_hash(
                    owner,
                    repo,
                    "master",
                    skill_path_in_repo.as_deref(),
                )
                .await;

                match fallback_result {
                    Ok(latest_hash) => {
                        let current_hash = manifest.hash.clone();
                        let has_update = match &current_hash {
                            Some(h) => h != &latest_hash,
                            None => true,
                        };

                        let mut updated_manifest = manifest.clone();
                        updated_manifest.remote_hash = Some(latest_hash.clone());
                        updated_manifest.last_checked_at = Some(now);
                        updated_manifest.update_available = has_update;
                        let _ = write_manifest(skill_path, &updated_manifest);

                        results.push(UpdateCheckResult {
                            skill_path: skill_path_str.clone(),
                            skill_name,
                            has_update,
                            current_hash,
                            latest_hash: Some(latest_hash),
                            last_checked_at: now,
                            error: None,
                        });
                    }
                    Err(e2) => {
                        results.push(UpdateCheckResult {
                            skill_path: skill_path_str.clone(),
                            skill_name,
                            has_update: false,
                            current_hash: manifest.hash.clone(),
                            latest_hash: None,
                            last_checked_at: now,
                            error: Some(format!("检查更新失败: {}; {}", e, e2)),
                        });
                    }
                }
            }
        }
    }

    results
}

// ─── Update skill ─────────────────────────────────────────────────────────

pub async fn update_skill_streamed(
    sink: SharedSink,
    skill_path: String,
) -> Result<UpdateResult, String> {
    let now = timestamp_ms();
    let skill_path_buf = PathBuf::from(&skill_path);

    // Read manifest
    let manifest = read_manifest(&skill_path_buf)
        .ok_or_else(|| "未找到 manifest 文件，无法更新".to_string())?;

    let skill_name = manifest.name.clone();
    let previous_hash = manifest.hash.clone();
    let source = manifest.source.clone();
    let _install_method = manifest.install_method.clone();

    if manifest.source_type != "github" {
        return Err("非 GitHub 来源，暂不支持更新".to_string());
    }

    let skills_dir = skill_path_buf
        .parent()
        .ok_or_else(|| "无法获取技能父目录".to_string())?;

    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: format!("开始更新 {} ...", skill_name),
    });

    // Create backup
    let backup_name = format!("{}.bak-{}", skill_name, now);
    let backup_path = skills_dir.join(&backup_name);

    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: format!("创建备份: {}", backup_name),
    });

    if let Err(e) = std::fs::rename(&skill_path_buf, &backup_path) {
        return Err(format!("创建备份失败: {}", e));
    }

    // Clean up old backups (keep only the latest one)
    cleanup_old_backups(skills_dir, &skill_name);

    // Re-install using existing install logic
    let normalized_source = normalize_source(&source);
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

    let mut install_success = false;
    let mut new_hash: Option<String> = None;
    let mut last_error: Option<String> = None;

    // Try git clone first
    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: "[1/2] 尝试 git clone 获取最新版本...".to_string(),
    });

    match try_git_install_to(
        &sink,
        &owner,
        &repo_name,
        &skill_name,
        is_root_skill,
        skills_dir,
        None,
    )
    .await
    {
        Ok((dest, files, hash)) => {
            sink.emit(crate::models::InstallOutputEvent::Stdout {
                data: format!("git clone 成功: {} 个文件", files),
            });

            if verify_skill(&dest) {
                new_hash = hash;

                // Write updated manifest
                let updated_manifest = SkillManifest {
                    id: manifest.id.clone(),
                    name: skill_name.clone(),
                    source: normalized_source.clone(),
                    source_type: "github".to_string(),
                    install_method: "git".to_string(),
                    installed_at: manifest.installed_at,
                    updated_at: timestamp_ms(),
                    version: None,
                    hash: new_hash.clone(),
                    files_installed: files,
                    schema_version: 2,
                    remote_hash: new_hash.clone(),
                    last_checked_at: Some(timestamp_ms()),
                    update_available: false,
                    latest_version: None,
                };
                let _ = write_manifest(&dest, &updated_manifest);

                install_success = true;
            } else {
                last_error = Some("安装后验证失败".to_string());
            }
        }
        Err(e) => {
            sink.emit(crate::models::InstallOutputEvent::Stderr {
                data: format!("git clone 失败: {}", e),
            });
            last_error = Some(e);
        }
    }

    // Try degit if git failed
    if !install_success {
        sink.emit(crate::models::InstallOutputEvent::Stdout {
            data: "[2/2] 回退到 npx degit 更新...".to_string(),
        });

        match try_degit_install_to(
            &sink,
            &owner,
            &repo_name,
            &skill_name,
            is_root_skill,
            skills_dir,
            None,
        )
        .await
        {
            Ok((dest, files)) => {
                sink.emit(crate::models::InstallOutputEvent::Stdout {
                    data: format!("npx degit 成功: {} 个文件", files),
                });

                if verify_skill(&dest) {
                    // Write updated manifest
                    let updated_manifest = SkillManifest {
                        id: manifest.id.clone(),
                        name: skill_name.clone(),
                        source: normalized_source.clone(),
                        source_type: "github".to_string(),
                        install_method: "degit".to_string(),
                        installed_at: manifest.installed_at,
                        updated_at: timestamp_ms(),
                        version: None,
                        hash: None,
                        files_installed: files,
                        schema_version: 2,
                        remote_hash: None,
                        last_checked_at: Some(timestamp_ms()),
                        update_available: false,
                        latest_version: None,
                    };
                    let _ = write_manifest(&dest, &updated_manifest);

                    install_success = true;
                } else {
                    last_error = Some("degit 安装后验证失败".to_string());
                }
            }
            Err(e) => {
                sink.emit(crate::models::InstallOutputEvent::Stderr {
                    data: format!("npx degit 失败: {}", e),
                });
                let prev_err = last_error.unwrap_or_default();
                last_error = Some(format!("git: {}; degit: {}", prev_err, e));
            }
        }
    }

    // Handle result
    if install_success {
        // Remove backup on success
        let _ = std::fs::remove_dir_all(&backup_path);

        sink.emit(crate::models::InstallOutputEvent::Done {
            success: true,
            message: format!("Successfully updated {}", skill_name),
        });

        let local_skills = crate::scan::scan_directory(skills_dir);

        Ok(UpdateResult {
            success: true,
            skill_name: skill_name.clone(),
            skill_path: skill_path.clone(),
            previous_hash,
            new_hash,
            error: None,
            local_skills,
        })
    } else {
        // Rollback: restore from backup
        sink.emit(crate::models::InstallOutputEvent::Stderr {
            data: "更新失败，正在恢复备份...".to_string(),
        });

        // Remove the failed installation if it exists
        if skill_path_buf.exists() {
            let _ = std::fs::remove_dir_all(&skill_path_buf);
        }

        // Restore backup
        match std::fs::rename(&backup_path, &skill_path_buf) {
            Ok(_) => {
                sink.emit(crate::models::InstallOutputEvent::Stderr {
                    data: "备份已恢复".to_string(),
                });
            }
            Err(e) => {
                sink.emit(crate::models::InstallOutputEvent::Stderr {
                    data: format!("恢复备份失败: {}", e),
                });
            }
        }

        sink.emit(crate::models::InstallOutputEvent::Done {
            success: false,
            message: format!("Failed to update {}", skill_name),
        });

        let _local_skills = crate::scan::scan_directory(skills_dir);

        Err(last_error.unwrap_or_else(|| "更新失败".to_string()))
    }
}

// ─── Git install (for update) ────────────────────────────────────────────

async fn try_git_install_to(
    sink: &SharedSink,
    owner: &str,
    repo_name: &str,
    skill_name: &str,
    is_root_skill: bool,
    skills_path: &Path,
    path_hint: Option<&str>,
) -> Result<(PathBuf, u32, Option<String>), String> {
    if owner.is_empty() || repo_name.is_empty() {
        return Err("无法解析 GitHub owner/repo".to_string());
    }

    let repo_url = format!("https://github.com/{}/{}.git", owner, repo_name);
    let temp_dir = TempDir::new("git-update")?;

    sink.emit(crate::models::InstallOutputEvent::Stdout {
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
        .map_err(|e| format!("无法启动 git: {}", e))?;

    if !clone_status.success() {
        return Err(format!("git clone 失败，退出码: {:?}", clone_status.code()));
    }

    // Get commit hash
    let hash_output = hidden_command("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(temp_dir.path())
        .output()
        .await
        .ok();
    let hash = hash_output.and_then(|o| {
        if o.status.success() {
            String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
        } else {
            None
        }
    });

    // Find skill directory
    let skill_src = find_skill_dir(temp_dir.path(), skill_name, is_root_skill, path_hint)?;

    if !verify_skill(&skill_src) {
        return Err("克隆成功但未找到有效的 SKILL.md".to_string());
    }

    let dest_name = if is_root_skill { repo_name } else { skill_name };
    let dest = skills_path.join(dest_name);

    // Copy to destination
    let files = count_files(&skill_src);
    copy_dir_all(&skill_src, &dest)
        .map_err(|e| format!("复制 Skill 文件失败: {}", e))?;

    if !verify_skill(&dest) {
        let _ = std::fs::remove_dir_all(&dest);
        return Err("安装后验证失败".to_string());
    }

    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: format!("已安装到 {} ({} 个文件)", dest.display(), files),
    });

    Ok((dest, files, hash))
}

// ─── Degit install (for update) ──────────────────────────────────────────

async fn try_degit_install_to(
    sink: &SharedSink,
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
    let temp_dir = TempDir::new("degit-update")?;

    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: format!("npx degit {} ...", repo_source),
    });

    let status = hidden_command(crate::utils::npx_program())
        .args(["degit", "--force", &repo_source, temp_dir.path().to_string_lossy().as_ref()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .await
        .map_err(|e| format!("无法启动 npx degit: {}", e))?;

    if !status.success() {
        return Err(format!("npx degit 退出码: {:?}", status.code()));
    }

    let skill_src = find_skill_dir(temp_dir.path(), skill_name, is_root_skill, path_hint)?;

    if !verify_skill(&skill_src) {
        return Err("下载成功但未找到有效的 SKILL.md".to_string());
    }

    let dest_name = if is_root_skill { repo_name } else { skill_name };
    let dest = skills_path.join(dest_name);

    let files = count_files(&skill_src);
    copy_dir_all(&skill_src, &dest)
        .map_err(|e| format!("复制 Skill 文件失败: {}", e))?;

    if !verify_skill(&dest) {
        let _ = std::fs::remove_dir_all(&dest);
        return Err("安装后验证失败".to_string());
    }

    sink.emit(crate::models::InstallOutputEvent::Stdout {
        data: format!("已安装到 {} ({} 个文件)", dest.display(), files),
    });

    Ok((dest, files))
}

// ─── Rollback skill ───────────────────────────────────────────────────────

pub fn rollback_skill(skill_path: String) -> Result<UpdateResult, String> {
    let skill_path_buf = PathBuf::from(&skill_path);
    let skill_name = skill_path_buf
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let skills_dir = skill_path_buf
        .parent()
        .ok_or_else(|| "无法获取技能父目录".to_string())?;

    // Find the latest backup
    let backup_path = find_latest_backup(skills_dir, &skill_name)
        .ok_or_else(|| format!("未找到 {} 的备份", skill_name))?;

    // Read current manifest for previous hash
    let current_manifest = read_manifest(&skill_path_buf);
    let previous_hash = current_manifest.and_then(|m| m.hash);

    // Read backup manifest for new hash (after rollback)
    let backup_manifest = read_manifest(&backup_path);
    let new_hash = backup_manifest.and_then(|m| m.hash);

    // Move current to a temp location, then restore backup
    let temp_removed = skills_dir.join(format!("{}.rollback-tmp-{}", skill_name, timestamp_ms()));

    // Rename current directory out of the way
    if skill_path_buf.exists() {
        std::fs::rename(&skill_path_buf, &temp_removed)
            .map_err(|e| format!("无法移动当前版本: {}", e))?;
    }

    // Restore backup
    match std::fs::rename(&backup_path, &skill_path_buf) {
        Ok(_) => {
            // Clean up the old current version
            let _ = std::fs::remove_dir_all(&temp_removed);

            // Update manifest to reflect rollback
            if let Some(mut manifest) = read_manifest(&skill_path_buf) {
                manifest.updated_at = timestamp_ms();
                manifest.update_available = false;
                manifest.last_checked_at = Some(timestamp_ms());
                let _ = write_manifest(&skill_path_buf, &manifest);
            }

            let local_skills = crate::scan::scan_directory(skills_dir);

            Ok(UpdateResult {
                success: true,
                skill_name: skill_name.clone(),
                skill_path: skill_path.clone(),
                previous_hash,
                new_hash,
                error: None,
                local_skills,
            })
        }
        Err(e) => {
            // Try to restore the current version
            if temp_removed.exists() {
                let _ = std::fs::rename(&temp_removed, &skill_path_buf);
            }
            Err(format!("恢复备份失败: {}", e))
        }
    }
}
