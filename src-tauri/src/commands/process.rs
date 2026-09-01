//! 运行中的 AI 编程工具检测（Phase 4）。
//!
//! 匹配策略：优先精确匹配进程名，其次匹配 exe 完整路径包含关键字。
//! CLI 类工具（claude / codex）进程生命周期短，检测不到是常态，
//! 调用方应优雅降级到「目录存在性」判断，不要显示错误。

use crate::models::RunningTool;
use crate::tools;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Tauri 命令：检测当前运行中的 AI 编程工具。
#[tauri::command(rename_all = "camelCase")]
pub fn detect_running_tools() -> Vec<RunningTool> {
    detect_running_tools_internal()
}

pub fn detect_running_tools_internal() -> Vec<RunningTool> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

    let mut sys = System::new_all();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );

    let mut results: Vec<RunningTool> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for tool in tools::all_tools() {
        let fingerprints = tool.adapter().process_names;
        for (pid, process) in sys.processes() {
            let name = process.name().to_string_lossy().to_lowercase();
            let exe = process.exe().map(|p| p.to_string_lossy().to_lowercase());
            let matched = fingerprints.iter().any(|fp| {
                let fp_l = fp.to_lowercase();
                let fp_noext = fp_l.trim_end_matches(".exe");
                name == fp_l || name == fp_noext || name.ends_with(&fp_l)
                    || exe.as_deref().map(|e| e.contains(&fp_l)).unwrap_or(false)
            });
            if !matched {
                continue;
            }

            let tool_id = tool.id().to_string();
            // 每个工具只取第一个匹配进程，避免重复
            if !seen.insert(tool_id.clone()) {
                continue;
            }

            let cwd = process.cwd().map(|p| p.to_string_lossy().to_string());
            let workspace_hint = infer_workspace(tool.id(), &cwd);
            results.push(RunningTool {
                tool_id,
                pid: pid.as_u32(),
                exe_path: process.exe().map(|p| p.to_string_lossy().to_string()),
                cwd,
                workspace_hint,
            });
        }
    }

    results
}

/// 推断工具当前工作区。优先级：进程 cwd → 工具最近工作区记录。
fn infer_workspace(tool_id: &str, cwd: &Option<String>) -> Option<String> {
    if let Some(c) = cwd {
        if is_meaningful_cwd(c) {
            return Some(c.clone());
        }
    }
    match tool_id {
        "codex" => recent_codex_workspace(),
        "claude-code" => recent_claude_workspace(),
        // VS Code 系（Cursor/Trae）的最近工作区记录在 state.vscdb（SQLite），
        // 为避免引入 sqlite 依赖暂不解析，仅用进程 cwd；需真机验证后增强。
        _ => None,
    }
}

/// 根目录 / 家目录 / 应用安装目录等无意义 cwd 不算工作区。
fn is_meaningful_cwd(c: &str) -> bool {
    let p = PathBuf::from(c);
    if p.parent().is_none() {
        return false;
    }
    if let Some(home) = dirs::home_dir() {
        if p == home {
            return false;
        }
    }
    true
}

/// Codex：解析 ~/.codex/sessions/ 下的 JSONL，取最近一条的 cwd。
fn recent_codex_workspace() -> Option<String> {
    let sessions = dirs::home_dir()?.join(".codex").join("sessions");
    let entries = std::fs::read_dir(sessions).ok()?;
    let mut newest: Option<(std::time::SystemTime, String)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            let modified = std::fs::metadata(&path).ok()?.modified().ok()?;
            if let Some(cwd) = extract_codex_cwd(&path) {
                let better = newest
                    .as_ref()
                    .map(|(t, _)| modified > *t)
                    .unwrap_or(true);
                if better {
                    newest = Some((modified, cwd));
                }
            }
        }
    }
    newest.map(|(_, cwd)| cwd)
}

fn extract_codex_cwd(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    for line in content.lines().rev() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(cwd) = v.get("cwd").and_then(|c| c.as_str()) {
                return Some(cwd.to_string());
            }
        }
    }
    None
}

/// Claude Code：~/.claude/projects/ 下目录名形如 `-Users-name-project`
/// （路径分隔符替换为连字符），取最近修改的目录还原为路径。
fn recent_claude_workspace() -> Option<String> {
    let projects = dirs::home_dir()?.join(".claude").join("projects");
    let entries = std::fs::read_dir(projects).ok()?;
    let mut newest: Option<(std::time::SystemTime, String)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let modified = std::fs::metadata(&path).ok()?.modified().ok()?;
        let name = path.file_name()?.to_string_lossy().to_string();
        if let Some(cwd) = decode_claude_project_dir(&name) {
            let better = newest
                .as_ref()
                .map(|(t, _)| modified > *t)
                .unwrap_or(true);
            if better {
                newest = Some((modified, cwd));
            }
        }
    }
    newest.map(|(_, cwd)| cwd)
}

/// 还原 Claude Code 项目目录名。Claude Code 把路径分隔符（/）替换为连字符，
/// 还原时先换回 / 再按组件重组为平台分隔符（Windows 上得到反斜杠）。
/// 目录名本身含连字符时无法区分，属尽力还原（best-effort），需真机验证。
fn decode_claude_project_dir(name: &str) -> Option<String> {
    if !name.starts_with('-') {
        return None;
    }
    let decoded = name[1..].replace('-', "/");
    let p = PathBuf::from(&decoded);
    if p.is_absolute() {
        // PathBuf 构造不归一化分隔符（Windows 上保留正斜杠），
        // 用 components() 重组为平台原生分隔符。
        let normalized: PathBuf = p.components().collect();
        Some(normalized.to_string_lossy().to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meaningful_cwd_excludes_root_and_home() {
        assert!(!is_meaningful_cwd("/"));
        assert!(!is_meaningful_cwd("C:\\"));
        if let Some(home) = dirs::home_dir() {
            assert!(!is_meaningful_cwd(&home.to_string_lossy()));
        }
        assert!(is_meaningful_cwd("/home/user/project"));
        assert!(is_meaningful_cwd("C:\\Users\\me\\dev\\app"));
    }

    #[test]
    fn decodes_claude_project_dir() {
        #[cfg(windows)]
        {
            assert_eq!(
                decode_claude_project_dir("-C:-Users-me-dev-app").as_deref(),
                Some("C:\\Users\\me\\dev\\app")
            );
        }
        #[cfg(not(windows))]
        {
            assert_eq!(
                decode_claude_project_dir("-Users-me-dev-app").as_deref(),
                Some("/Users/me/dev/app")
            );
        }
        assert_eq!(decode_claude_project_dir("plain-name"), None);
    }
}
