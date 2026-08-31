use crate::models::{LocalSkill, SkillManifest};
use std::fs;
use std::path::Path;

const MANIFEST_FILE: &str = "skill.manifest.json";

/// Scan a directory for installed skills (global or project-level).
pub fn scan_directory(path: &Path) -> Vec<LocalSkill> {
    let mut skills = Vec::new();

    if !path.exists() {
        return skills;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return skills,
    };

    for entry in entries.flatten() {
        let skill_path = entry.path();
        if !skill_path.is_dir() {
            continue;
        }

        // Skip backup directories
        let dir_name = skill_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if dir_name.ends_with(".bak") {
            continue;
        }

        // Try to read manifest first (authoritative metadata source)
        let manifest = read_manifest(&skill_path);

        let skill_md = skill_path.join("SKILL.md");
        let skill_md_disabled = skill_path.join("SKILL.md.disabled");

        let (content, enabled) = if skill_md.exists() {
            (fs::read_to_string(&skill_md).ok(), true)
        } else if skill_md_disabled.exists() {
            (fs::read_to_string(&skill_md_disabled).ok(), false)
        } else {
            continue;
        };

        let content = match content {
            Some(c) => c,
            None => continue,
        };

        let parsed = parse_skill_header(&content);
        let dir_name_str = skill_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Prefer manifest name, then SKILL.md name, then directory name
        let skill_name = manifest
            .as_ref()
            .map(|m| m.name.clone())
            .or_else(|| parsed.name.clone())
            .unwrap_or(dir_name_str);

        let description = parsed.description.clone().unwrap_or_default();

        let version = manifest
            .as_ref()
            .and_then(|m| m.version.clone())
            .or_else(|| parsed.version.clone());

        let manifest_id = manifest.as_ref().map(|m| m.id.clone());
        let source = manifest.as_ref().map(|m| m.source.clone());
        let install_method = manifest.as_ref().map(|m| m.install_method.clone());
        let installed_at = manifest.as_ref().map(|m| m.installed_at);
        let update_available = manifest.as_ref().map(|m| m.update_available).unwrap_or(false);
        let remote_hash = manifest.as_ref().and_then(|m| m.remote_hash.clone());
        let last_checked_at = manifest.as_ref().and_then(|m| m.last_checked_at);
        let manifest_hash = manifest.as_ref().and_then(|m| m.hash.clone());

        skills.push(LocalSkill {
            name: skill_name,
            description,
            path: skill_path.to_string_lossy().to_string(),
            skill_type: "global".to_string(),
            enabled,
            version,
            tags: parsed.tags,
            manifest_id,
            source,
            install_method,
            installed_at,
            update_available,
            remote_hash,
            last_checked_at,
            hash: manifest_hash,
        });
    }

    skills
}

/// Read and parse the skill manifest from a skill directory.
fn read_manifest(skill_dir: &Path) -> Option<SkillManifest> {
    let manifest_path = skill_dir.join(MANIFEST_FILE);
    if !manifest_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&manifest_path).ok()?;
    serde_json::from_str::<SkillManifest>(&content).ok()
}

/// Write a skill manifest to a skill directory.
pub fn write_manifest(skill_dir: &Path, manifest: &SkillManifest) -> Result<(), String> {
    let manifest_path = skill_dir.join(MANIFEST_FILE);
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, json)
        .map_err(|e| format!("Failed to write manifest: {}", e))
}

/// Scan a project's tool-specific skills directory (e.g. .trae/skills/) for
/// project-level skills. The directory is resolved through the tool adapter.
pub fn scan_project_skills(project_path: &str, tool: &dyn crate::tools::Tool) -> Vec<LocalSkill> {
    let skills_dir = tool.project_dir(Path::new(project_path));

    if !skills_dir.exists() {
        return Vec::new();
    }

    let mut skills = scan_directory(&skills_dir);
    for skill in &mut skills {
        skill.skill_type = "project".to_string();
    }
    skills
}

/// Parsed frontmatter fields from SKILL.md.
struct ParsedHeader {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
    tags: Vec<String>,
}

/// Parse YAML-like frontmatter from SKILL.md content.
fn parse_skill_header(content: &str) -> ParsedHeader {
    let content_trimmed = content.trim();

    // If no frontmatter, try extracting from heading
    if !content_trimmed.starts_with("---") {
        let name = content_trimmed
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").trim().to_string());
        return ParsedHeader {
            name,
            description: None,
            version: None,
            tags: Vec::new(),
        };
    }

    // Find the closing ---
    let end = match content_trimmed[3..].find("---") {
        Some(pos) => pos + 3,
        None => {
            return ParsedHeader {
                name: None,
                description: None,
                version: None,
                tags: Vec::new(),
            }
        }
    };

    let frontmatter = &content_trimmed[3..end];

    let mut name = None;
    let mut description = None;
    let mut version = None;
    let mut tags = Vec::new();

    for line in frontmatter.lines() {
        let line = line.trim();

        if let Some(val) = line.strip_prefix("name:") {
            name = Some(clean_yaml_value(val));
        } else if let Some(val) = line.strip_prefix("description:") {
            description = Some(clean_yaml_value(val));
        } else if let Some(val) = line.strip_prefix("version:") {
            version = Some(clean_yaml_value(val));
        } else if let Some(val) = line.strip_prefix("tags:") {
            let trimmed = val.trim();
            // Handle array-like tags: [tag1, tag2]
            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                let inner = &trimmed[1..trimmed.len() - 1];
                for tag in inner.split(',') {
                    let t = tag.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !t.is_empty() {
                        tags.push(t);
                    }
                }
            } else if !trimmed.is_empty() {
                // Single tag value
                tags.push(clean_yaml_value(trimmed));
            }
        }
    }

    ParsedHeader {
        name,
        description,
        version,
        tags,
    }
}

/// Clean a YAML value: trim whitespace and remove surrounding quotes.
fn clean_yaml_value(val: &str) -> String {
    val.trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}
