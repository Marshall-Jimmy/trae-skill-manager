//! 收藏列表导出/导入（Phase 10 产品化）。
//!
//! 收藏本质是技能 ID 数组（前端存 localStorage），这里只负责 JSON 文件读写，
//! 支持纯数组 `["a","b"]` 与带元信息的封装格式两种。

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct FavoritesFile {
    pub version: String,
    pub ids: Vec<String>,
    pub exported_at: String,
}

/// 导出收藏列表到 JSON 文件。
pub fn export_favorites(ids: Vec<String>, export_path: &str) -> Result<(), String> {
    let data = FavoritesFile {
        version: "1.0.0".to_string(),
        ids,
        exported_at: chrono::Local::now().to_rfc3339(),
    };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(export_path, json).map_err(|e| format!("写入文件失败: {}", e))
}

/// 导入收藏列表。兼容纯 id 数组与带版本号的封装格式。
pub fn import_favorites(import_path: &str) -> Result<Vec<String>, String> {
    let content =
        fs::read_to_string(import_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let trimmed = content.trim();
    if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<String>>(trimmed)
            .map_err(|e| format!("解析收藏列表失败: {}", e))
    } else {
        let data: FavoritesFile =
            serde_json::from_str(trimmed).map_err(|e| format!("解析收藏文件失败: {}", e))?;
        Ok(data.ids)
    }
}
