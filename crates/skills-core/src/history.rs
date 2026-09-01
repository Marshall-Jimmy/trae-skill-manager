use crate::models::InstallRecord;
use std::fs;
use std::path::PathBuf;

/// Get the history file path.
fn history_file_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir()
        .ok_or("Cannot find data directory")?;
    let app_dir = data_dir.join("trae-skill-manager");
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    Ok(app_dir.join("history.json"))
}

/// Add a new history record.
pub fn add_history_record(record: InstallRecord) -> Result<(), String> {
    let path = history_file_path()?;
    let mut records = get_history()?;

    records.insert(0, record);

    // Keep at most 500 records
    records.truncate(500);

    let json = serde_json::to_string_pretty(&records)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write history file: {}", e))
}

/// Get all history records.
pub fn get_history() -> Result<Vec<InstallRecord>, String> {
    let path = history_file_path()?;

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read history file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse history file: {}", e))
}

/// Clear all history records.
pub fn clear_history() -> Result<(), String> {
    let path = history_file_path()?;

    if path.exists() {
        let json = serde_json::to_string_pretty(&Vec::<InstallRecord>::new())
            .map_err(|e| format!("Failed to serialize empty history: {}", e))?;
        fs::write(&path, json)
            .map_err(|e| format!("Failed to clear history file: {}", e))?;
    }

    Ok(())
}
