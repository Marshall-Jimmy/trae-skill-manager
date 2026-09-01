#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
#[cfg(debug_assertions)]
mod local_api;
mod models;
mod tools;
mod utils;

use models::*;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// Set the window's big (taskbar) icon from a high-res PNG so the taskbar
/// renders crisply instead of upscaling the 16x16 small icon.
#[cfg(target_os = "windows")]
fn set_taskbar_icon(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{CreateIcon, SendMessageW, ICON_BIG, WM_SETICON};

    let Ok(img) = tauri::image::Image::from_bytes(include_bytes!("../icons/256x256.png")) else {
        return;
    };
    let rgba = img.rgba();
    let (w, h) = (img.width() as i32, img.height() as i32);

    let mut and_mask = Vec::with_capacity((w * h) as usize);
    for px in rgba.chunks_exact(4) {
        and_mask.push(px[3].wrapping_sub(u8::MAX));
    }
    let mut bgra = rgba.to_vec();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2);
    }

    let Ok(hicon) = (unsafe { CreateIcon(None, w, h, 1, 32, and_mask.as_ptr(), bgra.as_ptr()) }) else {
        return;
    };
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(hicon.0 as isize)),
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_taskbar_icon(_window: &tauri::WebviewWindow) {}

// ─── Scan Commands ────────────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn scan_local_skills(path: Option<String>, tool_id: Option<String>) -> Result<Vec<LocalSkill>, String> {
    let scan_path = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let tool = tools::get_tool(tool_id.as_deref().unwrap_or("trae"))
                .unwrap_or_else(tools::default_tool);
            tool.global_dir().ok_or("无法确定技能目录")?
        }
    };
    Ok(commands::scan::scan_directory(&scan_path))
}

#[tauri::command(rename_all = "camelCase")]
fn scan_project_skills(project_path: String, tool_id: Option<String>) -> Result<Vec<LocalSkill>, String> {
    let tool = tools::get_tool(tool_id.as_deref().unwrap_or("trae"))
        .unwrap_or_else(tools::default_tool);
    Ok(commands::scan::scan_project_skills(&project_path, tool))
}

// ─── Tool Adapter Commands ────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn get_tools_status() -> Vec<models::ToolStatus> {
    let running: std::collections::HashSet<String> = commands::process::detect_running_tools_internal()
        .into_iter()
        .map(|t| t.tool_id)
        .collect();
    tools::all_tools()
        .iter()
        .map(|t| models::ToolStatus {
            id: t.id().to_string(),
            display_name: t.display_name().to_string(),
            icon: t.icon().to_string(),
            installed: t.detect_installed(),
            running: running.contains(t.id()),
            global_dir: t.global_dir().map(|p| p.to_string_lossy().to_string()),
            project_dir: t.adapter().project_dir.to_string(),
        })
        .collect()
}

// ─── Fetch Commands ──────────────────────────────────────────────────────

fn get_github_token() -> String {
    if let Ok(content) = std::fs::read_to_string(config_path()) {
        if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
            return config.github.token;
        }
    }
    String::new()
}

