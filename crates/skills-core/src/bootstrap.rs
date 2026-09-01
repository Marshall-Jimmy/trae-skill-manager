//! skill-discovery 自举技能（Phase 9.6）。
//!
//! 把「教 AI 用 skillctl 搜索安装技能」的 SKILL.md 写入各工具的技能目录，
//! 形成闭环：管理器 → 给 AI 装技能 → 其中一个教 AI 用管理器。

use crate::models::InstallRecord;
use crate::tools::Tool;
use std::path::PathBuf;
use std::time::SystemTime;

pub const SKILL_NAME: &str = "skill-discovery";

/// 内置 skill-discovery 的 SKILL.md 全文。
/// `allowed-tools` 声明为 Bash(skillctl:*)，让 AI 在缺少能力时用 skillctl 搜索安装。
pub const SKILL_MD: &str = r#"---
name: skill-discovery
description: 当你缺少完成某个任务所需的专业能力，或用户要求的领域知识超出你的默认能力时，使用本技能搜索并安装 Agent Skill。适用场景：用户提到某个专业领域（PDF 处理、数据可视化、特定框架最佳实践、行业规范），而当前没有对应技能可用。
allowed-tools: Bash(skillctl:*)
---

# 技能发现与安装

## 何时使用

- 用户提到的任务需要专业知识，但你没有对应技能
- 你发现自己在重复编写同类指令
- 用户明确说「装个技能来做这个」

## 指令

1. 先检查本机已有的技能，避免重复安装：
   skillctl list --json

2. 用任务描述搜索推荐（比关键词搜索更准）：
   skillctl recommend "<用一句话描述用户的任务>" --json

3. 查看候选技能详情，确认它真的匹配：
   skillctl info <source>/<slug> --json

4. 向用户说明你要装什么、为什么，得到同意后安装：
   skillctl install <source>/<slug>

5. 安装后告知用户技能已就绪，可以直接使用。

## 注意

- 不要未经用户确认就安装技能
- 优先推荐官方源（anthropics、vercel-labs、google、microsoft 等）
- 如果搜索不到合适的，如实告诉用户，不要装不相关的技能凑数
"#;

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// 安装 skill-discovery 到指定工具。
/// 幂等：目录已存在则仅更新 SKILL.md；返回实际安装路径。
pub fn install_bootstrap(tool: &dyn Tool) -> Result<PathBuf, String> {
    let dir = tool
        .global_dir()
        .ok_or_else(|| format!("无法确定 {} 的技能目录", tool.display_name()))?;
    let dest = dir.join(SKILL_NAME);
    std::fs::create_dir_all(&dest)
        .map_err(|e| format!("创建技能目录失败: {}", e))?;
    std::fs::write(dest.join("SKILL.md"), SKILL_MD)
        .map_err(|e| format!("写入 SKILL.md 失败: {}", e))?;
    Ok(dest)
}

/// 安装 skill-discovery 到所有检测到（已安装）的工具，返回逐工具结果。
pub fn install_bootstrap_all() -> Result<Vec<serde_json::Value>, String> {
    let mut results = Vec::new();
    for tool in crate::tools::all_tools() {
        let installed = tool.global_dir().is_some();
        let result = if installed {
            match install_bootstrap(tool) {
                Ok(path) => serde_json::json!({
                    "tool": tool.id(),
                    "installed": true,
                    "path": path.to_string_lossy(),
                }),
                Err(e) => serde_json::json!({
                    "tool": tool.id(),
                    "installed": false,
                    "error": e,
                }),
            }
        } else {
            serde_json::json!({
                "tool": tool.id(),
                "installed": false,
                "error": "工具未安装",
            })
        };
        results.push(result);
    }
    Ok(results)
}

/// 写一条审计历史（Phase 9.7）：自举安装也记入 InstallRecord。
pub fn write_bootstrap_history(tool_id: &str, dest: &str) {
    let timestamp = timestamp_ms();
    let record = InstallRecord {
        id: format!("bootstrap-{}", timestamp),
        action: "bootstrap".to_string(),
        skill_name: SKILL_NAME.to_string(),
        source: "builtin".to_string(),
        timestamp,
        success: true,
        message: format!("skill-discovery 已安装到 {}（{}）", tool_id, dest),
        origin: Some("cli".to_string()),
    };
    let _ = crate::history::add_history_record(record);
}
