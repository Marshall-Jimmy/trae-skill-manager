use std::path::PathBuf;

/// Auto-detect the TRAE skills directory by checking common locations.
/// Returns the first existing path, or the first candidate as default.
pub fn detect_skills_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();

    let mut candidates: Vec<PathBuf> = vec![
        home.join(".trae-cn").join("skills"),
        home.join(".trae").join("skills"),
    ];

    // Platform-specific paths
    #[cfg(windows)]
    {
        if let Some(appdata) = dirs::data_dir() {
            candidates.push(appdata.join("Trae").join("skills"));
        }
        if let Some(local_appdata) = dirs::data_local_dir() {
            candidates.push(local_appdata.join("Trae").join("skills"));
        }
    }

    #[cfg(not(windows))]
    {
        if let Some(config_dir) = dirs::config_dir() {
            candidates.push(config_dir.join("trae").join("skills"));
        }
    }

    // Return first existing path
    for path in &candidates {
        if path.exists() {
            return path.clone();
        }
    }

    // Default fallback: first candidate
    candidates[0].clone()
}

/// Resolve the skills path from an optional config value.
/// If config_path is Some and non-empty, use it directly.
/// Otherwise, fall back to auto-detection.
pub fn resolve_skills_path(config_path: Option<&str>) -> PathBuf {
    if let Some(p) = config_path {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    detect_skills_path()
}

/// Normalize a path string:
/// - Replace backslashes with forward slashes
/// - Remove trailing slashes
pub fn normalize_path(p: &str) -> String {
    let mut s = p.replace('\\', "/");
    while s.ends_with('/') {
        s.pop();
    }
    s
}
