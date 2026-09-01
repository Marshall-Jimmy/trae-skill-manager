//! Tool Adapter 抽象层：把「技能装到哪个目录、用什么格式、要不要注册」从
//! 核心抓取/解析/安装逻辑中解耦，让本应用从「只服务 Trae」升级为
//! 「跨 AI 编程工具的 Agent Skills 中枢」。
//!
//! 设计：`ToolAdapter` 是纯静态元数据（id/路径/格式方言），`Tool` trait 在
//! 其上叠加动态行为（检测/安装钩子）。注册表 `all_tools()` / `get_tool()`
//! 供命令层按 toolId 取用，默认工具始终是 Trae（保证零回归）。
//!
//! 以下字段/方法由 Phase 3 规范定义，作为适配器 API 表面，供 Phase 4
//! （进程检测）、Phase 5（.agents 统一安装）、Phase 6（MCP 转译）消费，
//! 当前阶段尚未被读取属预期，故统一关闭 dead_code 告警。

#![allow(dead_code)]

use std::path::{Path, PathBuf};

use super::frontmatter::SkillFrontmatter;

/// 技能格式方言
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillFormat {
    /// 标准 SKILL.md（agentskills.io）
    Standard,
    /// 标准 + 厂商扩展 frontmatter 字段
    WithExtensions,
}

/// 跨目录链接策略（Phase 5 使用）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkStrategy {
    Symlink,
    Junction,
    Copy,
}

/// MCP 配置格式（Phase 6 使用）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpConfigFormat {
    Json,
    Toml,
}

/// MCP 配置位置与格式（Phase 6 使用）
#[derive(Debug, Clone, Copy)]
pub struct McpConfigSpec {
    pub global_path: Option<&'static str>,
    pub project_path: &'static str,
    pub format: McpConfigFormat,
}

/// 运行中的工具信息（Phase 4 填充）
#[derive(Debug, Clone)]
pub struct RunningInfo {
    pub pid: u32,
    pub exe_path: Option<String>,
    pub cwd: Option<String>,
    pub workspace_hint: Option<String>,
}

/// 工具的静态元数据。`global_dirs` 是函数指针，便于按平台/环境动态计算候选路径。
pub struct ToolAdapter {
    pub id: &'static str,
    pub display_name: &'static str,
    pub icon: &'static str,
    /// 运行检测的进程名指纹（Phase 4 使用）
    pub process_names: &'static [&'static str],
    /// 全局技能目录候选（按优先级）
    pub global_dirs: fn() -> Vec<PathBuf>,
    /// 项目级相对路径，如 ".trae/skills"
    pub project_dir: &'static str,
    pub format: SkillFormat,
    pub link_strategy: LinkStrategy,
    /// 是否支持 .agents/skills 约定目录
    pub supports_agents_dir: bool,
    /// 额外注册表，如 Trae 的 skill-config.json
    pub config_file: Option<&'static str>,
    pub mcp_config: Option<McpConfigSpec>,
}

/// 工具的动态行为。默认实现足够通用，厂商差异用钩子覆盖。
pub trait Tool: Send + Sync {
    fn adapter(&self) -> &ToolAdapter;

    fn id(&self) -> &str {
        self.adapter().id
    }

    fn display_name(&self) -> &str {
        self.adapter().display_name
    }

    fn icon(&self) -> &str {
        self.adapter().icon
    }

    /// 目录存在性检测（最可靠的「已安装」信号）
    fn detect_installed(&self) -> bool {
        self.global_dir().map(|d| d.exists()).unwrap_or(false)
    }

    /// 进程运行检测（Phase 4 实现，默认未运行）
    fn detect_running(&self) -> Option<RunningInfo> {
        None
    }

    /// 全局技能目录：返回第一个已存在的候选；都不存在则返回第一个候选。
    fn global_dir(&self) -> Option<PathBuf> {
        let dirs = (self.adapter().global_dirs)();
        dirs.iter()
            .find(|p| p.exists())
            .cloned()
            .or_else(|| dirs.into_iter().next())
    }

    /// 项目级技能目录
    fn project_dir(&self, project_root: &Path) -> PathBuf {
        project_root.join(self.adapter().project_dir)
    }

    /// 格式方言转换：把厂商特有 frontmatter 字段剥离/改写为目标工具所需。
    fn normalize_skill(&self, _fm: &mut SkillFrontmatter) {}

    /// 安装后钩子（如 Trae 的 managedSkills 注册）。
    fn post_install(&self, _skill_dir: &Path) -> Result<(), String> {
        Ok(())
    }
}
