//! MCP（Model Context Protocol）Stdio Server。
//!
//! `skillctl mcp serve` 通过 stdin/stdout 收发 JSON-RPC 2.0（newline-delimited JSON），
//! 供 Claude Code / Cursor / Codex / Trae 等 AI 工具原生调用。
//! 严格实现 7 个 tools + resources + prompts，不依赖 LLM。

use serde_json::{json, Value};
use std::io::Write;
use tokio::io::{AsyncBufReadExt, BufReader};

const PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "skill-hub";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 常驻运行 MCP Server，直到 stdin EOF。
pub async fn serve() -> Result<(), String> {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin);
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("读取 stdin 失败: {}", e))?;
        if n == 0 {
            break; // EOF
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue, // 忽略畸形消息，保持协议健壮
        };
        if let Some(resp) = handle_message(&msg).await {
            let out = serde_json::to_string(&resp).unwrap_or_default();
            println!("{}", out);
            let _ = std::io::stdout().flush();
        }
    }
    Ok(())
}

async fn handle_message(msg: &Value) -> Option<Value> {
    let method = msg.get("method")?.as_str()?.to_string();
    let id = msg.get("id").cloned();
    let params = msg.get("params").cloned().unwrap_or(json!({}));

    let result = match method.as_str() {
        "initialize" => initialize(&params),
        "tools/list" => tools_list(),
        "tools/call" => tools_call(&params).await,
        "resources/list" => resources_list(),
        "resources/read" => resources_read(&params),
        "prompts/list" => prompts_list(),
        "prompts/get" => prompts_get(&params),
        "ping" => json!({}),
        // 通知类：无需响应
        "notifications/initialized" | "notifications/cancelled" | "notifications/roots/list_changed"
        | "notifications/tools/list_changed" => return None,
        _ => {
            return Some(json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {}", method) }
            }))
        }
    };

    match id {
        Some(id) => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        })),
        None => None,
    }
}

fn initialize(_params: &Value) -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": { "listChanged": false },
            "resources": { "subscribe": false },
            "prompts": {}
        },
        "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION }
    })
}

// ─── Tools ────────────────────────────────────────────────────────────────

fn tools_list() -> Value {
    json!({
        "tools": [
            {
                "name": "search_skills",
                "description": "搜索可安装的 Agent Skill。当你需要完成某个任务、但不确定有没有现成技能可用时使用；返回精简列表（不含 SKILL.md 全文）。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "搜索关键词，如 pdf、web-search、react" },
                        "limit": { "type": "integer", "description": "返回条数上限（默认 10）" }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_skill_detail",
                "description": "查看某个技能的完整详情，包括 SKILL.md 全文与文件清单。在安装前用它确认技能确实匹配你的需求。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "source": { "type": "string", "description": "来源仓库，如 anthropics/skills" },
                        "slug": { "type": "string", "description": "技能名，如 pdf" }
                    },
                    "required": ["source", "slug"]
                }
            },
            {
                "name": "recommend_skills_for_task",
                "description": "描述你的任务，返回带推荐理由的技能排序列表。比关键词搜索更准，适合『我要做 X』这类自然语言描述。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task": { "type": "string", "description": "用一句话描述任务，如 我要从 PDF 里提取表格数据" },
                        "limit": { "type": "integer", "description": "返回条数上限（默认 5）" }
                    },
                    "required": ["task"]
                }
            },
            {
                "name": "list_installed_skills",
                "description": "列出本机已安装的 Agent Skill。在安装新技能前先调用，避免重复安装。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tool_id": { "type": "string", "description": "目标工具（trae|claude-code|cursor|codex），默认当前工具" },
                        "scope": { "type": "string", "description": "global（默认）或项目路径" }
                    }
                }
            },
            {
                "name": "install_skill",
                "description": "安装一个 Agent Skill 到指定工具。安全要求：首次调用不带 confirm 会返回待确认信息，你需要向用户复述『装什么、来自哪个仓库、装到哪』并得到同意后，再带 confirm=true 调用。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "source": { "type": "string", "description": "来源仓库，如 anthropics/skills" },
                        "slug": { "type": "string", "description": "技能名，如 pdf" },
                        "tool_id": { "type": "string", "description": "目标工具（trae|claude-code|cursor|codex），默认当前工具" },
                        "scope": { "type": "string", "description": "global（默认）或项目路径" },
                        "confirm": { "type": "boolean", "description": "用户确认后传 true 才会真正安装" }
                    },
                    "required": ["source", "slug"]
                }
            },
            {
                "name": "remove_skill",
                "description": "卸载一个已安装的 Agent Skill。安全要求：首次调用会返回将要删除的路径，必须向用户确认后带 confirm=true 再次调用才会执行。",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "技能名" },
                        "tool_id": { "type": "string", "description": "目标工具，默认当前工具" },
                        "confirm": { "type": "boolean", "description": "用户确认后传 true 才会真正删除" }
                    },
                    "required": ["name"]
                }
            },
            {
                "name": "detect_tools",
                "description": "检测本机安装了哪些 AI 编程工具、哪些正在运行、当前工作区在哪。在安装技能前用它确定目标工具。",
                "inputSchema": { "type": "object", "properties": {} }
            }
        ]
    })
}

