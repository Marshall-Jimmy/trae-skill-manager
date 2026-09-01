// Local HTTP command gateway (Phase 9.1): exposes backend commands over a
// local port for CLI / MCP / external tooling. Defaults to disabled and is
// protected by a Bearer token so no other local process can drive the app.
use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;

/// Newtype wrapper around `AppHandle`.
///
/// rustc 1.98.0 ICEs while proving the internal
/// `Mutex<HashMap<String, Window>>: Send` obligation of `AppHandle` during
/// axum `with_state` type-checking. `AppHandle` is genuinely `Send + Sync` in
/// Tauri 2, so asserting it manually is safe and only works around the
/// compiler bug.
#[derive(Clone)]
pub struct SendAppHandle(AppHandle);

unsafe impl Send for SendAppHandle {}
unsafe impl Sync for SendAppHandle {}

impl SendAppHandle {
    pub fn get(&self) -> AppHandle {
        self.0.clone()
    }
}

#[derive(Clone)]
pub struct LocalApiState {
    pub app: SendAppHandle,
    pub token: Arc<String>,
}

pub async fn start(app: AppHandle, port: u16, token: String) {
    let state = Arc::new(LocalApiState {
        app: SendAppHandle(app),
        token: Arc::new(token),
    });
    let router = router(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[local-api] Failed to bind {}: {}", addr, e);
            return;
        }
    };
    eprintln!("[local-api] Listening on http://{}", addr);

    if let Err(e) = axum::serve(listener, router).await {
        eprintln!("[local-api] Server error: {}", e);
    }
}

pub fn router(state: Arc<LocalApiState>) -> Router {
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);
    Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/api/command", post(execute_command))
        .layer(middleware::from_fn_with_state(state.clone(), auth))
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

