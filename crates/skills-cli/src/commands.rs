//! skillctl 各命令处理器：统一返回 `serde_json::Value`（JSON 模式数据），
//! 人类可读格式由 main.rs 的 formatter 负责。

use skills_core::event::{EventSink, InstallOutputEvent, NullSink, SharedSink};
use skills_core::models::{
    InstallResult, LocalSkill, RecommendResult, RemoteSkill, SkillDetail, SkillDiagnosisResult,
    ToolStatus,
};
use skills_core::{
    config, diagnose, fetch, install, process, recommend, remove, scan, toggle, tools, update,
};
use std::path::Path;
use std::sync::Arc;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

/// 全局上下文：由 CLI 全局参数填充。
#[derive(Clone)]
pub struct Ctx {
    pub tool: Option<String>,
    pub project: Option<String>,
    pub yes: bool,
    pub dry_run: bool,
    pub no_network: bool,
    pub quiet: bool,
    pub json: bool,
}

impl Ctx {
    /// 目标工具 id（--tool 优先，否则读配置的 active_tool_id，默认 trae）。
    pub fn tool_id(&self) -> String {
        if let Some(t) = &self.tool {
            return t.clone();
        }
        let cfg = config::load_config();
        if cfg.active_tool_id.is_empty() {
            "trae".to_string()
        } else {
            cfg.active_tool_id
        }
    }

    /// 解析安装目标技能目录：--project 给项目级，否则全局。
    fn resolve_skills_dir(&self, tool_id: &str) -> Result<std::path::PathBuf, String> {
        let tool = tools::get_tool(tool_id).ok_or_else(|| format!("未知工具: {}", tool_id))?;
        if let Some(proj) = &self.project {
            if proj.trim().is_empty() {
                return Err("--project 路径不能为空".to_string());
            }
            return Ok(tool.project_dir(Path::new(proj)));
        }
        tool.global_dir()
            .ok_or_else(|| "无法确定技能目录，请检查工具是否已安装".to_string())
    }

    /// 从配置读取 GitHub token。
    fn token(&self) -> Option<String> {
        if self.no_network {
            return None;
        }
        let cfg = config::load_config();
        if cfg.github.token.is_empty() {
            None
        } else {
            Some(cfg.github.token)
        }
    }
}

/// 把 CLI 进度事件打到 stderr（避免污染 stdout 的 JSON 输出）。
struct CliSink {
    quiet: bool,
}

impl EventSink for CliSink {
    fn emit(&self, event: InstallOutputEvent) {
        if self.quiet {
            return;
        }
        match event {
            InstallOutputEvent::Stdout { data } => eprintln!("{}", data),
            InstallOutputEvent::Stderr { data } => eprintln!("{}", data),
            InstallOutputEvent::Done { .. } => {}
        }
    }
}

fn sink(ctx: &Ctx) -> SharedSink {
    if ctx.quiet {
        Arc::new(NullSink)
    } else {
        Arc::new(CliSink { quiet: false })
    }
}

/// 解析安装/详情目标：`owner/repo/skill` → (source, slug)。
/// `owner/repo` → (source, "") 表示仓库根技能。
pub fn parse_target(target: &str) -> (String, String) {
    let parts: Vec<&str> = target.split('/').collect();
    if parts.len() >= 3 {
        let source = parts[..2].join("/");
        let slug = parts[2..].join("/");
        (source, slug)
    } else {
        (target.to_string(), String::new())
    }
}

/// 在技能目录中按名称查找技能路径。
fn find_skill_path(skills_dir: &Path, name: &str) -> Option<std::path::PathBuf> {
    let dir = skills_dir.join(name);
    if dir.is_dir() {
        return Some(dir);
    }
    // 模糊匹配：忽略大小写 / 连字符
    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let n = p.file_name().map(|f| f.to_string_lossy().to_lowercase());
            if n.as_deref() == Some(&name.to_lowercase()) {
                return Some(p);
            }
        }
    }
    None
}

// ─── 发现类命令 ───────────────────────────────────────────────────────────

