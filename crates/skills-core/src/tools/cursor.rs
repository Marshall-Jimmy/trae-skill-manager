//! Cursor 适配器。
//!
//! Cursor 特有要求：技能目录名必须与 frontmatter 的 name 同名；支持
//! paths / disable-model-invocation 扩展字段；支持嵌套目录。均来自公开
//! 文档整理，版本可能变化，需真机验证。

use std::path::PathBuf;

use super::adapter::{
    LinkStrategy, McpConfigFormat, McpConfigSpec, SkillFormat, Tool, ToolAdapter,
};

pub static CURSOR_ADAPTER: ToolAdapter = ToolAdapter {
    id: "cursor",
    display_name: "Cursor",
    icon: "cursor",
    process_names: &["Cursor", "Cursor.exe"],
    global_dirs: cursor_global_dirs,
    project_dir: ".cursor/skills",
    format: SkillFormat::WithExtensions,
    link_strategy: LinkStrategy::Symlink,
    supports_agents_dir: true,
    config_file: None,
    mcp_config: Some(McpConfigSpec {
        global_path: Some(".cursor/mcp.json"),
        project_path: ".cursor/mcp.json",
        format: McpConfigFormat::Json,
    }),
};

fn cursor_global_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![home.join(".cursor").join("skills")]
}

pub struct CursorTool;

impl Tool for CursorTool {
    fn adapter(&self) -> &ToolAdapter {
        &CURSOR_ADAPTER
    }
}
