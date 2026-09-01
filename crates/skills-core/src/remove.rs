use crate::models::InstallRecord;
use std::fs;
use std::path::Path;

pub fn remove_skill(path: &str) -> Result<bool, String> {
    let skill_path = Path::new(path);

    if !skill_path.exists() {
        return Err(format!("Skill not found at: {}", path));
    }

    // Extract skill name from the path (last component)
    let skill_name = skill_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    if skill_path.is_dir() {
        fs::remove_dir_all(skill_path)
            .map_err(|e| format!("Failed to remove skill directory: {}", e))?;
    } else {
        fs::remove_file(skill_path)
            .map_err(|e| format!("Failed to remove skill file: {}", e))?;
    }

    // Write history record
    let timestamp = chrono::Utc::now().timestamp_millis();
    let record = InstallRecord {
        id: format!("remove-{}", timestamp),
        action: "remove".to_string(),
        skill_name,
        source: String::new(),
        timestamp,
        success: true,
        message: "Skill removed successfully".to_string(),
    };
    let _ = crate::history::add_history_record(record);

    Ok(true)
}
