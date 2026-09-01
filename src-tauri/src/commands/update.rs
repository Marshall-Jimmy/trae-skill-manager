//! 更新命令薄壳：升级/回滚逻辑已抽取到 skills-core（Phase 9.2），
//! 此处适配 tauri::AppHandle 为 EventSink；应用自更新（updater）为 GUI 特有保留。

use crate::commands::AppEventSink;
use skills_core::models::{AppUpdateInfo, UpdateResult};
use std::sync::Arc;

pub use skills_core::update::{check_for_updates, rollback_skill};

pub async fn update_skill_streamed(
    app: tauri::AppHandle,
    skill_path: String,
) -> Result<UpdateResult, String> {
    skills_core::update::update_skill_streamed(Arc::new(AppEventSink(app)), skill_path).await
}

// ─── App Update (Phase 8.1 自动更新，GUI 特有) ────────────────────────────

/// 检查应用新版本。未配置有效签名/更新源时优雅降级为「无可用更新」。
pub async fn check_app_update(app: &tauri::AppHandle) -> Result<AppUpdateInfo, String> {
    use tauri_plugin_updater::UpdaterExt;

    let current = app.package_info().version.to_string();
    let updater = app
        .updater()
        .map_err(|e| format!("更新器初始化失败: {}", e))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(AppUpdateInfo {
            available: true,
            version: Some(update.version.to_string()),
            current_version: Some(current),
            notes: update.body,
            pub_date: update.date.and_then(|d| {
                d.format(&time::format_description::well_known::Rfc3339).ok()
            }),
            download_url: Some(update.download_url.to_string()),
        }),
        Ok(None) => Ok(AppUpdateInfo {
            available: false,
            version: None,
            current_version: Some(current),
            notes: None,
            pub_date: None,
            download_url: None,
        }),
        Err(e) => Err(format!("检查更新失败: {}", e)),
    }
}

/// 下载并安装应用更新（安装完成后由 updater 自动重启应用）。
pub async fn install_app_update(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app
        .updater()
        .map_err(|e| format!("更新器初始化失败: {}", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败: {}", e))?
        .ok_or_else(|| "没有可用更新".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("下载安装失败: {}", e))?;
    Ok(())
}