pub async fn search(ctx: &Ctx, query: &str, limit: Option<u32>) -> Result<serde_json::Value, String> {
    let token = ctx.token();
    let skills = if ctx.no_network {
        offline_search(query)
    } else {
        fetch::search_skills(query, limit, token.as_deref())
            .await
            .map(|r| r.data)?
    };
    let skills = apply_limit(skills, limit);
    Ok(serde_json::to_value(skills).map_err(|e| e.to_string())?)
}

/// 离线搜索：只用本地缓存，按关键词相关性过滤。
fn offline_search(query: &str) -> Vec<RemoteSkill> {
    let q = query.trim().to_lowercase();
    let terms = fetch::expand_query_aliases(&q);
    let mut out: Vec<RemoteSkill> = fetch::read_cache_allow_stale()
        .unwrap_or_default()
        .into_iter()
        .filter(|s| fetch::relevance_score(s, &terms) > 0)
        .collect();
    out.sort_by(|a, b| {
        let ra = fetch::relevance_score(a, &terms);
        let rb = fetch::relevance_score(b, &terms);
        rb.cmp(&ra).then_with(|| b.installs.cmp(&a.installs))
    });
    out
}

fn apply_limit(mut skills: Vec<RemoteSkill>, limit: Option<u32>) -> Vec<RemoteSkill> {
    if let Some(n) = limit {
        skills.truncate(n.max(1) as usize);
    }
    skills
}

pub async fn info(ctx: &Ctx, target: &str) -> Result<serde_json::Value, String> {
    let (source, slug) = parse_target(target);
    if source.is_empty() {
        return Err("目标格式应为 <source>/<slug>，例如 anthropics/skills/pdf".to_string());
    }
    let token = ctx.token();
    let detail = fetch::fetch_skill_detail(&source, &slug, token.as_deref()).await?;
    Ok(serde_json::to_value(detail).map_err(|e| e.to_string())?)
}

pub async fn trending(ctx: &Ctx, limit: Option<u32>) -> Result<serde_json::Value, String> {
    let token = ctx.token();
    let skills = if ctx.no_network {
        let mut all = fetch::read_cache_allow_stale().unwrap_or_default();
        all = fetch::sort_skills(all, Some("trending"));
        all
    } else {
        fetch::fetch_skills(Some("trending".to_string()), None, None, token.as_deref())
            .await
            .map(|r| r.data)?
    };
    let skills = apply_limit(skills, limit);
    Ok(serde_json::to_value(skills).map_err(|e| e.to_string())?)
}

pub async fn recommend(
    ctx: &Ctx,
    task: &str,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let token = ctx.token();
    let result = recommend::recommend_skills(task, limit, token.as_deref()).await?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

// ─── 管理类命令 ───────────────────────────────────────────────────────────

pub fn list(ctx: &Ctx) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let tool = tools::get_tool(&tool_id).ok_or_else(|| format!("未知工具: {}", tool_id))?;
    let mut skills: Vec<LocalSkill> = Vec::new();
    if let Some(proj) = &ctx.project {
        if !proj.trim().is_empty() {
            skills = scan::scan_project_skills(proj, tool);
        }
    } else if let Some(dir) = tool.global_dir() {
        skills = scan::scan_directory(&dir);
    }
    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(serde_json::to_value(skills).map_err(|e| e.to_string())?)
}

pub async fn install(ctx: &Ctx, target: &str) -> Result<serde_json::Value, String> {
    let (source, slug) = parse_target(target);
    if source.is_empty() {
        return Err("安装目标格式应为 <source>/<slug>，例如 anthropics/skills/pdf".to_string());
    }
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;

    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "source": source,
            "skill": if slug.is_empty() { source.clone() } else { slug.clone() },
            "target": skills_dir.to_string_lossy(),
            "tool": tool_id,
            "scope": if ctx.project.is_some() { "project" } else { "global" },
        }));
    }

    if !ctx.yes {
        let label = if slug.is_empty() {
            source.clone()
        } else {
            format!("{}/{}", source, slug)
        };
        let scope = if ctx.project.is_some() { "项目级" } else { "全局" };
        eprintln!("将安装 {}，来自 {}，目标 {}（{}）", label, source, skills_dir.display(), scope);
        if !confirm("确认安装？") {
            return Err("已取消安装".to_string());
        }
    }

    let target_str = skills_dir.to_string_lossy().to_string();
    let result = install::install_skill_streamed(
        sink(ctx),
        &source,
        &slug,
        Some(&target_str),
        None,
        Some(&tool_id),
        Some("cli"),
    )
    .await?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

