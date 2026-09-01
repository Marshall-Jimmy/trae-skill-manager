use crate::models::LocalSkill;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportedConfig {
    pub version: String,
    pub skills: Vec<ExportedSkill>,
    pub exported_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportedSkill {
    pub name: String,
    pub source: String,
    pub enabled: bool,
}

pub fn export_skills(skills: Vec<LocalSkill>, export_path: &str) -> Result<(), String> {
    let exported = ExportedConfig {
        version: "1.0.0".to_string(),
        skills: skills.into_iter().map(|s| ExportedSkill {
            name: s.name,
            source: s.path,
            enabled: s.enabled,
        }).collect(),
        exported_at: chrono::Local::now().to_rfc3339(),
    };

    let json = serde_json::to_string_pretty(&exported)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    fs::write(export_path, json)
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(())
}

pub fn import_skills(import_path: &str) -> Result<Vec<ExportedSkill>, String> {
    let content = fs::read_to_string(import_path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;

    let config: ExportedConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse import file: {}", e))?;

    Ok(config.skills)
}
