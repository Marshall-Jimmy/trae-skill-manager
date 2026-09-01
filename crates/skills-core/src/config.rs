//! 配置读写：GUI 与 CLI 共用同一份配置文件
//! （`dirs::data_dir()/trae-skill-manager/config.json`），保证跨入口一致。

use crate::models::{AppConfig, GithubConfig, LocalApiConfig, TranslationConfig};
use std::path::PathBuf;

/// 配置文件路径（GUI 与 CLI 共用）。
pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

/// 应用数据目录（缓存、历史、日志等）。
pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_default()
        .join("trae-skill-manager")
}

/// 读取配置；文件缺失或损坏时回退到默认值（不报错）。
pub fn load_config() -> AppConfig {
    let default = default_config();
    if let Ok(content) = std::fs::read_to_string(config_path()) {
        if let Ok(mut saved) = serde_json::from_str::<AppConfig>(&content) {
            // 兼容旧配置：空路径/空字段用默认值补齐
            if saved.global_skills_path.is_empty() {
                saved.global_skills_path = default.global_skills_path.clone();
            }
            if saved.translation.api_base.is_empty() {
                saved.translation.api_base = default.translation.api_base.clone();
            }
            if saved.translation.model.is_empty() {
                saved.translation.model = default.translation.model.clone();
            }
            return saved;
        }
    }
    default
}

/// 默认配置：技能目录自动探测，其余字段与 GUI 保持一致。
pub fn default_config() -> AppConfig {
    let detected_skills_path = crate::utils::path::detect_skills_path()
        .to_string_lossy()
        .to_string();
    AppConfig {
        global_skills_path: detected_skills_path,
        project_path: String::new(),
        theme: "dark".to_string(),
        accent_color: Some("0,255,136".to_string()),
        language: Some("system".to_string()),
        translation: TranslationConfig {
            enabled: false,
            target_language: "zh".to_string(),
            api_key: String::new(),
            api_base: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            use_immersive: false,
        },
        github: GithubConfig { token: String::new() },
        active_tool_id: "trae".to_string(),
        local_api: LocalApiConfig {
            enabled: false,
            port: 18765,
            token: String::new(),
        },
        whitelist_enabled: false,
        white_listed_origins: vec![
            "anthropics".to_string(),
            "vercel-labs".to_string(),
            "google".to_string(),
            "microsoft".to_string(),
        ],
    }
}

/// 源白名单校验（Phase 9.7）：未开启时放行；开启后仅允许白名单内 org 安装。
/// 大小写不敏感，匹配来源的 org 段（source = "<owner>/<repo>"）。
pub fn check_source_whitelist(source: &str) -> Result<(), String> {
    let cfg = load_config();
    if !cfg.whitelist_enabled {
        return Ok(());
    }
    let owner = source
        .split('/')
        .next()
        .unwrap_or(source)
        .trim()
        .to_lowercase();
    let allowed = cfg.white_listed_origins.iter().any(|o| {
        o.trim().to_lowercase() == owner
    });
    if allowed {
        Ok(())
    } else {
        Err(format!(
            "源白名单已开启，来源 {} 不在允许列表内（允许: {}）",
            source,
            cfg.white_listed_origins.join(", ")
        ))
    }
}

/// 保存配置（先建目录再原子写入）。
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("配置序列化失败: {}", e))?;
    std::fs::write(&path, &json).map_err(|e| format!("配置写入失败: {}", e))?;
    Ok(())
}
