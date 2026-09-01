//! 运行中的 AI 编程工具检测（Phase 4）。
//! 核心逻辑已抽取到 skills-core，此处保留 tauri 命令包装。

use skills_core::models::RunningTool;

pub use skills_core::process::detect_running_tools_internal;

/// Tauri 命令：检测当前运行中的 AI 编程工具。
#[tauri::command(rename_all = "camelCase")]
pub fn detect_running_tools() -> Vec<RunningTool> {
    detect_running_tools_internal()
}
