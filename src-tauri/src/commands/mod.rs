pub mod browse;
pub mod diagnose;
pub mod export;
pub mod fetch;
pub mod history;
pub mod install;
pub mod mcp;
pub mod mcp_sync;
pub mod preset;
pub mod process;
pub mod remove;
pub mod scan;
pub mod search_github;
pub mod sync;
pub mod toggle;
pub mod translate;
pub mod update;

use skills_core::event::EventSink;
use skills_core::models::InstallOutputEvent;
use tauri::Emitter;

/// 本地 newtype：把 tauri::AppHandle 包装为 EventSink（孤儿规则限制），
/// 供 install/update 命令层把 GUI 事件转发给前端。
pub struct AppEventSink(pub tauri::AppHandle);

impl EventSink for AppEventSink {
    fn emit(&self, event: InstallOutputEvent) {
        let _ = Emitter::emit(&self.0, "install-output", event);
    }
}
