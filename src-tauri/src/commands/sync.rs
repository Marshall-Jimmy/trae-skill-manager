//! 跨工具技能同步（Phase 5.2）。
//!
//! 维度一「按技能看」：同名技能在哪些工具中存在、路径、启用状态。
//! 维度二「按工具看」：每个工具各自有哪些技能。
//! 一键同步：把技能从源工具链接到目标工具，Windows 优先 junction（无需管理员），
//! 失败降级到目录符号链接；Unix 用 symlink。链接而非复制，保证单点更新。

use crate::models::{CrossToolSkill, ToolSkillEntry};
use crate::tools;
use std::path::Path;

/// Tauri 命令：列出所有工具的技能，按技能名分组。
#[tauri::command(rename_all = "camelCase")]
pub fn list_cross_tool_skills() -> Vec<CrossToolSkill> {
    let mut by_name: std::collections::BTreeMap<String, Vec<ToolSkillEntry>> =
        std::collections::BTreeMap::new();

    for tool in tools::all_tools() {
        let Some(global_dir) = tool.global_dir() else {
            continue;
        };
        for skill in crate::commands::scan::scan_directory(&global_dir) {
            let entry = ToolSkillEntry {
                tool_id: tool.id().to_string(),
                path: skill.path,
                enabled: skill.enabled,
            };
            by_name.entry(skill.name).or_default().push(entry);
        }
    }

    by_name
        .into_iter()
        .map(|(name, entries)| CrossToolSkill { name, entries })
        .collect()
}

/// Tauri 命令：把技能从源工具链接到目标工具（junction/symlink）。
#[tauri::command(rename_all = "camelCase")]
pub fn sync_skill_to_tool(
    skill_name: String,
    source_tool_id: String,
    target_tool_id: String,
) -> Result<(), String> {
    if source_tool_id == target_tool_id {
        return Err("源工具与目标工具相同，无需同步".to_string());
    }

    let source_tool = tools::get_tool(&source_tool_id)
        .ok_or_else(|| format!("未知源工具: {}", source_tool_id))?;
    let target_tool = tools::get_tool(&target_tool_id)
        .ok_or_else(|| format!("未知目标工具: {}", target_tool_id))?;

    let source_dir = source_tool
        .global_dir()
        .ok_or("无法确定源工具技能目录")?
        .join(&skill_name);
    if !source_dir.join("SKILL.md").exists() {
        return Err(format!("源工具 {} 中未找到技能 {}", source_tool.display_name(), skill_name));
    }

    let target_dir = target_tool
        .global_dir()
        .ok_or("无法确定目标工具技能目录")?;
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建目标技能目录失败: {}", e))?;

    let link_path = target_dir.join(&skill_name);
    if link_path.exists() {
        // 已存在：若是链接则视为已同步，否则拒绝覆盖
        let is_link = std::fs::symlink_metadata(&link_path)
            .map(|m| m.file_type().is_symlink() || m.file_type().is_dir())
            .unwrap_or(false);
        if is_link {
            return Ok(());
        }
        return Err(format!(
            "目标工具 {} 已存在同名目录，请先移除再同步",
            target_tool.display_name()
        ));
    }

    create_link(&source_dir, &link_path)
}

/// 创建目录链接：Windows 优先 junction，失败降级 symlink；Unix 用 symlink。
fn create_link(target: &Path, link: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let status = std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                &link.to_string_lossy(),
                &target.to_string_lossy(),
            ])
            .status()
            .map_err(|e| format!("无法启动 mklink: {}", e))?;
        if status.success() {
            return Ok(());
        }
        std::os::windows::fs::symlink_dir(target, link)
            .map_err(|e| format!("创建符号链接失败: {}", e))
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(target, link)
            .map_err(|e| format!("创建符号链接失败: {}", e))
    }
}

/// 移除跨工具链接（供 UI「取消同步」使用）。
#[tauri::command(rename_all = "camelCase")]
pub fn unsync_skill_from_tool(
    skill_name: String,
    target_tool_id: String,
) -> Result<(), String> {
    let target_tool = tools::get_tool(&target_tool_id)
        .ok_or_else(|| format!("未知目标工具: {}", target_tool_id))?;
    let link_path = target_tool
        .global_dir()
        .ok_or("无法确定目标工具技能目录")?
        .join(&skill_name);

    if !link_path.exists() {
        return Ok(());
    }
    let meta = std::fs::symlink_metadata(&link_path)
        .map_err(|e| format!("读取链接信息失败: {}", e))?;
    if meta.file_type().is_symlink() {
        std::fs::remove_file(&link_path)
            .map_err(|e| format!("移除链接失败: {}", e))
    } else {
        // junction 在 Windows 上 file_type 不是 symlink，用 remove_dir
        std::fs::remove_dir(&link_path)
            .map_err(|e| format!("移除 junction 失败: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_rejects_same_tool() {
        let err = sync_skill_to_tool("foo".into(), "trae".into(), "trae".into());
        assert!(err.is_err());
    }
}
