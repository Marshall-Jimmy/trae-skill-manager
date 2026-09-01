//! 缓存统计与清理（Phase 10 产品化）。
//!
//! 集中管理数据目录下的各类缓存文件：技能列表缓存、趋势快照、
//! repo info 缓存、翻译缓存。GUI / CLI / MCP 共用同一份缓存目录。

use serde::Serialize;
use std::path::PathBuf;

fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_default()
        .join("trae-skill-manager")
}

/// 需要管理的缓存文件名（相对数据目录）。
const CACHE_FILES: &[&str] = &[
    "skills_cache.json",
    "skills_snapshot.json",
    "repo_info_cache.json",
    "translations.json",
];

#[derive(Debug, Serialize)]
pub struct CacheEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub entries: Vec<CacheEntry>,
    pub total_bytes: u64,
}

fn file_size(path: &PathBuf) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// 统计各缓存文件的大小。
pub fn get_cache_stats() -> CacheStats {
    let dir = data_dir();
    let mut entries = Vec::new();
    let mut total = 0u64;
    for name in CACHE_FILES {
        let path = dir.join(name);
        let size = file_size(&path);
        total += size;
        entries.push(CacheEntry {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: size,
        });
    }
    CacheStats { entries, total_bytes: total }
}

/// 删除所有缓存文件，返回释放的字节数。
pub fn clear_cache() -> Result<CacheStats, String> {
    let dir = data_dir();
    let mut entries = Vec::new();
    let mut total = 0u64;
    for name in CACHE_FILES {
        let path = dir.join(name);
        let size = file_size(&path);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("无法删除缓存 {}: {}", name, e))?;
        }
        total += size;
        entries.push(CacheEntry {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: size,
        });
    }
    Ok(CacheStats { entries, total_bytes: total })
}