pub fn remove(ctx: &Ctx, name: &str) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;
    let path = find_skill_path(&skills_dir, name)
        .ok_or_else(|| format!("未找到已安装技能: {}（目录 {}）", name, skills_dir.display()))?;

    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "name": name,
            "path": path.to_string_lossy(),
            "tool": tool_id,
        }));
    }

    if !ctx.yes {
        eprintln!("将删除技能目录: {}", path.display());
        if !confirm("确认卸载？此操作不可恢复") {
            return Err("已取消卸载".to_string());
        }
    }

    let removed = remove::remove_skill(&path.to_string_lossy(), Some("cli"))?;
    Ok(serde_json::json!({
        "success": removed,
        "name": name,
        "path": path.to_string_lossy(),
    }))
}

pub async fn update(ctx: &Ctx, name: Option<&str>) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;

    let paths: Vec<String> = match name {
        Some(n) => {
            let p = find_skill_path(&skills_dir, n)
                .ok_or_else(|| format!("未找到已安装技能: {}", n))?;
            vec![p.to_string_lossy().to_string()]
        }
        None => {
            let skills = scan::scan_directory(&skills_dir);
            if skills.is_empty() {
                return Ok(serde_json::json!({ "updated": [], "message": "没有已安装的技能" }));
            }
            skills.into_iter().map(|s| s.path).collect()
        }
    };

    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "skills": paths,
            "tool": tool_id,
        }));
    }

    let mut updated = Vec::new();
    for p in paths {
        match update::update_skill_streamed(sink(ctx), p.clone()).await {
            Ok(r) => updated.push(serde_json::json!({
                "skill": r.skill_name,
                "success": r.success,
                "path": r.skill_path,
                "error": r.error,
            })),
            Err(e) => updated.push(serde_json::json!({
                "skill": Path::new(&p).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(),
                "success": false,
                "error": e,
            })),
        }
    }
    Ok(serde_json::json!({ "updated": updated }))
}

pub fn rollback(ctx: &Ctx, name: &str) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;
    let path = find_skill_path(&skills_dir, name)
        .ok_or_else(|| format!("未找到已安装技能: {}", name))?;

    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "name": name,
            "path": path.to_string_lossy(),
        }));
    }

    let result = update::rollback_skill(path.to_string_lossy().to_string())?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

pub fn toggle_skill(ctx: &Ctx, name: &str, enable: bool) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;
    let path = find_skill_path(&skills_dir, name)
        .ok_or_else(|| format!("未找到已安装技能: {}", name))?;

    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "name": name,
            "action": if enable { "enable" } else { "disable" },
        }));
    }

    let current = skills_core::toggle::is_skill_enabled(&path.to_string_lossy());
    if current == enable {
        return Ok(serde_json::json!({
            "success": true,
            "name": name,
            "enabled": current,
            "message": if enable { "技能已处于启用状态" } else { "技能已处于禁用状态" },
        }));
    }
    let result = toggle::toggle_skill(&path.to_string_lossy())?;
    Ok(result)
}

// ─── 环境类命令 ───────────────────────────────────────────────────────────

pub fn tools(ctx: &Ctx) -> Result<serde_json::Value, String> {
    let running = process::detect_running_tools_internal();
    let running_ids: std::collections::HashSet<String> =
        running.iter().map(|r| r.tool_id.clone()).collect();

    let mut statuses: Vec<ToolStatus> = Vec::new();
    for t in tools::all_tools() {
        let global = t.global_dir().map(|d| d.to_string_lossy().to_string());
        let project_dir = t
            .adapter()
            .project_dir
            .to_string();
        statuses.push(ToolStatus {
            id: t.id().to_string(),
            display_name: t.display_name().to_string(),
            icon: t.icon().to_string(),
            installed: t.detect_installed(),
            running: running_ids.contains(t.id()),
            global_dir: global,
            project_dir,
        });
    }
    if ctx.project.is_some() {
        // 项目级安装时同时返回项目技能目录
        for s in &mut statuses {
            if let Some(proj) = &ctx.project {
                let t = tools::get_tool(&s.id);
                if let Some(t) = t {
                    s.project_dir = t.project_dir(Path::new(proj)).to_string_lossy().to_string();
                }
            }
        }
    }
    Ok(serde_json::to_value(statuses).map_err(|e| e.to_string())?)
}

