//! 安装/更新进度事件接收器。
//!
//! 把「事件发射」从核心逻辑中解耦：GUI 通过 `tauri::AppHandle` 实现，
//! CLI/MCP 通过自己的输出通道实现，从而让 skills-core 不依赖 Tauri。

use crate::models::InstallOutputEvent;
use std::sync::Arc;

pub trait EventSink: Send + Sync {
    fn emit(&self, event: InstallOutputEvent);
}

/// 空实现：丢弃所有事件（CLI 静默模式 / 无 GUI 场景）。
pub struct NullSink;

impl EventSink for NullSink {
    fn emit(&self, _event: InstallOutputEvent) {}
}

pub type SharedSink = Arc<dyn EventSink>;
