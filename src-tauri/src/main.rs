#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod utils;

use models::*;
use std::path::PathBuf;

// ─── Scan Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn scan_local_skills(path: Option<String>) -> Result<Vec<LocalSkill>, String> {
    let scan_path = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let home = dirs::home_dir().ok_or("Cannot find home directory")?;
            home.join(".trae-cn").join("skills")
        }
    };
    Ok(commands::scan::scan_directory(&scan_path))
}

#[tauri::command]
fn scan_project_skills(project_path: String) -> Result<Vec<LocalSkill>, String> {
    Ok(commands::scan::scan_project_skills(&project_path))
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

#[tauri::command(rename_all = "camelCase")]
async fn fetch_skills(view: Option<String>, page: Option<u32>, per_page: Option<u32>) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    let token = get_github_token();
    commands::fetch::fetch_skills(view, page, per_page, if token.is_empty() { None } else { Some(&token) }).await
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
) -> Result<InstallResult, String> {
    commands::install::install_skill_streamed(
        app,
        &source,
        &skill_name,
        target_path.as_deref(),
        skill_path_hint.as_deref(),
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
) -> Result<std::collections::HashMap<String, String>, String> {
    commands::translate::translate_texts(texts, &target_language, &api_key, &api_base, &model).await
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
async fn fetch_github_repos_info_batch(repo_full_names: Vec<String>) -> Result<std::collections::HashMap<String, RepoInfo>, String> {
    let token = get_github_token();
    Ok(commands::fetch::fetch_github_repos_info_batch(&repo_full_names, if token.is_empty() { None } else { Some(&token) }).await)
}

// ─── Config Commands ─────────────────────────────────────────────────────

fn config_path() -> std::path::PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("config.json")
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
        translation: TranslationConfig {
            enabled: false,
            target_language: "zh".to_string(),
            api_key: String::new(),
            api_base: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
        },
        github: GithubConfig {
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

// ─── Main Entry ──────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_local_skills,
            scan_project_skills,
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
            fetch_github_repos_info_batch,
            check_for_updates,
            update_skill_streamed,
            rollback_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