pub fn doctor(ctx: &Ctx) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let result: SkillDiagnosisResult = diagnose::diagnose_skills(Some(&tool_id))?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

// ─── 批量（Preset）命令 ────────────────────────────────────────────────────

pub fn pack_export(_ctx: &Ctx, file: &str) -> Result<serde_json::Value, String> {
    let presets = skills_core::preset::list_presets();
    if presets.is_empty() {
        return Err("没有可导出的技能栈配方".to_string());
    }
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("导出失败: {}", e))?;
    Ok(serde_json::json!({ "exported": file, "presets": presets.len() }))
}

pub async fn pack_import(ctx: &Ctx, file: &str) -> Result<serde_json::Value, String> {
    let preset = skills_core::preset::import_preset(file)?;
    if ctx.dry_run {
        return Ok(serde_json::json!({
            "dryRun": true,
            "preset": preset.name,
            "skills": preset.skills.len(),
        }));
    }
    let tool_id = ctx.tool_id();
    let result = skills_core::preset::install_preset(&preset, Some(&tool_id)).await?;
    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

/// 读取一行用户确认输入。
fn confirm(prompt: &str) -> bool {
    use std::io::Write;
    eprint!("{} [y/N] ", prompt);
    let _ = std::io::stderr().flush();
    let mut line = String::new();
    if std::io::stdin().read_line(&mut line).is_err() {
        return false;
    }
    let answer = line.trim().to_lowercase();
    answer == "y" || answer == "yes"
}

/// 供 MCP 复用的安装实现（带确认语义由调用方处理）。
pub async fn install_core(
    source: &str,
    slug: &str,
    tool_id: Option<&str>,
    scope: Option<&str>,
) -> Result<InstallResult, String> {
    let tool = tools::get_tool(tool_id.unwrap_or("trae")).unwrap_or_else(tools::default_tool);
    let skills_dir = match scope {
        Some(s) if !s.is_empty() && s != "global" => {
            tool.project_dir(Path::new(s))
        }
        _ => tool.global_dir().ok_or("无法确定技能目录")?,
    };
    let target_str = skills_dir.to_string_lossy().to_string();
    install::install_skill_streamed(
        Arc::new(NullSink),
        source,
        slug,
        Some(&target_str),
        None,
        Some(tool.id()),
        Some("mcp"),
    )
    .await
}

/// 供 MCP 复用的推荐实现。
pub async fn recommend_core(task: &str, limit: Option<u32>) -> Result<RecommendResult, String> {
    let cfg = config::load_config();
    let token = if cfg.github.token.is_empty() {
        None
    } else {
        Some(cfg.github.token.as_str())
    };
    recommend::recommend_skills(task, limit, token).await
}

/// 供 MCP 复用的详情实现。
pub async fn detail_core(source: &str, slug: &str) -> Result<SkillDetail, String> {
    let cfg = config::load_config();
    let token = if cfg.github.token.is_empty() {
        None
    } else {
        Some(cfg.github.token.as_str())
    };
    fetch::fetch_skill_detail(source, slug, token).await
}

// ─── Daemon（后台 HTTP 网关）───────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    ctx: Ctx,
    token: String,
}

