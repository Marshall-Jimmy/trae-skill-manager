use std::path::PathBuf;

/// Auto-detect the TRAE skills directory by checking common locations.
/// 委托给 Trae 适配器（Phase 3 迁移），行为与改造前完全一致。
pub fn detect_skills_path() -> PathBuf {
    crate::tools::get_tool("trae")
        .and_then(|t| t.global_dir())
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".trae-cn").join("skills"))
}
