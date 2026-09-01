//! skillctl - TRAE Skill Manager 命令行接口。
//!
//! 统一信封：`{ok, data, error, warnings}`，退出码 0 成功 / 1 业务失败 / 2 参数错误。
//! `--json` 输出机器可读结构（Agent 用），否则输出带颜色的终端友好格式。

mod commands;
mod mcp;

use clap::{Parser, Subcommand};
use colored::Colorize;
use serde::Serialize;
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "skillctl",
    version,
    about = "TRAE Skill Manager - 搜索、安装与管理 Agent Skills / MCP Server",
    disable_help_subcommand = true
)]
struct Cli {
    /// 结构化输出（Agent 解析用）
    #[arg(long, global = true)]
    json: bool,
    /// 指定目标工具（trae|claude-code|cursor|codex），默认跟随配置
    #[arg(long, global = true)]
    tool: Option<String>,
    /// 安装到项目级（传项目路径）；不给则全局
    #[arg(long, global = true)]
    project: Option<String>,
    /// 跳过确认
    #[arg(short, long, global = true)]
    yes: bool,
    /// 只打印将要做什么，不实际执行
    #[arg(long, global = true)]
    dry_run: bool,
    /// 离线模式，只用本地缓存
    #[arg(long, global = true)]
    no_network: bool,
    /// 只输出结果，抑制进度与日志
    #[arg(short, long, global = true)]
    quiet: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// 搜索技能（本地缓存优先，后台刷新）
    Search {
        query: String,
        #[arg(long)]
        limit: Option<u32>,
    },
    /// 查看技能详情，含 SKILL.md 全文
    Info { target: String },
    /// 趋势榜
    Trending {
        #[arg(long)]
        limit: Option<u32>,
    },
    /// 描述任务，推荐技能（带理由）
    Recommend {
        task: String,
        #[arg(long)]
        limit: Option<u32>,
    },
    /// 列出已安装技能（默认当前工具）
    List,
    /// 安装技能 <source>/<slug>
    Install { target: String },
    /// 卸载技能
    Remove { name: String },
    /// 升级技能（不给名字则全部）
    Update { name: Option<String> },
    /// 回滚技能到上一版本
    Rollback { name: String },
    /// 启用技能
    Enable { name: String },
    /// 禁用技能
    Disable { name: String },
    /// 列出检测到的 AI 工具与状态
    Tools,
    /// 技能健康诊断
    Doctor,
    /// MCP Server 子命令
    Mcp {
        #[command(subcommand)]
        command: McpCommand,
    },
    /// 后台 HTTP 网关（供 GUI/CLI 共享缓存）
    Daemon {
        #[arg(long)]
        port: Option<u16>,
    },
    /// 技能栈 Preset 批量操作
    Pack {
        #[command(subcommand)]
        command: PackCommand,
    },
    /// 查看/修改配置（Phase 9.7 源白名单）
    Config {
        #[command(subcommand)]
        command: ConfigCommand,
    },
    /// 安装 skill-discovery 自举技能（给所有检测到的工具，或 --tool 指定）
    Bootstrap,
}

#[derive(Subcommand)]
enum McpCommand {
    /// 以 MCP Stdio Server 启动（给 AI 用）
    Serve,
}

#[derive(Subcommand)]
enum PackCommand {
    /// 导出技能栈 Preset
    Export { file: String },
    /// 导入并批量安装
    Import { file: String },
}

#[derive(Subcommand)]
enum ConfigCommand {
    /// 查看当前配置
    Show,
    /// 源白名单管理（on/off/set/add/remove）
    Whitelist {
        #[command(subcommand)]
        command: WhitelistCommand,
    },
}

#[derive(Subcommand)]
enum WhitelistCommand {
    /// 开启源白名单（仅允许白名单内 org）
    On,
    /// 关闭源白名单
    Off,
    /// 设置允许的来源 org 列表（逗号分隔），并自动开启
    Set { origins: String },
    /// 添加一个来源 org
    Add { origin: String },
    /// 移除一个来源 org
    Remove { origin: String },
}

// ─── 统一信封 ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct EnvelopeError {
    code: i32,
    message: String,
}

