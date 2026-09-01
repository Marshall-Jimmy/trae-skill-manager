//! Claude Code 适配器。
//!
//! 注意：Claude Code 的 skills 目录路径、frontmatter 扩展字段（invocation /
//! subagent）以及 .claude/commands/*.md 等价关系，均来自公开文档整理，
//! 版本可能变化，需真机验证后再作为权威依据。

use std::path::PathBuf;

use super::adapter::{
    LinkStrategy, McpConfigFormat, McpConfigSpec, SkillFormat, Tool, ToolAdapter,
};

pub static CLAUDE_CODE_ADAPTER: ToolAdapter = ToolAdapter {
    id: "claude-code",
    display_name: "Claude Code",
    icon: "claude-code",
    process_names: &["claude"],
    global_dirs: claude_global_dirs,
    project_dir: ".claude/skills",
    format: SkillFormat::WithExtensions,
    link_strategy: LinkStrategy::Symlink,
    supports_agents_dir: false,
    config_file: None,
    mcp_config: Some(McpConfigSpec {
        global_path: Some(".claude.json"),
        project_path: ".mcp.json",
        format: McpConfigFormat::Json,
    }),
};

fn claude_global_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![home.join(".claude").join("skills")]
}

pub struct ClaudeCodeTool;

impl Tool for ClaudeCodeTool {
    fn adapter(&self) -> &ToolAdapter {
        &CLAUDE_CODE_ADAPTER
    }
}
