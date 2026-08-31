//! Codex CLI 适配器。
//!
//! Codex 特有要求：必须在 ~/.codex/config.toml 设置 [features] skills = true，
//! 否则技能目录被忽略。该开关是否仍必需需真机验证（附录 B 第 2 条）。

use std::path::PathBuf;

use super::adapter::{
    LinkStrategy, McpConfigFormat, McpConfigSpec, SkillFormat, Tool, ToolAdapter,
};

pub static CODEX_ADAPTER: ToolAdapter = ToolAdapter {
    id: "codex",
    display_name: "Codex CLI",
    icon: "codex",
    process_names: &["codex"],
    global_dirs: codex_global_dirs,
    project_dir: ".codex/skills",
    format: SkillFormat::Standard,
    link_strategy: LinkStrategy::Symlink,
    supports_agents_dir: false,
    config_file: Some("config.toml"),
    mcp_config: Some(McpConfigSpec {
        global_path: Some("config.toml"),
        project_path: ".codex/config.toml",
        format: McpConfigFormat::Toml,
    }),
};

fn codex_global_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![home.join(".codex").join("skills")]
}

pub struct CodexTool;

impl Tool for CodexTool {
    fn adapter(&self) -> &ToolAdapter {
        &CODEX_ADAPTER
    }
}