/// Guards the stale-while-revalidate background refresh so repeated fetch
/// calls while the cache is stale don't spawn a pile of concurrent refreshes.
static REFRESHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Delayed low-priority pass that enriches repo descriptions a few seconds
/// after the first paint, so the UI never blocks on it. Reads the cached list
/// (no re-fetch) and pushes the enriched result to the frontend.
fn spawn_delayed_enrich(app: &tauri::AppHandle, token: Option<String>) {
    if REFRESHING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let mut skills = commands::fetch::read_cache_allow_stale().unwrap_or_default();
        commands::fetch::enrich_repo_descriptions(&mut skills, token.as_deref()).await;
        let skills = commands::fetch::sort_skills(skills, Some("trending"));
        let _ = app2.emit("skills-refreshed", serde_json::json!({ "skills": skills }));
        REFRESHING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_skills(
    app: tauri::AppHandle,
    view: Option<String>,
    _page: Option<u32>,
    _per_page: Option<u32>,
) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    let token = get_github_token();
    let token_opt: Option<String> = if token.is_empty() { None } else { Some(token) };

    // stale-while-revalidate: serve whatever cache exists immediately so the
    // first paint never blocks on the network, then refresh in the background.
    if let Some(cached) = commands::fetch::read_cache_allow_stale() {
        if !commands::fetch::cache_is_fresh() && !REFRESHING.swap(true, std::sync::atomic::Ordering::SeqCst) {
            let app2 = app.clone();
            let token2 = token_opt.clone();
            tauri::async_runtime::spawn(async move {
                let mut skills = commands::fetch::fetch_all_sources(token2.as_deref()).await;
                // Delay description enrichment a few seconds so it runs as a
                // low-priority pass after the main fetch has spent its quota.
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                commands::fetch::enrich_repo_descriptions(&mut skills, token2.as_deref()).await;
                // Emit trending-sorted: every non-trending tab re-sorts/filters
                // client-side, so this order is only authoritative for the
                // 趋势 tab (which keeps the backend ranking).
                let skills = commands::fetch::sort_skills(skills, Some("trending"));
                let _ = app2.emit("skills-refreshed", serde_json::json!({ "skills": skills }));
                REFRESHING.store(false, std::sync::atomic::Ordering::SeqCst);
            });
        } else if !REFRESHING.load(std::sync::atomic::Ordering::SeqCst) {
            // Cache is fresh but descriptions may be missing: run a delayed
            // low-priority enrich from the cached list (no re-fetch).
            spawn_delayed_enrich(&app, token_opt.clone());
        }
        let all_skills = commands::fetch::sort_skills(cached, view.as_deref());
        let total = all_skills.len() as u32;
        return Ok(ApiResponse {
            data: all_skills,
            pagination: Some(Pagination {
                page: 0,
                per_page: total,
                total,
                has_more: false,
            }),
        });
    }

    // No cache at all: blocking first fetch (no enrich — descriptions are
    // filled in by a delayed background pass so the first paint stays fast).
    let all_skills = commands::fetch::fetch_all_sources(token_opt.as_deref()).await;
    let all_skills = commands::fetch::sort_skills(all_skills, view.as_deref());
    let total = all_skills.len() as u32;
    spawn_delayed_enrich(&app, token_opt.clone());
    Ok(ApiResponse {
        data: all_skills,
        pagination: Some(Pagination {
            page: 0,
            per_page: total,
            total,
            has_more: false,
        }),
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn search_skills(query: String, limit: Option<u32>) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    let token = get_github_token();
    commands::fetch::search_skills(&query, limit, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_skill_detail(source: String, slug: String) -> Result<SkillDetail, String> {
    let token = get_github_token();
    commands::fetch::fetch_skill_detail(&source, &slug, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn list_repo_skills(source: String) -> Result<Vec<RepoSkillInfo>, String> {
    eprintln!("[debug-main] list_repo_skills called with source={}", source);
    let token = get_github_token();
    commands::fetch::list_repo_skills(&source, if token.is_empty() { None } else { Some(&token) }).await
}

// ─── Install Command (streamed) ───────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn install_skill_streamed(
    app: tauri::AppHandle,
    source: String,
    skill_name: String,
    target_path: Option<String>,
    skill_path_hint: Option<String>,
    tool_id: Option<String>,
) -> Result<InstallResult, String> {
    commands::install::install_skill_streamed(
        app,
        &source,
        &skill_name,
        target_path.as_deref(),
        skill_path_hint.as_deref(),
        tool_id.as_deref(),
    ).await
}

// ─── Remove Command ──────────────────────────────────────────────────────

#[tauri::command]
fn remove_skill(path: String) -> Result<bool, String> {
    commands::remove::remove_skill(&path)
}

// ─── Toggle Command ───────────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn toggle_skill(skill_path: String) -> Result<serde_json::Value, String> {
    commands::toggle::toggle_skill(&skill_path)
}

// ─── Browse Commands ─────────────────────────────────────────────────────

#[tauri::command]
fn browse_skill_files(path: String) -> Result<Vec<FileEntry>, String> {
    commands::browse::browse_skill_files(&path)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    commands::browse::read_file_content(&path)
}

// ─── History Commands ────────────────────────────────────────────────────

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}

#[tauri::command]
fn add_history_record(record: InstallRecord) -> Result<(), String> {
    commands::history::add_history_record(record)
}

#[tauri::command]
fn get_history() -> Result<Vec<InstallRecord>, String> {
    commands::history::get_history()
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    commands::history::clear_history()
}

// ─── Translation Commands ────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn translate_skill_descriptions(
    texts: Vec<String>,
    target_language: String,
    api_key: String,
    api_base: String,
    model: String,
    use_immersive: bool,
) -> Result<std::collections::HashMap<String, String>, String> {
    commands::translate::translate_texts(
        texts,
        &target_language,
        &api_key,
        &api_base,
        &model,
        use_immersive,
    )
    .await
}

#[tauri::command]
fn clear_translation_cache() -> Result<(), String> {
    commands::translate::clear_translation_cache()
}

// ─── GitHub Community Search Commands ────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn search_github_skills(query: String, limit: Option<u32>) -> Result<Vec<RemoteSkill>, String> {
    let token = get_github_token();
    commands::search_github::search_github_skills(&query, limit.unwrap_or(30), if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn search_github_repos(query: String, limit: Option<u32>) -> Result<Vec<RemoteSkill>, String> {
    let token = get_github_token();
    commands::search_github::search_github_repos(&query, limit.unwrap_or(30), if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_repo_readme(repo_full_name: String) -> Result<String, String> {
    let token = get_github_token();
    commands::fetch::fetch_github_repo_readme(&repo_full_name, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_skill_md(repo_full_name: String, skill_path: String) -> Result<String, String> {
    let token = get_github_token();
    commands::fetch::fetch_github_skill_md(&repo_full_name, &skill_path, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_readme_only(repo_full_name: String) -> Result<String, String> {
    let token = get_github_token();
    commands::fetch::fetch_github_readme_only(&repo_full_name, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_skill_md_root(repo_full_name: String) -> Result<String, String> {
    let token = get_github_token();
    commands::fetch::fetch_github_skill_md_root(&repo_full_name, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_repo_info(repo_full_name: String) -> Result<RepoInfo, String> {
    let token = get_github_token();
    commands::fetch::fetch_github_repo_info(&repo_full_name, if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn test_github_token(token: String) -> Result<(), String> {
    commands::fetch::test_github_token(&token).await
}

#[tauri::command(rename_all = "camelCase")]
async fn get_github_rate_limit() -> Result<commands::fetch::GithubRateLimit, String> {
    let token = get_github_token();
    commands::fetch::get_github_rate_limit(if token.is_empty() { None } else { Some(&token) }).await
}

#[tauri::command(rename_all = "camelCase")]
async fn fetch_github_repos_info_batch(repo_full_names: Vec<String>) -> Result<std::collections::HashMap<String, RepoInfo>, String> {
    let token = get_github_token();
    Ok(commands::fetch::fetch_github_repos_info_batch(&repo_full_names, if token.is_empty() { None } else { Some(&token) }).await)
}

// ─── Config Commands ─────────────────────────────────────────────────────

fn config_path() -> std::path::PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("config.json")
}

/// Generate a random 64-hex-char bearer token for the local HTTP gateway.
fn generate_token() -> String {
    let mut buf = [0u8; 32];
    let _ = getrandom::getrandom(&mut buf);
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
fn get_app_data_dir() -> String {
    dirs::data_dir()
        .unwrap_or_default()
        .join("trae-skill-manager")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
fn get_config() -> AppConfig {
    use crate::models::{GithubConfig, TranslationConfig};

    // Detect the actual skills directory
    let detected_skills_path = detect_skills_path();

    let default = AppConfig {
        global_skills_path: detected_skills_path,
        project_path: String::new(),
        theme: "dark".to_string(),
        accent_color: Some("0,255,136".to_string()),
        language: Some("system".to_string()),
        translation: TranslationConfig {
            enabled: false,
            target_language: "zh".to_string(),
            api_key: String::new(),
            api_base: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            use_immersive: false,
        },
        github: GithubConfig {
            token: String::new(),
        },
        active_tool_id: "trae".to_string(),
        local_api: LocalApiConfig {
            enabled: false,
            port: 18765,
            token: String::new(),
        },
    };

    // Try to load from config file
    if let Ok(content) = std::fs::read_to_string(config_path()) {
        if let Ok(mut saved) = serde_json::from_str::<AppConfig>(&content) {
            // If saved path is empty, use detected path
            if saved.global_skills_path.is_empty() {
                saved.global_skills_path = default.global_skills_path.clone();
            }
            // Ensure translation config exists (backward compatibility)
            if saved.translation.api_base.is_empty() {
                saved.translation.api_base = default.translation.api_base.clone();
            }
            if saved.translation.model.is_empty() {
                saved.translation.model = default.translation.model.clone();
            }
            return saved;
        }
    }
    default
}

/// Auto-detect the TRAE skills directory by checking common locations.
fn detect_skills_path() -> String {
    utils::path::detect_skills_path()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, &json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

#[tauri::command]
fn export_skills(skills: Vec<LocalSkill>, export_path: String) -> Result<(), String> {
    commands::export::export_skills(skills, &export_path)
}

#[tauri::command]
fn import_skills(import_path: String) -> Result<Vec<commands::export::ExportedSkill>, String> {
    commands::export::import_skills(&import_path)
}

// ─── MCP Commands ─────────────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn mcp_test_connection(config: commands::mcp::McpConnectionConfig) -> Result<commands::mcp::McpTestResult, String> {
    commands::mcp::mcp_test_connection(config).await
}

#[tauri::command(rename_all = "camelCase")]
async fn mcp_start_server(
    app: tauri::AppHandle,
    server_id: String,
    config: commands::mcp::McpConnectionConfig,
) -> Result<u32, String> {
    commands::mcp::mcp_start_server(app, server_id, config).await
}

#[tauri::command]
async fn mcp_stop_server(pid: u32) -> Result<(), String> {
    commands::mcp::mcp_stop_server(pid).await
}

#[tauri::command(rename_all = "camelCase")]
fn mcp_export_config(servers: Vec<serde_json::Value>, export_path: String) -> Result<(), String> {
    commands::mcp::mcp_export_config(servers, export_path)
}

// ─── MCP Cross-Tool Sync Commands (Phase 6) ───────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn mcp_get_targets(project_path: Option<String>) -> Vec<commands::mcp_sync::McpTargetInfo> {
    commands::mcp_sync::mcp_get_targets(project_path)
}

#[tauri::command(rename_all = "camelCase")]
fn mcp_write_servers(
    servers: Vec<commands::mcp::McpConnectionConfig>,
    tool_ids: Vec<String>,
    project_path: Option<String>,
    overwrite_conflicts: bool,
) -> Vec<commands::mcp_sync::McpWriteResult> {
    commands::mcp_sync::mcp_write_servers(servers, tool_ids, project_path, overwrite_conflicts)
}

#[tauri::command(rename_all = "camelCase")]
fn mcp_read_servers(
    tool_id: String,
    project_path: Option<String>,
) -> Result<Vec<commands::mcp::McpConnectionConfig>, String> {
    commands::mcp_sync::mcp_read_servers(tool_id, project_path)
}

// ─── Update Commands ──────────────────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn check_for_updates(skill_paths: Vec<String>) -> Result<Vec<models::UpdateCheckResult>, String> {
    Ok(commands::update::check_for_updates(skill_paths).await)
}

#[tauri::command(rename_all = "camelCase")]
async fn update_skill_streamed(
    app: tauri::AppHandle,
    skill_path: String,
) -> Result<models::UpdateResult, String> {
    commands::update::update_skill_streamed(app, skill_path).await
}

#[tauri::command(rename_all = "camelCase")]
fn rollback_skill(skill_path: String) -> Result<models::UpdateResult, String> {
    commands::update::rollback_skill(skill_path)
}

// ─── Diagnosis Commands (Phase 7.1) ───────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn diagnose_skills(tool_id: Option<String>) -> Result<models::SkillDiagnosisResult, String> {
    commands::diagnose::diagnose_skills(tool_id.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
fn get_telemetry_config() -> models::TelemetryConfig {
    commands::diagnose::get_telemetry_config()
}

#[tauri::command(rename_all = "camelCase")]
fn set_telemetry_config(config: models::TelemetryConfig) -> Result<(), String> {
    commands::diagnose::set_telemetry_config(config)
}

// ─── Preset Commands (Phase 7.3) ──────────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
fn list_presets() -> Vec<models::SkillPreset> {
    commands::preset::list_presets()
}

#[tauri::command(rename_all = "camelCase")]
fn export_preset(preset: models::SkillPreset, export_path: String) -> Result<(), String> {
    commands::preset::export_preset(&preset, &export_path)
}

#[tauri::command(rename_all = "camelCase")]
fn import_preset(import_path: String) -> Result<models::SkillPreset, String> {
    commands::preset::import_preset(&import_path)
}

#[tauri::command(rename_all = "camelCase")]
async fn install_preset(
    preset: models::SkillPreset,
    tool_id: Option<String>,
) -> Result<models::BatchResult, String> {
    commands::preset::install_preset(&preset, tool_id.as_deref()).await
}

// ─── App Update Commands (Phase 8.1) ──────────────────────────────────────

#[tauri::command(rename_all = "camelCase")]
async fn check_app_update(app: tauri::AppHandle) -> Result<models::AppUpdateInfo, String> {
    commands::update::check_app_update(&app).await
}

#[tauri::command(rename_all = "camelCase")]
async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    commands::update::install_app_update(&app).await
}

// ─── Main Entry ──────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Local HTTP gateway is opt-in (Phase 9.1): only starts when
            // explicitly enabled in settings, and is protected by a Bearer
            // token so no other local process can drive the app.
            #[cfg(debug_assertions)]
            {
                let mut config = get_config();
                if config.local_api.enabled {
                    if config.local_api.token.is_empty() {
                        config.local_api.token = generate_token();
                        let _ = save_config(config.clone());
                    }
                    let handle = app.handle().clone();
                    let port = config.local_api.port;
                    let token = config.local_api.token.clone();
                    tauri::async_runtime::spawn(async move {
                        local_api::start(handle, port, token).await;
                    });
                }
            }

            // ─── Window icon: high-res source so the taskbar renders crisply ──
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/256x256.png")) {
                    let _ = window.set_icon(icon);
                }
                set_taskbar_icon(&window);
            }

            // ─── System tray ────────────────────────────────────────────────
            let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("TRAE Skill Manager")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close (main window only)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_local_skills,
            scan_project_skills,
            get_tools_status,
            commands::process::detect_running_tools,
            commands::sync::list_cross_tool_skills,
            commands::sync::sync_skill_to_tool,
            commands::sync::unsync_skill_from_tool,
            fetch_skills,
            search_skills,
            fetch_skill_detail,
            list_repo_skills,
            install_skill_streamed,
            remove_skill,
            toggle_skill,
            browse_skill_files,
            read_file_content,
            add_history_record,
            get_history,
            clear_history,
            get_config,
            save_config,
            get_app_data_dir,
            toggle_devtools,
            open_folder,
            export_skills,
            import_skills,
            translate_skill_descriptions,
            clear_translation_cache,
            search_github_skills,
            search_github_repos,
            fetch_github_repo_readme,
            fetch_github_skill_md,
            fetch_github_readme_only,
            fetch_github_skill_md_root,
            fetch_github_repo_info,
            test_github_token,
            get_github_rate_limit,
            fetch_github_repos_info_batch,
            check_for_updates,
            update_skill_streamed,
            rollback_skill,
            diagnose_skills,
            get_telemetry_config,
            set_telemetry_config,
            list_presets,
            export_preset,
            import_preset,
            install_preset,
            check_app_update,
            install_app_update,
            mcp_test_connection,
            mcp_start_server,
            mcp_stop_server,
            mcp_export_config,
            mcp_get_targets,
            mcp_write_servers,
            mcp_read_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