#[derive(Serialize)]
struct Envelope<T> {
    ok: bool,
    data: Option<T>,
    error: Option<EnvelopeError>,
    warnings: Vec<String>,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let ctx = commands::Ctx {
        tool: cli.tool,
        project: cli.project,
        yes: cli.yes,
        dry_run: cli.dry_run,
        no_network: cli.no_network,
        quiet: cli.quiet,
        json: cli.json,
    };

    let rt = tokio::runtime::Runtime::new().expect("failed to start tokio runtime");
    let result = rt.block_on(async { dispatch(&ctx, &cli.command).await });

    match result {
        Ok((data, human)) => {
            if cli.json {
                let env = Envelope {
                    ok: true,
                    data: Some(data),
                    error: None,
                    warnings: Vec::new(),
                };
                println!("{}", serde_json::to_string_pretty(&env).unwrap_or_default());
            } else if !cli.quiet {
                println!("{}", human);
            }
            ExitCode::SUCCESS
        }
        Err((code, message)) => {
            if cli.json {
                let env = Envelope::<serde_json::Value> {
                    ok: false,
                    data: None,
                    error: Some(EnvelopeError {
                        code,
                        message: message.clone(),
                    }),
                    warnings: Vec::new(),
                };
                println!("{}", serde_json::to_string_pretty(&env).unwrap_or_default());
            } else {
                eprintln!("{} {}", "错误:".red().bold(), message);
            }
            ExitCode::from(code as u8)
        }
    }
}

type CmdResult = Result<(serde_json::Value, String), (i32, String)>;

/// 静态空数组：避免 `unwrap_or(&EMPTY_ARRAY)` 的临时值借用问题。
static EMPTY_ARRAY: Vec<serde_json::Value> = Vec::new();

async fn dispatch(ctx: &commands::Ctx, cmd: &Command) -> CmdResult {
    match cmd {
        Command::Search { query, limit } => {
            let data = commands::search(ctx, query, *limit)
                .await
                .map_err(business_err)?;
            let human = format_search(&data, query);
            Ok((data, human))
        }
        Command::Info { target } => {
            let data = commands::info(ctx, target).await.map_err(business_err)?;
            let human = format_info(&data);
            Ok((data, human))
        }
        Command::Trending { limit } => {
            let data = commands::trending(ctx, *limit)
                .await
                .map_err(business_err)?;
            let human = format_skill_list(&data, "趋势榜");
            Ok((data, human))
        }
        Command::Recommend { task, limit } => {
            let data = commands::recommend(ctx, task, *limit)
                .await
                .map_err(business_err)?;
            let human = format_recommend(&data);
            Ok((data, human))
        }
        Command::List => {
            let data = commands::list(ctx).map_err(business_err)?;
            let human = format_installed(&data);
            Ok((data, human))
        }
        Command::Install { target } => {
            let data = commands::install(ctx, target).await.map_err(business_err)?;
            let human = format_install(&data);
            Ok((data, human))
        }
        Command::Remove { name } => {
            let data = commands::remove(ctx, name).map_err(business_err)?;
            let human = format_remove(&data);
            Ok((data, human))
        }
        Command::Update { name } => {
            let data = commands::update(ctx, name.as_deref())
                .await
                .map_err(business_err)?;
            let human = format_update(&data);
            Ok((data, human))
        }
        Command::Rollback { name } => {
            let data = commands::rollback(ctx, name).map_err(business_err)?;
            let human = format_rollback(&data);
            Ok((data, human))
        }
        Command::Enable { name } => {
            let data = commands::toggle_skill(ctx, name, true).map_err(business_err)?;
            let human = format_toggle(&data, true);
            Ok((data, human))
        }
        Command::Disable { name } => {
            let data = commands::toggle_skill(ctx, name, false).map_err(business_err)?;
            let human = format_toggle(&data, false);
            Ok((data, human))
        }
        Command::Tools => {
            let data = commands::tools(ctx).map_err(business_err)?;
            let human = format_tools(&data);
            Ok((data, human))
        }
        Command::Doctor => {
            let data = commands::doctor(ctx).map_err(business_err)?;
            let human = format_doctor(&data);
            Ok((data, human))
        }
        Command::Mcp {
            command: McpCommand::Serve,
        } => {
            mcp::serve().await.map_err(|e| (1, e))?;
            // serve() 常驻，正常返回即结束
            Ok((serde_json::json!({ "mcp": "stopped" }), "MCP server 已停止".to_string()))
        }
        Command::Daemon { port } => {
            let data = commands::daemon(ctx, *port).await.map_err(business_err)?;
            let human = "后台网关已启动".to_string();
            Ok((data, human))
        }
        Command::Pack {
            command: PackCommand::Export { file },
        } => {
            let data = commands::pack_export(ctx, file).map_err(business_err)?;
            let human = format!("已导出 {} 个技能栈配方到 {}", data["presets"], file);
            Ok((data, human))
        }
        Command::Pack {
            command: PackCommand::Import { file },
        } => {
            let data = commands::pack_import(ctx, file)
                .await
                .map_err(business_err)?;
            let human = format_pack_import(&data);
            Ok((data, human))
        }
        Command::Config {
            command: ConfigCommand::Show,
        } => {
            let data = commands::config_show().map_err(business_err)?;
            let human = format_config_show(&data);
            Ok((data, human))
        }
        Command::Config {
            command: ConfigCommand::Whitelist { command },
        } => {
            let (op, value) = match command {
                WhitelistCommand::On => ("on", None),
                WhitelistCommand::Off => ("off", None),
                WhitelistCommand::Set { origins } => ("set", Some(origins.as_str())),
                WhitelistCommand::Add { origin } => ("add", Some(origin.as_str())),
                WhitelistCommand::Remove { origin } => ("remove", Some(origin.as_str())),
            };
            let data = commands::config_whitelist(op, value).map_err(business_err)?;
            let human = format_config_show(&data);
            Ok((data, human))
        }
        Command::Bootstrap => {
            let data = commands::bootstrap(ctx).map_err(business_err)?;
            let human = format_bootstrap(&data);
            Ok((data, human))
        }
    }
}

