//! Trae 适配器：默认工具，行为必须与改造前完全一致（零回归）。

use serde_json::Value;
use std::path::{Path, PathBuf};

use super::adapter::{
    LinkStrategy, McpConfigFormat, McpConfigSpec, SkillFormat, Tool, ToolAdapter,
};

pub static TRAE_ADAPTER: ToolAdapter = ToolAdapter {
    id: "trae",
    display_name: "Trae",
    icon: "trae",
    process_names: &["Trae", "Trae.exe", "trae-cn", "TRAE SOLO CN"],
    global_dirs: trae_global_dirs,
    project_dir: ".trae/skills",
    format: SkillFormat::Standard,
    link_strategy: LinkStrategy::Junction,
    supports_agents_dir: true,
    config_file: Some("skill-config.json"),
    mcp_config: Some(McpConfigSpec {
        global_path: None,
        project_path: ".trae/mcp.json",
        format: McpConfigFormat::Json,
    }),
};

/// Trae 全局技能目录候选（迁移自 utils/path.rs 的 detect_skills_path）。
fn trae_global_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();

    let mut candidates: Vec<PathBuf> = vec![
        home.join(".trae-cn").join("skills"),
        home.join(".trae").join("skills"),
    ];

    #[cfg(windows)]
    {
        if let Some(appdata) = dirs::data_dir() {
            candidates.push(appdata.join("Trae").join("skills"));
        }
        if let Some(local_appdata) = dirs::data_local_dir() {
            candidates.push(local_appdata.join("Trae").join("skills"));
        }
    }

    #[cfg(not(windows))]
    {
        if let Some(config_dir) = dirs::config_dir() {
            candidates.push(config_dir.join("trae").join("skills"));
        }
    }

    candidates
}

pub struct TraeTool;

impl Tool for TraeTool {
    fn adapter(&self) -> &ToolAdapter {
        &TRAE_ADAPTER
    }

    /// Trae 特有：安装后把技能注册进 skill-config.json 的 managedSkills，
    /// 这样 TRAE Work 的技能管理器 UI 才能看到它。
    fn post_install(&self, skill_dir: &Path) -> Result<(), String> {
        let skill_name = skill_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Some(skills_path) = skill_dir.parent() {
            register_managed_skill(skills_path, &skill_name);
        }
        Ok(())
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trae_global_dirs_has_primary_candidate() {
        let dirs = trae_global_dirs();
        assert!(!dirs.is_empty());
        let home = dirs::home_dir().unwrap();
        assert_eq!(dirs[0], home.join(".trae-cn").join("skills"));
    }

    #[test]
    fn register_managed_skill_adds_to_registry() {
        let tmp = std::env::temp_dir().join("tsm-trae-reg-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp.join("skills")).unwrap();
        let config = tmp.join("skill-config.json");
        std::fs::write(
            &config,
            r#"{"disabledSkills":[],"managedSkills":{"existing":"marketplace"},"deletedSkills":[]}"#,
        )
        .unwrap();

        register_managed_skill(&tmp.join("skills"), "test-skill");

        let content = std::fs::read_to_string(&config).unwrap();
        let json: Value = serde_json::from_str(&content).unwrap();
        let managed = json["managedSkills"].as_object().unwrap();
        assert!(managed.contains_key("test-skill"), "test-skill should be registered");
        assert_eq!(managed["test-skill"], "user_upload");
        assert!(managed.contains_key("existing"), "existing entry preserved");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
