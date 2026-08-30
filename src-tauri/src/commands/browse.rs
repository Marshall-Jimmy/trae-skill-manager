use crate::models::FileEntry;
use std::fs;
use std::path::Path;

/// List files and directories at the given path.
pub fn browse_skill_files(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);

    if !dir.exists() {
        return Err(format!("Path not found: {}", path));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileEntry> = Vec::new();

    for entry in entries.flatten() {
        let file_path = entry.path();
        let metadata = entry.metadata().ok();

        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        files.push(FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            is_dir: file_path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
            extension: file_path
                .extension()
                .map(|ext| ext.to_string_lossy().to_string()),
        });
    }

    // Sort: directories first, then alphabetically by name
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(files)
}

/// Read the content of a file at the given path.
pub fn read_file_content(path: &str) -> Result<String, String> {
    let file_path = Path::new(path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    if file_path.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", path));
    }

    // Reject binary files by extension
    if let Some(ext) = file_path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        let binary_extensions = [
            "exe", "dll", "so", "dylib", "bin", "png", "jpg", "jpeg", "gif",
            "ico", "bmp", "tiff", "webp", "svg", "zip", "tar", "gz", "rar",
            "7z", "woff", "woff2", "ttf", "otf", "eot", "pdf", "doc", "docx",
            "xls", "xlsx", "ppt", "pptx", "mp3", "mp4", "avi", "mov", "mkv",
        ];
        if binary_extensions.contains(&ext_str.as_str()) {
            return Err(format!("Binary file ({}) cannot be read as text", ext_str));
        }
    }

    // Also check file size (reject files > 1MB)
    if let Ok(metadata) = fs::metadata(file_path) {
        if metadata.len() > 1_048_576 {
            return Err("File is too large (> 1MB)".to_string());
        }
    }

    fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