/// 启动后台 HTTP 网关：`GET /health`（免认证）+ `POST /api/command`（Bearer 认证）。
/// 复用 CLI 命令处理器，供 GUI/CLI 共享缓存。常驻直到进程退出。
pub async fn daemon(ctx: &Ctx, port: Option<u16>) -> Result<serde_json::Value, String> {
    let cfg = config::load_config();
    let token = cfg.local_api.token.clone();
    let port = port.unwrap_or(cfg.local_api.port);

    let state = AppState {
        ctx: ctx.clone(),
        token,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/command", post(handle_command))
        .with_state(state);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("无法监听 {}: {}", addr, e))?;
    eprintln!("skillctl daemon 已启动: http://{}", addr);
    axum::serve(listener, app)
        .await
        .map_err(|e| format!("网关运行失败: {}", e))?;
    Ok(serde_json::json!({ "daemon": "stopped" }))
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn handle_command(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    // 认证：配置了 token 时必须带 Authorization: Bearer <token>
    if !state.token.is_empty() {
        let authorized = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.strip_prefix("Bearer ").map(|t| t == state.token))
            .flatten()
            .unwrap_or(false);
        if !authorized {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "ok": false, "data": null,
                "error": { "code": 401, "message": "未授权：缺少或错误的 Bearer token" },
                "warnings": []
            })));
        }
    }

    let action = body.get("action").and_then(|a| a.as_str()).unwrap_or("");
    let args = body.get("args").cloned().unwrap_or(json!({}));
    let ctx = &state.ctx;

    let result = match action {
        "search" => {
            let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            commands_search(ctx, q).await
        }
        "recommend" => {
            let task = args.get("task").and_then(|v| v.as_str()).unwrap_or("");
            commands_recommend(ctx, task).await
        }
        "list" => commands_list(ctx),
        "tools" => commands_tools(ctx),
        "doctor" => commands_doctor(ctx),
        "install" => {
            let source = args.get("source").and_then(|v| v.as_str()).unwrap_or("");
            let slug = args.get("slug").and_then(|v| v.as_str()).unwrap_or("");
            commands_install(ctx, source, slug).await
        }
        "remove" => {
            let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
            commands_remove(ctx, name)
        }
        _ => Err(format!("未知 action: {}", action)),
    };

    match result {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "data": data, "error": null, "warnings": [] })),
        ),
        Err(e) => (
            StatusCode::OK,
            Json(json!({
                "ok": false, "data": null,
                "error": { "code": 1, "message": e },
                "warnings": []
            })),
        ),
    }
}

async fn commands_search(ctx: &Ctx, query: &str) -> Result<serde_json::Value, String> {
    search(ctx, query, None).await
}

async fn commands_recommend(ctx: &Ctx, task: &str) -> Result<serde_json::Value, String> {
    recommend(ctx, task, None).await
}

fn commands_list(ctx: &Ctx) -> Result<serde_json::Value, String> {
    list(ctx)
}

fn commands_tools(ctx: &Ctx) -> Result<serde_json::Value, String> {
    tools(ctx)
}

fn commands_doctor(ctx: &Ctx) -> Result<serde_json::Value, String> {
    doctor(ctx)
}