async fn tools_call(params: &Value) -> Value {
    let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    let result = match name {
        "search_skills" => tool_search(&args).await,
        "get_skill_detail" => tool_detail(&args).await,
        "recommend_skills_for_task" => tool_recommend(&args).await,
        "list_installed_skills" => tool_list_installed(&args),
        "install_skill" => tool_install(&args).await,
        "remove_skill" => tool_remove(&args),
        "detect_tools" => tool_detect_tools(),
        _ => {
            return json!({
                "isError": true,
                "content": [{ "type": "text", "text": format!("未知工具: {}", name) }]
            })
        }
    };

    match result {
        Ok(text) => json!({
            "content": [{ "type": "text", "text": text }]
        }),
        Err(e) => json!({
            "isError": true,
            "content": [{ "type": "text", "text": e }]
        }),
    }
}

fn text_result(v: &Value) -> String {
    serde_json::to_string_pretty(v).unwrap_or_default()
}

async fn tool_search(args: &Value) -> Result<String, String> {
    let query = args.get("query").and_then(|q| q.as_str()).unwrap_or("");
    if query.is_empty() {
        return Err("query 不能为空".to_string());
    }
    let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as u32);
    let cfg = crate::commands::Ctx {
        tool: None,
        project: None,
        yes: false,
        dry_run: false,
        no_network: false,
        quiet: true,
        json: true,
    };
    let data = crate::commands::search(&cfg, query, limit).await?;
    Ok(text_result(&data))
}

async fn tool_detail(args: &Value) -> Result<String, String> {
    let source = args.get("source").and_then(|s| s.as_str()).unwrap_or("");
    let slug = args.get("slug").and_then(|s| s.as_str()).unwrap_or("");
    if source.is_empty() {
        return Err("source 不能为空".to_string());
    }
    let detail = crate::commands::detail_core(source, slug).await?;
    Ok(text_result(&serde_json::to_value(detail).map_err(|e| e.to_string())?))
}

async fn tool_recommend(args: &Value) -> Result<String, String> {
    let task = args.get("task").and_then(|t| t.as_str()).unwrap_or("");
    if task.is_empty() {
        return Err("task 不能为空".to_string());
    }
    let limit = args.get("limit").and_then(|l| l.as_u64()).map(|l| l as u32);
    let result = crate::commands::recommend_core(task, limit).await?;
    Ok(text_result(&serde_json::to_value(result).map_err(|e| e.to_string())?))
}

fn tool_list_installed(args: &Value) -> Result<String, String> {
    let tool_id = args.get("tool_id").and_then(|t| t.as_str());
    let scope = args.get("scope").and_then(|s| s.as_str());
    let cfg = crate::commands::Ctx {
        tool: tool_id.map(|s| s.to_string()),
        project: scope.map(|s| s.to_string()),
        yes: false,
        dry_run: false,
        no_network: false,
        quiet: true,
        json: true,
    };
    let data = crate::commands::list(&cfg)?;
    Ok(text_result(&data))
}

async fn tool_install(args: &Value) -> Result<String, String> {
    let source = args.get("source").and_then(|s| s.as_str()).unwrap_or("");
    let slug = args.get("slug").and_then(|s| s.as_str()).unwrap_or("");
    let tool_id = args.get("tool_id").and_then(|t| t.as_str());
    let scope = args.get("scope").and_then(|s| s.as_str());
    let confirm = args.get("confirm").and_then(|c| c.as_bool()).unwrap_or(false);

    if source.is_empty() {
        return Err("source 不能为空".to_string());
    }
    let label = if slug.is_empty() {
        source.to_string()
    } else {
        format!("{}/{}", source, slug)
    };
    let target = if scope.is_some() && scope != Some("global") {
        format!("项目级 {}", scope.unwrap_or(""))
    } else {
        "全局".to_string()
    };
    let tool = tool_id.unwrap_or("当前工具");

    if !confirm {
        // 待确认响应：要求 AI 向用户复述并征得同意
        return Ok(json!({
            "status": "pending_confirmation",
            "message": format!(
                "待确认：将安装 {}，来自仓库 {}，目标 {}（{}）。请向用户复述并征得同意后，带 confirm=true 再次调用。",
                label, source, tool, target
            ),
            "action": "install_skill",
            "source": source,
            "slug": slug,
        })
        .to_string());
    }

    let result = crate::commands::install_core(source, slug, tool_id, scope).await?;
    Ok(text_result(&serde_json::to_value(result).map_err(|e| e.to_string())?))
}

