//! MCP 配置转译层（Phase 6）：把内部统一的 MCP 模型（McpConnectionConfig）
//! 导出到各家工具的配置文件（Claude Code / Cursor / Trae 用 JSON，Codex 用
//! TOML），并支持从已有配置导入回内部模型，实现「一次配置、到处可用」。
//!
//! 设计要点：
//! - 写入前自动备份原文件为 .bak，先写临时文件再原子替换（失败可回滚）
//! - 同名 server 配置不一致时返回冲突信息，由前端明确提示，不静默覆盖
//! - 只修改目标配置中的 mcpServers / mcp_servers 段，保留其他配置项

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::tools;
use crate::tools::adapter::McpConfigFormat;

use super::mcp::McpConnectionConfig;

// ─── 目标工具信息 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTargetInfo {
    pub tool_id: String,
    pub display_name: String,
    pub icon: String,
    pub path: Option<String>,
    pub format: String,
    pub exists: bool,
    pub server_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConflict {
    pub server_name: String,
    pub existing: McpConnectionConfig,
    pub incoming: McpConnectionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpWriteResult {
    pub tool_id: String,
    pub success: bool,
    pub message: String,
    pub conflicts: Vec<McpConflict>,
}

// ─── 路径解析 ─────────────────────────────────────────────────────────────

/// 解析某工具 MCP 配置文件的绝对路径。
/// - codex 的 global_path 相对 ~/.codex
/// - trae 无全局配置，仅项目级（需要 project_path）
/// - 其余工具 global_path 相对 home
fn resolve_config_path(tool: &dyn tools::Tool, project_path: Option<&str>) -> Option<PathBuf> {
    let spec = tool.adapter().mcp_config?;
    let home = dirs::home_dir()?;
    match tool.id() {
        "codex" => spec.global_path.map(|p| home.join(".codex").join(p)),
        "trae" => project_path.map(|p| Path::new(p).join(spec.project_path)),
        _ => spec.global_path.map(|p| home.join(p)),
    }
}

// ─── 命令入口 ─────────────────────────────────────────────────────────────

pub fn mcp_get_targets(project_path: Option<String>) -> Vec<McpTargetInfo> {
    tools::all_tools()
        .into_iter()
        .filter_map(|t| {
            let spec = t.adapter().mcp_config?;
            let path = resolve_config_path(t, project_path.as_deref())?;
            let format = match spec.format {
                McpConfigFormat::Json => "json",
                McpConfigFormat::Toml => "toml",
            };
            let server_names = if path.exists() {
                read_server_names(&path, format)
            } else {
                Vec::new()
            };
            Some(McpTargetInfo {
                tool_id: t.id().to_string(),
                display_name: t.display_name().to_string(),
                icon: t.icon().to_string(),
                path: Some(path.to_string_lossy().to_string()),
                format: format.to_string(),
                exists: path.exists(),
                server_names,
            })
        })
        .collect()
}

pub fn mcp_write_servers(
    servers: Vec<McpConnectionConfig>,
    tool_ids: Vec<String>,
    project_path: Option<String>,
    overwrite_conflicts: bool,
) -> Vec<McpWriteResult> {
    tool_ids
        .into_iter()
        .map(|tool_id| {
            let Some(tool) = tools::get_tool(&tool_id) else {
                return McpWriteResult {
                    tool_id,
                    success: false,
                    message: "未知工具".to_string(),
                    conflicts: Vec::new(),
                };
            };
            let Some(path) = resolve_config_path(tool, project_path.as_deref()) else {
                return McpWriteResult {
                    tool_id,
                    success: false,
                    message: "该工具没有可用的 MCP 配置文件路径".to_string(),
                    conflicts: Vec::new(),
                };
            };
            let format = tool
                .adapter()
                .mcp_config
                .map(|s| s.format)
                .unwrap_or(McpConfigFormat::Json);
            let result = match format {
                McpConfigFormat::Json => write_json_config(&path, &servers, overwrite_conflicts),
                McpConfigFormat::Toml => write_toml_config(&path, &servers, overwrite_conflicts),
            };
            match result {
                Ok(conflicts) if !conflicts.is_empty() => McpWriteResult {
                    tool_id,
                    success: false,
                    message: format!("检测到 {} 个同名配置冲突，已跳过写入", conflicts.len()),
                    conflicts,
                },
                Ok(_) => McpWriteResult {
                    tool_id,
                    success: true,
                    message: "已写入配置".to_string(),
                    conflicts: Vec::new(),
                },
                Err(e) => McpWriteResult {
                    tool_id,
                    success: false,
                    message: e,
                    conflicts: Vec::new(),
                },
            }
        })
        .collect()
}

pub fn mcp_read_servers(
    tool_id: String,
    project_path: Option<String>,
) -> Result<Vec<McpConnectionConfig>, String> {
    let tool = tools::get_tool(&tool_id).ok_or("未知工具")?;
    let path = resolve_config_path(tool, project_path.as_deref())
        .ok_or("该工具没有可用的 MCP 配置文件路径")?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let format = tool
        .adapter()
        .mcp_config
        .map(|s| s.format)
        .unwrap_or(McpConfigFormat::Json);
    Ok(match format {
        McpConfigFormat::Json => read_json_servers(&path),
        McpConfigFormat::Toml => read_toml_servers(&path),
    })
}

// ─── 读取（importer）──────────────────────────────────────────────────────

fn read_server_names(path: &Path, format: &str) -> Vec<String> {
    match format {
        "toml" => read_toml_servers(path).into_iter().map(|s| s.name).collect(),
        _ => read_json_servers(path).into_iter().map(|s| s.name).collect(),
    }
}

fn read_json_servers(path: &Path) -> Vec<McpConnectionConfig> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(root) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Vec::new();
    };
    let Some(servers) = root.get("mcpServers").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    servers
        .iter()
        .map(|(name, value)| json_entry_to_config(name, value))
        .collect()
}

