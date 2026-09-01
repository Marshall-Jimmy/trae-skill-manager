//! 安装命令薄壳：逻辑已抽取到 skills-core（Phase 9.2），
//! 此处把 tauri::AppHandle 适配为 EventSink，保持 GUI 命令签名零回归。

use crate::commands::AppEventSink;
use skills_core::models::InstallResult;
use std::sync::Arc;

pub async fn install_skill_streamed(
    app: tauri::AppHandle,
    source: &str,
    skill_name: &str,
    target_path: Option<&str>,
    skill_path_hint: Option<&str>,
    tool_id: Option<&str>,
) -> Result<InstallResult, String> {
    skills_core::install::install_skill_streamed(
        Arc::new(AppEventSink(app)),
        source,
        skill_name,
        target_path,
        skill_path_hint,
        tool_id,
    )
    .await
}
