use crate::models::InstallRecord;
use serde_json;
use std::fs;
use std::path::Path;

/// Toggle (enable/disable) a skill by renaming SKILL.md <-> SKILL.md.disabled.
/// Returns a JSON object with the new enabled state.
pub fn toggle_skill(skill_path: &str) -> Result<serde_json::Value, String> {
    let path = Path::new(skill_path);

    if !path.exists() {
        return Err(format!("Skill directory not found: {}", skill_path));
    }

    // Extract skill name from the path (last component)
    let skill_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let skill_md = path.join("SKILL.md");
    let skill_md_disabled = path.join("SKILL.md.disabled");

    let enabled: bool;
    let action: &str;

    if skill_md.exists() {
        // Disable: rename SKILL.md -> SKILL.md.disabled
        fs::rename(&skill_md, &skill_md_disabled)
            .map_err(|e| format!("Failed to disable skill: {}", e))?;
        enabled = false;
        action = "disable";
    } else if skill_md_disabled.exists() {
        // Enable: rename SKILL.md.disabled -> SKILL.md
        fs::rename(&skill_md_disabled, &skill_md)
            .map_err(|e| format!("Failed to enable skill: {}", e))?;
        enabled = true;
        action = "enable";
    } else {
        return Err(format!(
            "No SKILL.md or SKILL.md.disabled found in: {}",
            skill_path
        ));
    }

    // Write history record
    let timestamp = chrono::Utc::now().timestamp_millis();
    let record = InstallRecord {
        id: format!("{}-{}", action, timestamp),
        action: action.to_string(),
        skill_name,
        source: String::new(),
        timestamp,
        success: true,
        message: format!("Skill {}d successfully", action),
    };
    let _ = crate::commands::history::add_history_record(record);

    Ok(serde_json::json!({ "enabled": enabled, "path": skill_path }))
}

/// Check if a skill is currently enabled (has SKILL.md, not SKILL.md.disabled).
#[allow(dead_code)]
pub fn is_skill_enabled(skill_path: &str) -> bool {
    let path = Path::new(skill_path);
    path.join("SKILL.md").exists() && !path.join("SKILL.md.disabled").exists()
}