fn read_toml_servers(path: &Path) -> Vec<McpConnectionConfig> {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(root) = content.parse::<toml::Value>() else {
        return Vec::new();
    };
    let Some(servers) = root.get("mcp_servers").and_then(|v| v.as_table()) else {
        return Vec::new();
    };
    servers
        .iter()
        .map(|(name, value)| toml_entry_to_config(name, value))
        .collect()
}

fn json_entry_to_config(name: &str, value: &serde_json::Value) -> McpConnectionConfig {
    let obj = value.as_object().cloned().unwrap_or_default();
    let url = obj.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
    let is_remote = url.is_some()
        || obj
            .get("type")
            .and_then(|v| v.as_str())
            .map_or(false, |t| t != "stdio");
    McpConnectionConfig {
        name: name.to_string(),
        command: obj
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        args: obj
            .get("args")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        env: obj
            .get("env")
            .and_then(|v| v.as_object())
            .map(|e| {
                e.iter()
                    .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        cwd: obj.get("cwd").and_then(|v| v.as_str()).map(|s| s.to_string()),
        config_type: if is_remote { "sse".to_string() } else { "stdio".to_string() },
        url,
    }
}

fn toml_entry_to_config(name: &str, value: &toml::Value) -> McpConnectionConfig {
    let table = value.as_table().cloned().unwrap_or_default();
    let url = table.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
    McpConnectionConfig {
        name: name.to_string(),
        command: table
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        args: table
            .get("args")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        env: table
            .get("env")
            .and_then(|v| v.as_table())
            .map(|e| {
                e.iter()
                    .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        cwd: table.get("cwd").and_then(|v| v.as_str()).map(|s| s.to_string()),
        config_type: if url.is_some() { "sse".to_string() } else { "stdio".to_string() },
        url,
    }
}

// ─── 写入（exporter）──────────────────────────────────────────────────────

fn write_json_config(
    path: &Path,
    servers: &[McpConnectionConfig],
    overwrite: bool,
) -> Result<Vec<McpConflict>, String> {
    let mut root: serde_json::Value = if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| format!("读取配置失败: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()))
    } else {
        serde_json::Value::Object(serde_json::Map::new())
    };

    let obj = root
        .as_object_mut()
        .ok_or("配置文件格式错误：顶层不是 JSON 对象")?;
    let mut mcp_servers = obj
        .get("mcpServers")
        .cloned()
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let mut servers_map = mcp_servers
        .as_object()
        .cloned()
        .ok_or("mcpServers 配置格式错误")?;

    let conflicts = detect_conflicts(servers, |name| {
        servers_map.get(name).map(|v| json_entry_to_config(name, v))
    });
    if !conflicts.is_empty() && !overwrite {
        return Ok(conflicts);
    }

    for server in servers {
        servers_map.insert(server.name.clone(), build_json_entry(server));
    }
    mcp_servers = serde_json::Value::Object(servers_map);
    obj.insert("mcpServers".to_string(), mcp_servers);

    let content =
        serde_json::to_string_pretty(&root).map_err(|e| format!("序列化 JSON 失败: {}", e))?;
    backup_and_write(path, &content)?;
    Ok(Vec::new())
}

fn write_toml_config(
    path: &Path,
    servers: &[McpConnectionConfig],
    overwrite: bool,
) -> Result<Vec<McpConflict>, String> {
    let mut root: toml::Value = if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| format!("读取配置失败: {}", e))?;
        content
            .parse::<toml::Value>()
            .unwrap_or_else(|_| toml::Value::Table(toml::map::Map::new()))
    } else {
        toml::Value::Table(toml::map::Map::new())
    };

    let root_table = root
        .as_table_mut()
        .ok_or("配置文件格式错误：顶层不是 TOML 表")?;
    let mut mcp_servers = root_table
        .get("mcp_servers")
        .cloned()
        .unwrap_or_else(|| toml::Value::Table(toml::map::Map::new()));
    let mut servers_table = mcp_servers
        .as_table()
        .cloned()
        .ok_or("mcp_servers 配置格式错误")?;

    let conflicts = detect_conflicts(servers, |name| {
        servers_table.get(name).map(|v| toml_entry_to_config(name, v))
    });
    if !conflicts.is_empty() && !overwrite {
        return Ok(conflicts);
    }

    for server in servers {
        servers_table.insert(server.name.clone(), build_toml_entry(server));
    }
    mcp_servers = toml::Value::Table(servers_table);
    root_table.insert("mcp_servers".to_string(), mcp_servers);

    let content = toml::to_string(&root).map_err(|e| format!("序列化 TOML 失败: {}", e))?;
    backup_and_write(path, &content)?;
    Ok(Vec::new())
}

/// 检测同名 server 配置不一致的冲突（不修改任何内容）。
fn detect_conflicts<F>(servers: &[McpConnectionConfig], get_existing: F) -> Vec<McpConflict>
where
    F: Fn(&str) -> Option<McpConnectionConfig>,
{
    let mut conflicts = Vec::new();
    for server in servers {
        if let Some(existing) = get_existing(&server.name) {
            if !configs_equal(&existing, server) {
                conflicts.push(McpConflict {
                    server_name: server.name.clone(),
                    existing,
                    incoming: server.clone(),
                });
            }
        }
    }
    conflicts
}

fn configs_equal(a: &McpConnectionConfig, b: &McpConnectionConfig) -> bool {
    a.command == b.command
        && a.args == b.args
        && a.env == b.env
        && a.cwd == b.cwd
        && a.config_type == b.config_type
        && a.url == b.url
}

fn build_json_entry(server: &McpConnectionConfig) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    if server.config_type.eq_ignore_ascii_case("sse") {
        obj.insert(
            "url".to_string(),
            serde_json::Value::String(server.url.clone().unwrap_or_default()),
        );
        obj.insert("type".to_string(), serde_json::Value::String("sse".to_string()));
    } else {
        obj.insert(
            "command".to_string(),
            serde_json::Value::String(server.command.clone()),
        );
        if !server.args.is_empty() {
            obj.insert(
                "args".to_string(),
                serde_json::Value::Array(
                    server
                        .args
                        .iter()
                        .map(|a| serde_json::Value::String(a.clone()))
                        .collect(),
                ),
            );
        }
        if !server.env.is_empty() {
            let env = server
                .env
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            obj.insert("env".to_string(), serde_json::Value::Object(env));
        }
        if let Some(cwd) = &server.cwd {
            if !cwd.is_empty() {
                obj.insert("cwd".to_string(), serde_json::Value::String(cwd.clone()));
            }
        }
    }
    serde_json::Value::Object(obj)
}

fn build_toml_entry(server: &McpConnectionConfig) -> toml::Value {
    let mut table = toml::map::Map::new();
    if server.config_type.eq_ignore_ascii_case("sse") {
        table.insert(
            "url".to_string(),
            toml::Value::String(server.url.clone().unwrap_or_default()),
        );
    } else {
        table.insert(
            "command".to_string(),
            toml::Value::String(server.command.clone()),
        );
        if !server.args.is_empty() {
            table.insert(
                "args".to_string(),
                toml::Value::Array(
                    server
                        .args
                        .iter()
                        .map(|a| toml::Value::String(a.clone()))
                        .collect(),
                ),
            );
        }
        if !server.env.is_empty() {
            let env = server
                .env
                .iter()
                .map(|(k, v)| (k.clone(), toml::Value::String(v.clone())))
                .collect();
            table.insert("env".to_string(), toml::Value::Table(env));
        }
        if let Some(cwd) = &server.cwd {
            if !cwd.is_empty() {
                table.insert("cwd".to_string(), toml::Value::String(cwd.clone()));
            }
        }
    }
    toml::Value::Table(table)
}

/// 备份原文件为 .bak，再写临时文件后原子替换（失败可回滚）。
/// 临时文件在完整文件名后追加 .tmp，避免不同扩展名源文件（.json/.toml）共用同一临时路径。
fn backup_and_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    if path.exists() {
        let bak = PathBuf::from(format!("{}.bak", path.to_string_lossy()));
        std::fs::copy(path, &bak).map_err(|e| format!("备份原配置失败: {}", e))?;
    }
    let tmp = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));
    std::fs::write(&tmp, content).map_err(|e| format!("写入配置失败: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("替换配置失败: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn server(name: &str) -> McpConnectionConfig {
        McpConnectionConfig {
            name: name.to_string(),
            command: "npx".to_string(),
            args: vec!["-y".to_string(), "server".to_string()],
            env: HashMap::new(),
            cwd: None,
            config_type: "stdio".to_string(),
            url: None,
        }
    }

    #[test]
    fn json_roundtrip_preserves_other_keys() {
        let tmp = std::env::temp_dir().join("tsm-mcp-sync-test.json");
        let _ = std::fs::remove_file(&tmp);
        std::fs::write(&tmp, r#"{"existingKey":"keep","mcpServers":{"old":{"command":"old"}}}"#)
            .unwrap();

        let servers = vec![server("new-server")];
        let conflicts = write_json_config(&tmp, &servers, false).unwrap();
        assert!(conflicts.is_empty());

        let content = std::fs::read_to_string(&tmp).unwrap();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(json["existingKey"], "keep");
        assert_eq!(json["mcpServers"]["old"]["command"], "old");
        assert_eq!(json["mcpServers"]["new-server"]["command"], "npx");
        assert!(std::path::Path::new(&format!("{}.bak", tmp.to_string_lossy())).exists());

        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(format!("{}.bak", tmp.to_string_lossy()));
    }

    #[test]
    fn json_conflict_detected_without_overwrite() {
        let tmp = std::env::temp_dir().join("tsm-mcp-sync-conflict.json");
        let _ = std::fs::remove_file(&tmp);
        std::fs::write(
            &tmp,
            r#"{"mcpServers":{"dup":{"command":"old","args":[]}}}"#,
        )
        .unwrap();

        let servers = vec![server("dup")];
        let conflicts = write_json_config(&tmp, &servers, false).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].server_name, "dup");
        // 未覆盖：原内容保持不变
        let content = std::fs::read_to_string(&tmp).unwrap();
        assert!(content.contains("\"command\":\"old\""));

        // 覆盖后写入新值
        let conflicts = write_json_config(&tmp, &servers, true).unwrap();
        assert!(conflicts.is_empty());
        let content = std::fs::read_to_string(&tmp).unwrap();
        assert!(content.contains("\"command\": \"npx\""));

        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(format!("{}.bak", tmp.to_string_lossy()));
    }

    #[test]
    fn toml_roundtrip_preserves_other_sections() {
        let tmp = std::env::temp_dir().join("tsm-mcp-sync-test.toml");
        let _ = std::fs::remove_file(&tmp);
        std::fs::write(&tmp, "[model]\nprovider = \"openai\"\n").unwrap();

        let servers = vec![server("filesystem")];
        let conflicts = write_toml_config(&tmp, &servers, false).unwrap();
        assert!(conflicts.is_empty());

        let content = std::fs::read_to_string(&tmp).unwrap();
        let root: toml::Value = content.parse().unwrap();
        assert_eq!(root["model"]["provider"].as_str(), Some("openai"));
        assert_eq!(
            root["mcp_servers"]["filesystem"]["command"].as_str(),
            Some("npx")
        );
        assert_eq!(root["mcp_servers"]["filesystem"]["args"][0].as_str(), Some("-y"));

        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(format!("{}.bak", tmp.to_string_lossy()));
    }
}
