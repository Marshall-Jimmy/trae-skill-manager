use serde::{Deserialize, Serialize};
pub use skills_core::models::McpConnectionConfig;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ─── Shared types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTestResult {
    pub success: bool,
    pub message: String,
    pub duration_ms: u64,
    pub stderr: Option<String>,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpLogEvent {
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpExitEvent {
    pub pid: u32,
    pub code: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpExportFile {
    version: String,
    exported_at: String,
    servers: Vec<serde_json::Value>,
}

// ─── Health check ─────────────────────────────────────────────────────────

pub async fn mcp_test_connection(config: McpConnectionConfig) -> Result<McpTestResult, String> {
    let started = Instant::now();

    if config.config_type.eq_ignore_ascii_case("sse") {
        return test_sse(&config, started).await;
    }
    test_stdio(&config, started).await
}

async fn test_stdio(config: &McpConnectionConfig, started: Instant) -> Result<McpTestResult, String> {
    let mut cmd = Command::new(&config.command);
    cmd.args(&config.args)
        .envs(&config.env)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(cwd) = &config.cwd {
        if !cwd.is_empty() {
            cmd.current_dir(cwd);
        }
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let hint = match e.kind() {
                std::io::ErrorKind::NotFound => format!(
                    "命令「{}」未找到，请确认已安装（npx 命令需要 Node.js）",
                    config.command
                ),
                _ => format!("无法启动命令: {}", e),
            };
            return Ok(McpTestResult {
                success: false,
                message: "启动失败".to_string(),
                duration_ms: started.elapsed().as_millis() as u64,
                stderr: None,
                hint: Some(hint),
            });
        }
    };

    let stderr = child.stderr.take().unwrap();
    let stderr_task = tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let mut buf = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if buf.len() < 2000 {
                buf.push_str(&line);
                buf.push('\n');
            }
        }
        buf
    });

    match tokio::time::timeout(Duration::from_millis(2500), child.wait()).await {
        Ok(_status) => {
            // Process exited quickly -> startup failure
            let stderr_buf = stderr_task.await.unwrap_or_default();
            let hint = diagnose_stdio_failure(&config.command, &stderr_buf);
            Ok(McpTestResult {
                success: false,
                message: "进程启动后立即退出".to_string(),
                duration_ms: started.elapsed().as_millis() as u64,
                stderr: if stderr_buf.trim().is_empty() {
                    None
                } else {
                    Some(stderr_buf)
                },
                hint: Some(hint),
            })
        }
        Err(_) => {
            // Still alive after 2.5s -> healthy
            let _ = child.kill().await;
            let _ = child.wait().await;
            let _ = stderr_task.await;
            Ok(McpTestResult {
                success: true,
                message: "连接测试成功，进程已正常启动".to_string(),
                duration_ms: started.elapsed().as_millis() as u64,
                stderr: None,
                hint: None,
            })
        }
    }
}