async fn commands_install(
    ctx: &Ctx,
    source: &str,
    slug: &str,
) -> Result<serde_json::Value, String> {
    let tool_id = ctx.tool_id();
    let skills_dir = ctx.resolve_skills_dir(&tool_id)?;
    let target_str = skills_dir.to_string_lossy().to_string();
    let result = install::install_skill_streamed(
        sink(ctx),
        source,
        slug,
        Some(&target_str),
        None,
        Some(&tool_id),
        Some("cli"),
    )
    .await?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

fn commands_remove(ctx: &Ctx, name: &str) -> Result<serde_json::Value, String> {
    remove(ctx, name)
}

// ─── Config（Phase 9.7 源白名单） ──────────────────────────────────────────

/// 查看当前配置（含白名单状态）。
pub fn config_show() -> Result<serde_json::Value, String> {
    let cfg = config::load_config();
    Ok(serde_json::to_value(json!({
        "configPath": config::config_path().to_string_lossy(),
        "globalSkillsPath": cfg.global_skills_path,
        "activeToolId": cfg.active_tool_id,
        "whitelist": {
            "enabled": cfg.whitelist_enabled,
            "origins": cfg.white_listed_origins,
        }
    }))
    .map_err(|e| e.to_string())?)
}

/// 白名单管理：on / off / set / add / remove。
/// 修改后立即写回共享配置文件（GUI 同样读取该文件）。
pub fn config_whitelist(op: &str, value: Option<&str>) -> Result<serde_json::Value, String> {
    let mut cfg = config::load_config();
    match op {
        "on" => cfg.whitelist_enabled = true,
        "off" => cfg.whitelist_enabled = false,
        "set" => {
            let origins = value
                .ok_or("set 需要提供 org 列表，逗号分隔")?
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>();
            if origins.is_empty() {
                return Err("org 列表为空".to_string());
            }
            cfg.white_listed_origins = origins;
            cfg.whitelist_enabled = true;
        }
        "add" => {
            let origin = value
                .ok_or("add 需要提供 org")?
                .trim()
                .to_string();
            if origin.is_empty() {
                return Err("org 不能为空".to_string());
            }
            if !cfg
                .white_listed_origins
                .iter()
                .any(|o| o.eq_ignore_ascii_case(&origin))
            {
                cfg.white_listed_origins.push(origin);
            }
        }
        "remove" => {
            let origin = value.ok_or("remove 需要提供 org")?.trim();
            cfg.white_listed_origins
                .retain(|o| !o.eq_ignore_ascii_case(origin));
        }
        _ => return Err(format!("未知白名单操作: {}（可选 on/off/set/add/remove）", op)),
    }
    config::save_config(&cfg)?;
    Ok(serde_json::to_value(json!({
        "configPath": config::config_path().to_string_lossy(),
        "globalSkillsPath": cfg.global_skills_path,
        "activeToolId": cfg.active_tool_id,
        "whitelist": {
            "enabled": cfg.whitelist_enabled,
            "origins": cfg.white_listed_origins,
        }
    }))
    .map_err(|e| e.to_string())?)
}

// ─── Bootstrap（Phase 9.6 skill-discovery 自举） ───────────────────────────

/// 安装 skill-discovery 到指定工具（或全部已检测工具）。
pub fn bootstrap(ctx: &Ctx) -> Result<serde_json::Value, String> {
    // dry-run：只计算目标路径，不写入（与其他写命令保持一致）
    if ctx.dry_run {
        let results = if let Some(tool_id) = ctx.tool.as_deref() {
            let tool = tools::get_tool(tool_id)
                .ok_or_else(|| format!("未知工具: {}", tool_id))?;
            let path = tool
                .global_dir()
                .map(|d| d.join(skills_core::bootstrap::SKILL_NAME))
                .ok_or_else(|| format!("无法确定 {} 的技能目录", tool.display_name()))?;
            vec![serde_json::json!({
                "tool": tool.id(),
                "installed": true,
                "path": path.to_string_lossy(),
            })]
        } else {
            skills_core::tools::all_tools()
                .iter()
                .filter(|t| t.global_dir().is_some())
                .map(|t| {
                    let path = t
                        .global_dir()
                        .unwrap()
                        .join(skills_core::bootstrap::SKILL_NAME);
                    serde_json::json!({
                        "tool": t.id(),
                        "installed": true,
                        "path": path.to_string_lossy(),
                    })
                })
                .collect()
        };
        return Ok(serde_json::to_value(json!({
            "dryRun": true,
            "skill": skills_core::bootstrap::SKILL_NAME,
            "succeeded": results.len(),
            "results": results,
        }))
        .map_err(|e| e.to_string())?);
    }

    let results = if let Some(tool_id) = ctx.tool.as_deref() {
        let tool = tools::get_tool(tool_id)
            .ok_or_else(|| format!("未知工具: {}", tool_id))?;
        let installed = match skills_core::bootstrap::install_bootstrap(tool) {
            Ok(path) => {
                skills_core::bootstrap::write_bootstrap_history(tool.id(), &path.to_string_lossy());
                serde_json::json!({
                    "tool": tool.id(),
                    "installed": true,
                    "path": path.to_string_lossy(),
                })
            }
            Err(e) => serde_json::json!({
                "tool": tool.id(),
                "installed": false,
                "error": e,
            }),
        };
        vec![installed]
    } else {
        let all = skills_core::bootstrap::install_bootstrap_all()?;
        for r in &all {
            if r["installed"].as_bool().unwrap_or(false) {
                if let (Some(tool), Some(path)) = (r["tool"].as_str(), r["path"].as_str()) {
                    skills_core::bootstrap::write_bootstrap_history(tool, path);
                }
            }
        }
        all
    };
    let succeeded = results
        .iter()
        .filter(|r| r["installed"].as_bool().unwrap_or(false))
        .count();
    Ok(serde_json::to_value(json!({
        "skill": skills_core::bootstrap::SKILL_NAME,
        "succeeded": succeeded,
        "results": results,
    }))
    .map_err(|e| e.to_string())?)
}