fn business_err(e: String) -> (i32, String) {
    (1, e)
}

// ─── 人类可读格式化 ────────────────────────────────────────────────────────

fn stars_str(s: &serde_json::Value) -> String {
    match s["stars"].as_u64() {
        Some(n) if n >= 1000 => format!("★ {:.1}k", n as f64 / 1000.0),
        Some(n) if n > 0 => format!("★ {}", n),
        _ => String::new(),
    }
}

fn installs_str(s: &serde_json::Value) -> String {
    match s["installs"].as_u64() {
        Some(n) if n >= 1000 => format!("{}k 安装", n as f64 / 1000.0),
        Some(n) if n > 0 => format!("{} 安装", n),
        _ => String::new(),
    }
}

fn format_skill_list(data: &serde_json::Value, title: &str) -> String {
    let arr = data.as_array().unwrap_or(&EMPTY_ARRAY);
    if arr.is_empty() {
        return format!("{}：没有找到技能", title);
    }
    let mut out = format!("{}（{} 个）:\n", title, arr.len());
    for (i, s) in arr.iter().enumerate() {
        let name = s["name"].as_str().unwrap_or("?").bold();
        let source = s["source"].as_str().unwrap_or("").dimmed();
        let stars = stars_str(s);
        let installs = installs_str(s);
        let meta = vec![stars, installs]
            .into_iter()
            .filter(|m| !m.is_empty())
            .collect::<Vec<_>>()
            .join("  ");
        out.push_str(&format!(
            "\n  {}. {}    {}    {}\n",
            i + 1,
            name,
            source,
            meta
        ));
        if let Some(d) = s["repoDescription"].as_str() {
            if !d.is_empty() {
                out.push_str(&format!("     {}\n", d.dimmed()));
            }
        }
    }
    out
}

fn format_search(data: &serde_json::Value, query: &str) -> String {
    format_skill_list(data, &format!("搜索「{}」的结果", query))
}