async fn test_sse(config: &McpConnectionConfig, started: Instant) -> Result<McpTestResult, String> {
    let url = config.url.clone().unwrap_or_default();
    if url.trim().is_empty() {
        return Ok(McpTestResult {
            success: false,
            message: "SSE URL 为空".to_string(),
            duration_ms: 0,
            stderr: None,
            hint: Some("请在连接配置中填写 SSE URL".to_string()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                Ok(McpTestResult {
                    success: true,
                    message: format!("HTTP {} 连接成功", status.as_u16()),
                    duration_ms: started.elapsed().as_millis() as u64,
                    stderr: None,
                    hint: None,
                })
            } else {
                Ok(McpTestResult {
                    success: false,
                    message: format!("HTTP {} 响应异常", status.as_u16()),
                    duration_ms: started.elapsed().as_millis() as u64,
                    stderr: None,
                    hint: Some(
                        "服务器返回错误状态码，请检查 URL 是否正确、服务是否已启动".to_string(),
                    ),
                })
            }
        }
        Err(e) => {
            let hint = if e.is_timeout() {
                "连接超时，请检查 URL 地址和网络连通性".to_string()
            } else if e.is_connect() {
                "无法建立连接，请确认服务已启动且端口正确".to_string()
            } else {
                format!("请求失败: {}", e)
            };
            Ok(McpTestResult {
                success: false,
                message: "连接失败".to_string(),
                duration_ms: started.elapsed().as_millis() as u64,
                stderr: None,
                hint: Some(hint),
            })
        }
    }
}

fn diagnose_stdio_failure(command: &str, stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if command.contains("npx") {
        if lower.contains("not found") || lower.contains("enoent") {
            return "npx 未找到或包未安装。请先运行 npm install -g npx 或检查 Node.js 是否安装".to_string();
        }
        if lower.contains("npm err") || lower.contains("registry") {
            return "npm 包下载失败，请检查网络连接或 npm registry 配置".to_string();
        }
        if lower.contains("cannot find module") {
            return "找不到模块，请确认 npx 包名是否正确".to_string();
        }
    }
    if lower.contains("permission denied") || lower.contains("access denied") {
        return "权限不足，请检查命令执行权限".to_string();
    }
    if lower.contains("no such file") || lower.contains("cannot find") {
        return "文件或路径不存在，请检查工作目录和参数".to_string();
    }
    if lower.contains("python") && (lower.contains("not found") || lower.contains("no module")) {
        return "Python 环境异常，请确认 Python 已安装且依赖完整".to_string();
    }
    "进程启动后立即退出，请检查命令、参数和环境变量配置".to_string()
}

// ─── Process management ───────────────────────────────────────────────────

pub async fn mcp_start_server(
    app: tauri::AppHandle,
    server_id: String,
    config: McpConnectionConfig,
) -> Result<u32, String> {
    let mut cmd = Command::new(&config.command);
    cmd.args(&config.args)
        .envs(&config.env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(cwd) = &config.cwd {
        if !cwd.is_empty() {
            cmd.current_dir(cwd);
        }
    }

    let mut child = cmd.spawn().map_err(|e| {
        match e.kind() {
            std::io::ErrorKind::NotFound => {
                format!("命令「{}」未找到，请确认已安装（npx 命令需要 Node.js）", config.command)
            }
            _ => format!("启动失败: {}", e),
        }
    })?;

    let pid = child.id().unwrap_or(0);

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let sid_out = server_id.clone();
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_out.emit(
                &format!("mcp-log-{}", sid_out),
                McpLogEvent {
                    stream: "stdout".to_string(),
                    data: line,
                },
            );
        }
    });

    let app_err = app.clone();
    let sid_err = server_id.clone();
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_err.emit(
                &format!("mcp-log-{}", sid_err),
                McpLogEvent {
                    stream: "stderr".to_string(),
                    data: line,
                },
            );
        }
    });

    let app_exit = app.clone();
    let sid_exit = server_id.clone();
    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let code = status.ok().and_then(|s| s.code());
        let _ = app_exit.emit(
            &format!("mcp-exit-{}", sid_exit),
            McpExitEvent { pid, code },
        );
    });

    Ok(pid)
}

pub async fn mcp_stop_server(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| format!("停止失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Ignore "process not found" - it may have already exited
            if !stderr.to_lowercase().contains("not found")
                && !stderr.contains("没有找到")
                && !stderr.contains("不存在")
            {
                return Err(format!("停止失败: {}", stderr.trim()));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .output();
    }
    Ok(())
}

// ─── Export / Import ──────────────────────────────────────────────────────

pub fn mcp_export_config(servers: Vec<serde_json::Value>, export_path: String) -> Result<(), String> {
    let file = McpExportFile {
        version: "1.0.0".to_string(),
        exported_at: chrono::Local::now().to_rfc3339(),
        servers,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| format!("序列化失败: {}", e))?;
    if let Some(parent) = std::path::Path::new(&export_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&export_path, json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}