/// Bearer-token auth: /health stays open for probing, everything else must
/// present a valid `Authorization: Bearer <token>` header.
async fn auth(
    State(state): State<Arc<LocalApiState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let is_health = req.uri().path() == "/health";
    if is_health {
        return Ok(next.run(req).await);
    }
    let authorized = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t == state.token.as_str())
        .unwrap_or(false);
    if authorized {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn index() -> Json<Value> {
    Json(json!({
        "name": "trae-skill-manager local api",
        "usage": "POST /api/command with {\"action\":\"<name>\",\"args\":{...}} and Authorization: Bearer <token>",
        "commands": [
            {"action": "fetch_skills", "args": {"view": "trending|browse|popular", "page": 0, "per_page": 100}},
            {"action": "search_skills", "args": {"query": "supabase", "limit": 30}},
            {"action": "search_github_skills", "args": {"query": "supabase", "limit": 30}},
            {"action": "search_github_repos", "args": {"query": "supabase", "limit": 30}},
            {"action": "list_repo_skills", "args": {"source": "supabase/agent-skills"}},
            {"action": "fetch_github_repo_info", "args": {"repo_full_name": "supabase/agent-skills"}},
            {"action": "fetch_github_repo_readme", "args": {"repo_full_name": "supabase/agent-skills"}},
            {"action": "fetch_github_skill_md", "args": {"repo_full_name": "supabase/agent-skills", "skill_path": "skills/supabase-postgres-best-practices"}},
            {"action": "fetch_github_readme_only", "args": {"repo_full_name": "supabase/agent-skills"}},
            {"action": "fetch_github_skill_md_root", "args": {"repo_full_name": "supabase/agent-skills"}},
            {"action": "fetch_github_repos_info_batch", "args": {"repo_full_names": ["supabase/agent-skills", "vercel-labs/agent-skills"]}},
            {"action": "scan_local_skills", "args": {"path": ""}},
            {"action": "scan_project_skills", "args": {"project_path": ""}},
            {"action": "fetch_skill_detail", "args": {"source": "supabase/agent-skills", "slug": "supabase"}},
            {"action": "browse_skill_files", "args": {"path": ""}},
            {"action": "read_file_content", "args": {"path": ""}},
            {"action": "get_config", "args": {}},
            {"action": "save_config", "args": {"config": {"global_skills_path": "", "project_path": "", "theme": "dark", "translation": {}, "github": {}}}},
            {"action": "get_history", "args": {}},
            {"action": "add_history_record", "args": {"record": {"id": "test-1", "action": "install", "skill_name": "supabase", "source": "supabase/agent-skills", "timestamp": 0, "success": true, "message": "test"}}},
            {"action": "clear_history", "args": {}},
            {"action": "open_folder", "args": {"path": "C:/Users/cronu/.trae-cn/skills"}},
            {"action": "export_skills", "args": {"skills": [], "export_path": ""}},
            {"action": "import_skills", "args": {"import_path": ""}},
            {"action": "translate_skill_descriptions", "args": {"texts": [], "target_language": "zh", "api_key": "", "api_base": "", "model": ""}},
            {"action": "clear_translation_cache", "args": {}},
            {"action": "check_for_updates", "args": {"skill_paths": []}},
            {"action": "update_skill_streamed", "args": {"skill_path": ""}},
            {"action": "rollback_skill", "args": {"skill_path": ""}},
            {"action": "test_github_token", "args": {"token": ""}},
            {"action": "install_skill_streamed", "args": {"source": "supabase/agent-skills", "skill_name": "supabase-postgres-best-practices", "target_path": "", "skill_path_hint": ""}},
            {"action": "remove_skill", "args": {"path": ""}},
            {"action": "toggle_skill", "args": {"skill_path": ""}}
        ]
    }))
}

async fn health() -> Json<Value> {
    Json(json!({"status": "ok"}))
}

fn get_github_token() -> String {
    let data_dir = dirs::data_dir().unwrap_or_default();
    let config_path = data_dir.join("trae-skill-manager").join("config.json");
    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(config) = serde_json::from_str::<crate::models::AppConfig>(&content) {
            return config.github.token;
        }
    }
    String::new()
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn arg_opt_str(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn arg_u32(args: &Value, key: &str) -> Option<u32> {
    args.get(key).and_then(|v| v.as_u64()).map(|v| v as u32)
}

fn to_value<T: serde::Serialize>(v: T) -> Value {
    serde_json::to_value(v).unwrap_or(json!(null))
}

async fn execute_command(
    State(state): State<Arc<LocalApiState>>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let start = Instant::now();
    let action = payload
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let args = payload.get("args").cloned().unwrap_or(json!({}));

    let token = get_github_token();
    let token_opt: Option<&str> = if token.is_empty() { None } else { Some(&token) };

    let result: Result<Value, String> = match action.as_str() {
        "fetch_skills" => {
            let view = arg_opt_str(&args, "view");
            let page = arg_u32(&args, "page");
            let per_page = arg_u32(&args, "per_page");
            crate::commands::fetch::fetch_skills(view, page, per_page, token_opt)
                .await
                .map(to_value)
        }
        "search_skills" => {
            let query = arg_str(&args, "query");
            let limit = arg_u32(&args, "limit");
            crate::commands::fetch::search_skills(&query, limit, token_opt)
                .await
                .map(to_value)
        }
        "search_github_skills" => {
            let query = arg_str(&args, "query");
            let limit = arg_u32(&args, "limit");
            crate::commands::search_github::search_github_skills(
                &query,
                limit.unwrap_or(30),
                token_opt,
            )
            .await
            .map(to_value)
        }
        "search_github_repos" => {
            let query = arg_str(&args, "query");
            let limit = arg_u32(&args, "limit");
            crate::commands::search_github::search_github_repos(
                &query,
                limit.unwrap_or(30),
                token_opt,
            )
            .await
            .map(to_value)
        }
        "list_repo_skills" => {
            let source = arg_str(&args, "source");
            crate::commands::fetch::list_repo_skills(&source, token_opt)
                .await
                .map(to_value)
        }
        "fetch_github_repo_info" => {
            let repo = arg_str(&args, "repo_full_name");
            crate::commands::fetch::fetch_github_repo_info(&repo, token_opt)
                .await
                .map(to_value)
        }
        "fetch_github_repo_readme" => {
            let repo = arg_str(&args, "repo_full_name");
            crate::commands::fetch::fetch_github_repo_readme(&repo, token_opt)
                .await
                .map(Value::String)
        }
        "fetch_github_skill_md" => {
            let repo = arg_str(&args, "repo_full_name");
            let path = arg_str(&args, "skill_path");
            crate::commands::fetch::fetch_github_skill_md(&repo, &path, token_opt)
                .await
                .map(Value::String)
        }
        "fetch_github_readme_only" => {
            let repo = arg_str(&args, "repo_full_name");
            crate::commands::fetch::fetch_github_readme_only(&repo, token_opt)
                .await
                .map(Value::String)
        }
        "fetch_github_skill_md_root" => {
            let repo = arg_str(&args, "repo_full_name");
            crate::commands::fetch::fetch_github_skill_md_root(&repo, token_opt)
                .await
                .map(Value::String)
        }
        "fetch_github_repos_info_batch" => {
            let repos: Vec<String> = args
                .get("repo_full_names")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Ok(to_value(
                crate::commands::fetch::fetch_github_repos_info_batch(&repos, token_opt).await,
            ))
        }
        "scan_local_skills" => {
            let path = arg_opt_str(&args, "path");
            let scan_path = match path {
                Some(p) => std::path::PathBuf::from(p),
                None => crate::utils::path::detect_skills_path(),
            };
            Ok(to_value(crate::commands::scan::scan_directory(&scan_path)))
        }
        "get_config" => {
            let data_dir = dirs::data_dir().unwrap_or_default();
            let config_path = data_dir.join("trae-skill-manager").join("config.json");
            match std::fs::read_to_string(&config_path) {
                Ok(content) => match serde_json::from_str::<Value>(&content) {
                    Ok(config) => Ok(config),
                    Err(e) => Err(format!("Failed to parse config: {}", e)),
                },
                Err(e) => Err(format!("Failed to read config: {}", e)),
            }
        }
        "get_history" => crate::commands::history::get_history().map(to_value),
        "add_history_record" => {
            let record: crate::models::InstallRecord = match serde_json::from_value(
                args.get("record").cloned().unwrap_or(json!({})),
            ) {
                Ok(r) => r,
                Err(e) => {
                    return (
                        StatusCode::OK,
                        Json(json!({"ok": false, "action": action, "duration_ms": start.elapsed().as_millis(), "error": format!("Invalid record: {}", e)})),
                    )
                }
            };
            crate::commands::history::add_history_record(record).map(|()| json!({"added": true}))
        }
        "open_folder" => {
            let path = arg_str(&args, "path");
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map(|_| json!({"opened": true}))
                .map_err(|e| format!("Failed to open folder: {}", e))
        }
        "test_github_token" => {
            let t = arg_str(&args, "token");
            let result = if t.is_empty() {
                crate::commands::fetch::test_github_token(&token).await
            } else {
                crate::commands::fetch::test_github_token(&t).await
            };
            match result {
                Ok(()) => Ok(json!({"valid": true})),
                Err(e) => Err(e),
            }
        }
        "install_skill_streamed" => {
            let source = arg_str(&args, "source");
            let skill_name = arg_str(&args, "skill_name");
            let target_path = arg_opt_str(&args, "target_path");
            let hint = arg_opt_str(&args, "skill_path_hint");
            let tool_id = arg_opt_str(&args, "tool_id");
            crate::commands::install::install_skill_streamed(
                state.app.get(),
                &source,
                &skill_name,
                target_path.as_deref(),
                hint.as_deref(),
                tool_id.as_deref(),
            )
            .await
            .map(to_value)
        }
        "remove_skill" => {
            let path = arg_str(&args, "path");
            crate::commands::remove::remove_skill(&path).map(Value::Bool)
        }
        "toggle_skill" => {
            let path = arg_str(&args, "skill_path");
            crate::commands::toggle::toggle_skill(&path).map(to_value)
        }
        "scan_project_skills" => {
            let path = arg_str(&args, "project_path");
            let tool_id = arg_opt_str(&args, "tool_id");
            let tool = crate::tools::get_tool(tool_id.as_deref().unwrap_or("trae"))
                .unwrap_or_else(crate::tools::default_tool);
            Ok(to_value(crate::commands::scan::scan_project_skills(&path, tool)))
        }
        "fetch_skill_detail" => {
            let source = arg_str(&args, "source");
            let slug = arg_str(&args, "slug");
            crate::commands::fetch::fetch_skill_detail(&source, &slug, token_opt)
                .await
                .map(to_value)
        }
        "browse_skill_files" => {
            let path = arg_str(&args, "path");
            crate::commands::browse::browse_skill_files(&path).map(to_value)
        }
        "read_file_content" => {
            let path = arg_str(&args, "path");
            crate::commands::browse::read_file_content(&path).map(Value::String)
        }
        "clear_history" => crate::commands::history::clear_history().map(|()| json!({"cleared": true})),
        "save_config" => {
            let config: crate::models::AppConfig = match serde_json::from_value(
                args.get("config").cloned().unwrap_or(json!({})),
            ) {
                Ok(c) => c,
                Err(e) => return (StatusCode::OK, Json(json!({"ok": false, "action": action, "duration_ms": start.elapsed().as_millis(), "error": format!("Invalid config: {}", e)}))),
            };
            let data_dir = dirs::data_dir().unwrap_or_default();
            let config_path = data_dir.join("trae-skill-manager").join("config.json");
            (|| -> Result<Value, String> {
                if let Some(parent) = config_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create config dir: {}", e))?;
                }
                let json_str = serde_json::to_string_pretty(&config)
                    .map_err(|e| format!("Failed to serialize config: {}", e))?;
                std::fs::write(&config_path, json_str)
                    .map_err(|e| format!("Failed to write config: {}", e))?;
                Ok(json!({"saved": true}))
            })()
        }
        "export_skills" => {
            let skills: Vec<crate::models::LocalSkill> = args
                .get("skills")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let export_path = arg_str(&args, "export_path");
            crate::commands::export::export_skills(skills, &export_path)
                .map(|()| json!({"exported": true}))
        }
        "import_skills" => {
            let import_path = arg_str(&args, "import_path");
            crate::commands::export::import_skills(&import_path).map(to_value)
        }
        "translate_skill_descriptions" => {
            let texts: Vec<String> = args
                .get("texts")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let target_language = arg_str(&args, "target_language");
            let api_key = arg_str(&args, "api_key");
            let api_base = arg_str(&args, "api_base");
            let model = arg_str(&args, "model");
            let use_immersive = args
                .get("use_immersive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            crate::commands::translate::translate_texts(
                texts,
                &target_language,
                &api_key,
                &api_base,
                &model,
                use_immersive,
            )
            .await
            .map(to_value)
        }
        "clear_translation_cache" => {
            crate::commands::translate::clear_translation_cache().map(|()| json!({"cleared": true}))
        }
        "check_for_updates" => {
            let skill_paths: Vec<String> = args
                .get("skill_paths")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            Ok(to_value(crate::commands::update::check_for_updates(skill_paths).await))
        }
        "update_skill_streamed" => {
            let skill_path = arg_str(&args, "skill_path");
            crate::commands::update::update_skill_streamed(state.app.get(), skill_path)
                .await
                .map(to_value)
        }
        "rollback_skill" => {
            let skill_path = arg_str(&args, "skill_path");
            crate::commands::update::rollback_skill(skill_path).map(to_value)
        }
        _ => Err(format!("Unknown action: {}", action)),
    };

    let duration_ms = start.elapsed().as_millis();
    match result {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "action": action,
                "duration_ms": duration_ms,
                "data": data
            })),
        ),
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false,
                "action": action,
                "duration_ms": duration_ms,
                "error": e
            })),
        ),
    }
}
