//! 工具适配器注册表：所有受支持的 AI 编程工具集中在此声明。

pub mod adapter;
pub mod claude_code;
pub mod codex;
pub mod cursor;
pub mod frontmatter;
pub mod trae;

pub use adapter::Tool;

/// 全部已注册工具（顺序即 UI 展示顺序，Trae 恒为第一个/默认）。
pub fn all_tools() -> Vec<&'static dyn Tool> {
    vec![
        &trae::TraeTool,
        &claude_code::ClaudeCodeTool,
        &cursor::CursorTool,
        &codex::CodexTool,
    ]
}

pub fn get_tool(id: &str) -> Option<&'static dyn Tool> {
    all_tools().into_iter().find(|t| t.id() == id)
}

/// 默认工具：Trae（保证改造前后行为一致）。
pub fn default_tool() -> &'static dyn Tool {
    &trae::TraeTool
}
