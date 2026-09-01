use crate::models::{BatchResult, PresetSkillRef, SingleResult, SkillPreset};
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

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// 用户自建配方存储路径（JSON 数组）。
fn user_presets_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_default()
        .join("trae-skill-manager")
        .join("presets.json")
}

/// 内置官方配方。
fn builtin_presets() -> Vec<SkillPreset> {
    let refs = |names: &[&str]| -> Vec<PresetSkillRef> {
        names
            .iter()
            .map(|n| PresetSkillRef {
                name: n.to_string(),
                source: "anthropics/skills".to_string(),
                description: None,
            })
            .collect()
    };
    vec![
        SkillPreset {
            id: "builtin-web-dev".to_string(),
            name: "Web 开发".to_string(),
            description: "覆盖网页搜索、GitHub、数据库与前端设计的 Web 开发技能组合".to_string(),
            version: "1.0.0".to_string(),
            skills: refs(&["web-search", "github", "postgres", "frontend-design", "html-report"]),
            tags: vec!["web".to_string(), "开发".to_string()],
            created_at: None,
            built_in: true,
        },
        SkillPreset {
            id: "builtin-data-ai".to_string(),
            name: "数据处理与 AI".to_string(),
            description: "数据分析、表格、PDF 与 AI 音乐、图表可视化的数据处理组合".to_string(),
            version: "1.0.0".to_string(),
            skills: refs(&["data-analysis", "xlsx", "pdf", "ai-music", "chart-visualization"]),
            tags: vec!["数据".to_string(), "AI".to_string()],
            created_at: None,
            built_in: true,
        },
        SkillPreset {
            id: "builtin-productivity".to_string(),
            name: "办公效率".to_string(),
            description: "文档、PPT、幻灯片、内部沟通与写作的办公效率组合".to_string(),
            version: "1.0.0".to_string(),
            skills: refs(&["docx", "pptx", "slides", "internal-comms", "doc-writing-guide"]),
            tags: vec!["办公".to_string(), "效率".to_string()],
            created_at: None,
            built_in: true,
        },
    ]
}

/// 读取用户自建配方；文件不存在或解析失败返回 None。
fn load_user_presets() -> Option<Vec<SkillPreset>> {
    let content = std::fs::read_to_string(user_presets_path()).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn list_presets() -> Vec<SkillPreset> {
    let mut presets = builtin_presets();
    if let Some(user) = load_user_presets() {
        presets.extend(user);
    }
    presets
}

/// 判断目标路径是否为用户配方库文件（忽略路径分隔符差异）。
fn same_presets_file(path: &Path) -> bool {
    let norm = |p: &Path| {
        p.to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_string()
    };
    norm(path) == norm(&user_presets_path())
}

/// 把配方合并写入用户配方库：同 id 覆盖，否则追加。
fn save_user_preset(preset: &SkillPreset) -> Result<(), String> {
    let path = user_presets_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
    }
    let mut presets = load_user_presets().unwrap_or_default();
    if let Some(existing) = presets.iter_mut().find(|p| p.id == preset.id) {
        *existing = preset.clone();
    } else {
        presets.push(preset.clone());
    }
    let json = serde_json::to_string_pretty(&presets).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("写入失败: {}", e))
}

pub fn export_preset(preset: &SkillPreset, export_path: &str) -> Result<(), String> {
    let path = Path::new(export_path);
    // 导出到用户配方库文件时合并写入，保证新建/导入配方可持久化
    if same_presets_file(path) {
        return save_user_preset(preset);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
    }
    let json = serde_json::to_string_pretty(preset).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("写入失败: {}", e))
}

pub fn import_preset(import_path: &str) -> Result<SkillPreset, String> {
    let content =
        std::fs::read_to_string(import_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let mut preset: SkillPreset =
        serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))?;
    if preset.name.trim().is_empty() {
        return Err("配方名称不能为空".to_string());
    }
    if preset.skills.is_empty() {
        return Err("配方至少需要一个技能".to_string());
    }
    if preset.id.trim().is_empty() {
        preset.id = format!("user-{}", timestamp_ms());
    }
    Ok(preset)
}

pub async fn install_preset(
    preset: &SkillPreset,
    tool_id: Option<&str>,
) -> Result<BatchResult, String> {
    let tool = crate::tools::get_tool(tool_id.unwrap_or("trae"))
        .unwrap_or_else(crate::tools::default_tool);
    let skills_path = tool
        .global_dir()
        .ok_or("无法确定技能目录，请检查工具是否已安装")?;
    if !skills_path.exists() {
        std::fs::create_dir_all(&skills_path).map_err(|e| format!("无法创建技能目录: {}", e))?;
    }

    let mut results = Vec::with_capacity(preset.skills.len());
    let mut succeeded = 0u32;
    for skill in &preset.skills {
        match install_one(&skill.source, &skill.name, &skills_path).await {
            Ok(()) => {
                succeeded += 1;
                results.push(SingleResult {
                    skill_name: skill.name.clone(),
                    success: true,
                    message: format!("{} 安装成功", skill.name),
                });
            }
            Err(e) => {
                results.push(SingleResult {
                    skill_name: skill.name.clone(),
                    success: false,
                    message: format!("{} 安装失败: {}", skill.name, e),
                });
            }
        }
    }
    let total = preset.skills.len() as u32;
    Ok(BatchResult {
        results,
        total,
        succeeded,
        failed: total - succeeded,
    })
}

/// 单个技能安装：已安装则跳过，否则调用 `npx skills add`（隐藏窗口）。
async fn install_one(source: &str, skill_name: &str, target_dir: &Path) -> Result<(), String> {
    // 已安装则跳过，避免重复下载
    if target_dir.join(skill_name).exists() {
        return Ok(());
    }

    let normalized = normalize_source(source);
    let parts: Vec<&str> = normalized.split('/').collect();
    let repo_source = parts[..parts.len().min(2)].join("/");
    let is_root_skill = parts.len() <= 2;

    let agent = if crate::utils::path::detect_skills_path()
        .to_string_lossy()
        .contains(".trae-cn")
    {
        "trae-cn"
    } else {
        "trae"
    };

    let mut cmd = hidden_command(crate::utils::npx_program());
    cmd.args([
        "-y",
        "skills",
        "add",
        repo_source.as_str(),
        "--yes",
        "--global",
        "--agent",
        agent,
    ]);
    if !is_root_skill {
        cmd.args(["--skill", skill_name]);
    }

    let status = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map_err(|e| format!("无法启动 npx 进程: {}。请确认已安装 Node.js 和 npx。", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("npx skills add 退出码: {:?}", status.code()))
    }
}

/// 归一化 source：从完整 GitHub URL 中提取 owner/repo。
fn normalize_source(source: &str) -> String {
    let trimmed = source.trim();
    for prefix in ["https://github.com/", "http://github.com/", "github.com/"] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return rest.trim_end_matches('/').to_string();
        }
    }
    trimmed.trim_end_matches('/').to_string()
}