fn tool_remove(args: &Value) -> Result<String, String> {
    let name = args.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let tool_id = args.get("tool_id").and_then(|t| t.as_str());
    let confirm = args.get("confirm").and_then(|c| c.as_bool()).unwrap_or(false);

    if name.is_empty() {
        return Err("name 不能为空".to_string());
    }

    // 先定位待删除路径（不执行）
    let tool = skills_core::tools::get_tool(tool_id.unwrap_or("trae"))
        .unwrap_or_else(skills_core::tools::default_tool);
    let Some(dir) = tool.global_dir() else {
        return Err("无法确定技能目录".to_string());
    };
    let path = dir.join(name);
    if !path.exists() {
        return Err(format!("未找到已安装技能: {}", name));
    }

    if !confirm {
        return Ok(json!({
            "status": "pending_confirmation",
            "message": format!(
                "待确认：将删除技能目录 {}。请向用户确认后，带 confirm=true 再次调用。",
                path.display()
            ),
            "action": "remove_skill",
            "name": name,
            "path": path.to_string_lossy(),
        })
        .to_string());
    }

    let removed = skills_core::remove::remove_skill(&path.to_string_lossy(), Some("mcp"))?;
    Ok(json!({
        "success": removed,
        "name": name,
        "path": path.to_string_lossy(),
    })
    .to_string())
}

fn tool_detect_tools() -> Result<String, String> {
    let cfg = crate::commands::Ctx {
        tool: None,
        project: None,
        yes: false,
        dry_run: false,
        no_network: false,
        quiet: true,
        json: true,
    };
    let data = crate::commands::tools(&cfg)?;
    Ok(text_result(&data))
}

// ─── Resources ────────────────────────────────────────────────────────────

fn resources_list() -> Value {
    json!({
        "resources": [
            {
                "uri": "skills://installed",
                "name": "已安装技能清单",
                "description": "当前工具已安装的全部 Agent Skill（Markdown）",
                "mimeType": "text/markdown"
            },
            {
                "uri": "skills://installed/{tool}",
                "name": "指定工具已安装技能清单",
                "description": "指定 AI 工具（trae|claude-code|cursor|codex）的已安装技能（Markdown）",
                "mimeType": "text/markdown"
            }
        ]
    })
}

fn resources_read(params: &Value) -> Value {
    let uri = params.get("uri").and_then(|u| u.as_str()).unwrap_or("");
    let content = match uri {
        "skills://installed" => installed_markdown(None),
        u if u.starts_with("skills://installed/") => {
            let tool = u.trim_start_matches("skills://installed/");
            installed_markdown(Some(tool))
        }
        _ => {
            return json!({
                "isError": true,
                "content": [{ "type": "text", "text": format!("未知资源: {}", uri) }]
            })
        }
    };
    json!({
        "contents": [{
            "uri": uri,
            "mimeType": "text/markdown",
            "text": content
        }]
    })
}

fn installed_markdown(tool_id: Option<&str>) -> String {
    let tool = skills_core::tools::get_tool(tool_id.unwrap_or("trae"))
        .unwrap_or_else(skills_core::tools::default_tool);
    let mut out = format!("# 已安装技能（{}）\n\n", tool.display_name());
    let Some(dir) = tool.global_dir() else {
        out.push_str("未检测到技能目录。\n");
        return out;
    };
    let skills = skills_core::scan::scan_directory(&dir);
    if skills.is_empty() {
        out.push_str("暂无已安装技能。\n");
        return out;
    }
    for s in skills {
        let state = if s.enabled { "启用" } else { "禁用" };
        out.push_str(&format!(
            "- **{}** [{}] {}\n",
            s.name,
            state,
            s.description
        ));
    }
    out
}

// ─── Prompts ──────────────────────────────────────────────────────────────

fn prompts_list() -> Value {
    json!({
        "prompts": [
            {
                "name": "find-skill",
                "description": "我需要 <任务>，帮我找并装上合适的技能",
                "arguments": [
                    { "name": "task", "description": "任务描述", "required": true }
                ]
            },
            {
                "name": "audit-skills",
                "description": "审查我的技能栈，找出冗余、冲突和质量问题",
                "arguments": []
            }
        ]
    })
}

fn prompts_get(params: &Value) -> Value {
    let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let task = args.get("task").and_then(|t| t.as_str()).unwrap_or("<任务>");

    let messages = match name {
        "find-skill" => json!([
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": format!(
                        "我需要完成以下任务：{task}。\n\
                         请按以下步骤帮我找到并安装合适的技能：\n\
                         1. 先调用 list_installed_skills 检查是否已安装，避免重复\n\
                         2. 用 recommend_skills_for_task 描述任务获取推荐\n\
                         3. 用 get_skill_detail 确认候选技能真的匹配\n\
                         4. 向用户说明要装什么、为什么，征得同意后调用 install_skill（先不带 confirm，得到同意后再带 confirm=true）",
                        task = task
                    )
                }
            }
        ]),
        "audit-skills" => json!([
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": "请审查我的技能栈：\n\
                             1. 调用 list_installed_skills 获取已装技能\n\
                             2. 找出功能重叠、命名冲突、已禁用或质量可疑的技能\n\
                             3. 给出清理建议（哪些可以卸载、哪些建议更新）"
                }
            }
        ]),
        _ => {
            return json!({
                "isError": true,
                "content": [{ "type": "text", "text": format!("未知 prompt: {}", name) }]
            })
        }
    };

    json!({
        "description": name,
        "messages": messages
    })
}
