//! Codex CLI 适配器。
//!
//! Codex 官方约定：技能目录使用 .agents/skills（REPO/USER 级），见
//! https://developers.openai.com/codex/skills。旧版 ~/.codex/skills 作为
//! 兼容候选保留（skill-installer 系统技能仍可能写入该目录）。skills 无需
//! 任何 [features] 开关，官方已移除该配置项。

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
    project_dir: ".agents/skills",
    format: SkillFormat::Standard,
    link_strategy: LinkStrategy::Symlink,
    supports_agents_dir: true,
    config_file: Some("config.toml"),
    mcp_config: Some(McpConfigSpec {
        global_path: Some("config.toml"),
        project_path: ".codex/config.toml",
        format: McpConfigFormat::Toml,
    }),
};

fn codex_global_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![
        home.join(".agents").join("skills"),
        home.join(".codex").join("skills"),
    ]
}

pub struct CodexTool;

impl Tool for CodexTool {
    fn adapter(&self) -> &ToolAdapter {
        &CODEX_ADAPTER
    }
}