fn format_info(data: &serde_json::Value) -> String {
    let source = data["source"].as_str().unwrap_or("");
    let slug = data["slug"].as_str().unwrap_or("");
    let files = data["files"].as_array().unwrap_or(&EMPTY_ARRAY);
    let mut out = format!("{} {}\n", "技能详情:".bold(), format!("{}/{}", source, slug));
    out.push_str(&format!("文件数: {}\n\n", files.len()));
    for f in files {
        let path = f["path"].as_str().unwrap_or("");
        let content = f["contents"].as_str().unwrap_or("");
        out.push_str(&format!("──── {} ────\n", path.bold()));
        out.push_str(content);
        out.push('\n');
    }
    out
}

fn format_recommend(data: &serde_json::Value) -> String {
    let recs = data["recommendations"].as_array().unwrap_or(&EMPTY_ARRAY);
    if recs.is_empty() {
        return "没有找到匹配的技能，请尝试更具体的任务描述".to_string();
    }
    let mut out = format!("找到 {} 个相关技能:\n", recs.len());
    for (i, r) in recs.iter().enumerate() {
        let name = r["name"].as_str().unwrap_or("?").bold();
        let source = r["source"].as_str().unwrap_or("").dimmed();
        let stars = stars_str(r);
        let installed = if r["installed"].as_bool().unwrap_or(false) {
            let tools = r["installedIn"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|t| t.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            format!("{} {}", "已装".green(), tools.dimmed())
        } else {
            "未安装".dimmed().to_string()
        };
        let conf = r["confidence"].as_f64().unwrap_or(0.0);
        out.push_str(&format!(
            "\n  {}. {}    {}    {}    {} 置信度 {:.0}%\n",
            i + 1,
            name,
            source,
            stars,
            installed,
            conf * 100.0
        ));
        if let Some(reason) = r["reason"].as_str() {
            out.push_str(&format!("     理由: {}\n", reason));
        }
        if let Some(d) = r["description"].as_str() {
            if !d.is_empty() {
                out.push_str(&format!("     {}\n", d.dimmed()));
            }
        }
    }
    if let Some(action) = data["suggestedAction"].as_str() {
        out.push_str(&format!("\n建议: {} {}\n", "skillctl".bold(), action));
    }
    out
}

fn format_installed(data: &serde_json::Value) -> String {
    let arr = data.as_array().unwrap_or(&EMPTY_ARRAY);
    if arr.is_empty() {
        return "没有已安装的技能".to_string();
    }
    let mut out = format!("已安装技能（{} 个）:\n", arr.len());
    for (i, s) in arr.iter().enumerate() {
        let name = s["name"].as_str().unwrap_or("?").bold();
        let state = if s["enabled"].as_bool().unwrap_or(false) {
            "已启用".green()
        } else {
            "已禁用".red()
        };
        let path = s["path"].as_str().unwrap_or("").dimmed();
        out.push_str(&format!("\n  {}. {}    [{}]\n     {}\n", i + 1, name, state, path));
        if let Some(d) = s["description"].as_str() {
            if !d.is_empty() {
                out.push_str(&format!("     {}\n", d.dimmed()));
            }
        }
    }
    out
}

fn format_install(data: &serde_json::Value) -> String {
    if data.get("dryRun").is_some() {
        return format!(
            "[dry-run] 将安装 {}，目标 {}（{}）",
            data["skill"].as_str().unwrap_or(""),
            data["target"].as_str().unwrap_or(""),
            data["scope"].as_str().unwrap_or("global")
        );
    }
    let ok = data["success"].as_bool().unwrap_or(false);
    let name = data["skillName"].as_str().unwrap_or("?");
    if ok {
        format!("{} {}（{} 个文件，{}）", "安装成功:".green().bold(), name, data["filesInstalled"], data["method"].as_str().unwrap_or(""))
    } else {
        format!(
            "{} {}: {}",
            "安装失败:".red().bold(),
            name,
            data["error"].as_str().unwrap_or("未知错误")
        )
    }
}

fn format_remove(data: &serde_json::Value) -> String {
    if data.get("dryRun").is_some() {
        return format!(
            "[dry-run] 将删除技能目录: {}",
            data["path"].as_str().unwrap_or("")
        );
    }
    if data["success"].as_bool().unwrap_or(false) {
        format!("{} {}", "已卸载:".green().bold(), data["name"].as_str().unwrap_or(""))
    } else {
        format!("{} {}", "卸载失败".red().bold(), data["name"].as_str().unwrap_or(""))
    }
}

fn format_update(data: &serde_json::Value) -> String {
    if data.get("dryRun").is_some() {
        return format!("[dry-run] 将更新 {} 个技能", data["skills"].as_array().map(|a| a.len()).unwrap_or(0));
    }
    let updated = data["updated"].as_array().unwrap_or(&EMPTY_ARRAY);
    if updated.is_empty() {
        return "没有需要更新的技能".to_string();
    }
    let mut out = format!("更新结果（{} 个）:\n", updated.len());
    for u in updated {
        let name = u["skill"].as_str().unwrap_or("?");
        if u["success"].as_bool().unwrap_or(false) {
            out.push_str(&format!("  {} {}\n", "✓".green(), name));
        } else {
            out.push_str(&format!(
                "  {} {}: {}\n",
                "✗".red(),
                name,
                u["error"].as_str().unwrap_or("未知错误")
            ));
        }
    }
    out
}

fn format_rollback(data: &serde_json::Value) -> String {
    if data.get("dryRun").is_some() {
        return format!("[dry-run] 将回滚 {}", data["name"].as_str().unwrap_or(""));
    }
    if data["success"].as_bool().unwrap_or(false) {
        format!("{} {}", "回滚成功:".green().bold(), data["skillName"].as_str().unwrap_or(""))
    } else {
        format!("{} {}", "回滚失败:".red().bold(), data["error"].as_str().unwrap_or("未知错误"))
    }
}

fn format_toggle(data: &serde_json::Value, enable: bool) -> String {
    if data.get("dryRun").is_some() {
        return format!(
            "[dry-run] 将{} {}",
            if enable { "启用" } else { "禁用" },
            data["name"].as_str().unwrap_or("")
        );
    }
    let name = data["name"].as_str().unwrap_or("?");
    let enabled = data["enabled"].as_bool().unwrap_or(false);
    if enabled == enable {
        format!(
            "{} {}",
            if enable { "已启用:".green().bold() } else { "已禁用:".yellow().bold() },
            name
        )
    } else {
        format!("{} {}", "操作未生效".red().bold(), name)
    }
}

fn format_tools(data: &serde_json::Value) -> String {
    let arr = data.as_array().unwrap_or(&EMPTY_ARRAY);
    if arr.is_empty() {
        return "没有检测到 AI 工具".to_string();
    }
    let mut out = format!("检测到的 AI 工具（{} 个）:\n", arr.len());
    for t in arr {
        let name = t["displayName"].as_str().unwrap_or("?").bold();
        let installed = if t["installed"].as_bool().unwrap_or(false) {
            "已安装".green()
        } else {
            "未安装".dimmed()
        };
        let running = if t["running"].as_bool().unwrap_or(false) {
            "运行中".green().bold()
        } else {
            "未运行".dimmed()
        };
        let dir = t["globalDir"].as_str().unwrap_or("").dimmed();
        out.push_str(&format!(
            "\n  {}    [{}] [{}]\n     {}\n",
            name, installed, running, dir
        ));
    }
    out
}

fn format_doctor(data: &serde_json::Value) -> String {
    let summary = &data["summary"];
    let total = summary["total"].as_u64().unwrap_or(0);
    let healthy = summary["healthy"].as_u64().unwrap_or(0);
    let warnings = summary["warnings"].as_u64().unwrap_or(0);
    let errors = summary["errors"].as_u64().unwrap_or(0);

    let mut out = format!(
        "技能健康诊断: 共 {} 个，健康 {}，警告 {}，错误 {}\n",
        total, healthy, warnings, errors
    );

    let token_cost = &data["tokenCost"];
    out.push_str(&format!(
        "Token 成本: 约 {} tokens（{} 个技能，{} 个文件）\n",
        token_cost["totalTokens"].as_u64().unwrap_or(0),
        token_cost["skillCount"].as_u64().unwrap_or(0),
        token_cost["fileCount"].as_u64().unwrap_or(0),
    ));

    let conflicts = data["conflicts"].as_array().unwrap_or(&EMPTY_ARRAY);
    if !conflicts.is_empty() {
        out.push_str(&format!("\n{} 冲突（{} 个）:\n", "⚠".yellow(), conflicts.len()));
        for c in conflicts {
            out.push_str(&format!(
                "  {}: {}\n",
                c["name"].as_str().unwrap_or("?"),
                c["paths"].as_array().map(|a| a.len()).unwrap_or(0)
            ));
        }
    }

    let zombies = data["zombies"].as_array().unwrap_or(&EMPTY_ARRAY);
    if !zombies.is_empty() {
        out.push_str(&format!("\n{} 僵尸技能（{} 个）:\n", "⚠".yellow(), zombies.len()));
        for z in zombies {
            out.push_str(&format!("  {}: {}\n", z["name"].as_str().unwrap_or("?"), z["reason"].as_str().unwrap_or("")));
        }
    }

    let quality = data["quality"].as_array().unwrap_or(&EMPTY_ARRAY);
    if !quality.is_empty() {
        out.push_str(&format!("\n质量评分（{} 个）:\n", quality.len()));
        for q in quality {
            out.push_str(&format!(
                "  {}: {} 分\n",
                q["name"].as_str().unwrap_or("?"),
                q["score"].as_u64().unwrap_or(0)
            ));
        }
    }
    out
}

fn format_pack_import(data: &serde_json::Value) -> String {
    if data.get("dryRun").is_some() {
        return format!(
            "[dry-run] 将导入配方 {}（{} 个技能）",
            data["preset"].as_str().unwrap_or(""),
            data["skills"].as_u64().unwrap_or(0)
        );
    }
    let results = data["results"].as_array().unwrap_or(&EMPTY_ARRAY);
    let mut out = format!(
        "导入完成: 成功 {} / 失败 {}\n",
        data["succeeded"].as_u64().unwrap_or(0),
        data["failed"].as_u64().unwrap_or(0)
    );
    for r in results {
        let name = r["skillName"].as_str().unwrap_or("?");
        if r["success"].as_bool().unwrap_or(false) {
            out.push_str(&format!("  {} {}\n", "✓".green(), name));
        } else {
            out.push_str(&format!(
                "  {} {}: {}\n",
                "✗".red(),
                name,
                r["message"].as_str().unwrap_or("")
            ));
        }
    }
    out
}

fn format_config_show(data: &serde_json::Value) -> String {
    let mut out = format!(
        "{} {}\n",
        "配置".bold(),
        data["configPath"].as_str().unwrap_or("").dimmed()
    );
    out.push_str(&format!(
        "技能目录: {}\n",
        data["globalSkillsPath"].as_str().unwrap_or("")
    ));
    out.push_str(&format!(
        "目标工具: {}\n",
        data["activeToolId"].as_str().unwrap_or("")
    ));
    let wl = &data["whitelist"];
    let enabled = wl["enabled"].as_bool().unwrap_or(false);
    out.push_str(&format!(
        "源白名单: {}",
        if enabled { "已开启".yellow().bold() } else { "已关闭".dimmed() }
    ));
    let origins = wl["origins"].as_array().unwrap_or(&EMPTY_ARRAY);
    let list = origins
        .iter()
        .filter_map(|o| o.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    if !list.is_empty() {
        out.push_str(&format!("（{}）", list));
    }
    out.push('\n');
    out
}

fn format_bootstrap(data: &serde_json::Value) -> String {
    let skill = data["skill"].as_str().unwrap_or("?");
    let succeeded = data["succeeded"].as_u64().unwrap_or(0);
    let mut out = format!(
        "{}（{}）已安装到 {} 个工具:\n",
        "自举技能".bold(),
        skill,
        succeeded
    );
    let results = data["results"].as_array().unwrap_or(&EMPTY_ARRAY);
    for r in results {
        let tool = r["tool"].as_str().unwrap_or("?");
        if r["installed"].as_bool().unwrap_or(false) {
            out.push_str(&format!(
                "  {} {} → {}\n",
                "✓".green(),
                tool,
                r["path"].as_str().unwrap_or("")
            ));
        } else {
            out.push_str(&format!(
                "  {} {}: {}\n",
                "✗".red(),
                tool,
                r["error"].as_str().unwrap_or("未知错误")
            ));
        }
    }
    out
}
