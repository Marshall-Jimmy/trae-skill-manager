use serde::{Deserialize, Serialize};

// ─── Remote Skill (from skills.sh API) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSkill {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub source: String,
    pub installs: u64,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "installUrl")]
    pub install_url: String,
    pub url: String,
    #[serde(default, rename = "isDuplicate")]
    pub is_duplicate: bool,
    #[serde(rename = "dataSource")]
    pub data_source: String,
    pub stars: Option<u64>,
}

// ─── Skill Detail (from detail API) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDetail {
    pub id: String,
    pub source: String,
    pub slug: String,
    pub installs: u64,
    #[serde(default)]
    pub hash: Option<String>,
    pub files: Vec<SkillFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    pub path: String,
    pub contents: String,
}

// ─── Pagination ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub page: u32,
    #[serde(rename = "perPage")]
    pub per_page: u32,
    pub total: u32,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
}

// ─── API Response wrapper ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub data: T,
    pub pagination: Option<Pagination>,
}

// ─── Local Skill (scanned from disk) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    #[serde(rename = "type")]
    pub skill_type: String,
    pub enabled: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Unique manifest ID (e.g. "anthropics/skills/web-search").
    /// None for legacy installs without a manifest file.
    #[serde(default, rename = "manifestId")]
    pub manifest_id: Option<String>,
    /// Source repository (from manifest).
    #[serde(default)]
    pub source: Option<String>,
    /// Install method used (from manifest).
    #[serde(default, rename = "installMethod")]
    pub install_method: Option<String>,
    /// Install timestamp in ms (from manifest).
    #[serde(default, rename = "installedAt")]
    pub installed_at: Option<i64>,
    /// Whether an update is available (from manifest).
    #[serde(default, rename = "updateAvailable")]
    pub update_available: bool,
    /// Remote latest commit hash (from manifest).
    #[serde(default, rename = "remoteHash")]
    pub remote_hash: Option<String>,
    /// Last checked update timestamp (from manifest).
    #[serde(default, rename = "lastCheckedAt")]
    pub last_checked_at: Option<i64>,
    /// Current local hash (from manifest).
    #[serde(default)]
    pub hash: Option<String>,
}

// ─── Install Record (operation history) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallRecord {
    pub id: String,
    pub action: String,        // "install" | "remove" | "toggle"
    pub skill_name: String,
    pub source: String,
    pub timestamp: i64,        // unix timestamp in milliseconds
    pub success: bool,
    pub message: String,
}

// ─── File Entry (file browser) ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub extension: Option<String>,
}

// ─── Repo Skill Info (from `npx skills add --list`) ──────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSkillInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

// ─── GitHub Repo Info ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub stargazers_count: u64,
    pub forks_count: u64,
    pub open_issues_count: u64,
    pub language: Option<String>,
    pub license: Option<LicenseInfo>,
    pub created_at: String,
    pub updated_at: String,
    pub pushed_at: String,
    pub owner: OwnerInfo,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerInfo {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub spdx_id: Option<String>,
    pub name: Option<String>,
}

// ─── GitHub Config ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GithubConfig {
    #[serde(default)]
    pub token: String,
}

// ─── Translation Config ───────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TranslationConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_target_language")]
    pub target_language: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_api_base")]
    pub api_base: String,
    #[serde(default = "default_model")]
    pub model: String,
}

fn default_target_language() -> String {
    "zh".to_string()
}

fn default_api_base() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

// ─── App Config ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub global_skills_path: String,
    pub project_path: String,
    pub theme: String,
    #[serde(default)]
    pub translation: TranslationConfig,
    #[serde(default)]
    pub github: GithubConfig,
}

// ─── Install Output Event (streamed to frontend) ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InstallOutputEvent {
    #[serde(rename = "stdout")]
    Stdout { data: String },
    #[serde(rename = "stderr")]
    Stderr { data: String },
    #[serde(rename = "done")]
    Done { success: bool, message: String },
}

// ─── Install Result ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub success: bool,
    pub skill_name: String,
    pub skill_path: String,
    pub method: String,
    pub verified: bool,
    pub error: Option<String>,
    pub files_installed: u32,
    pub local_skills: Vec<LocalSkill>,
}

// ─── Skill Manifest (stored in each installed skill dir) ──────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifest {
    /// Unique ID: "<source>/<skill_name>" e.g. "anthropics/skills/web-search"
    pub id: String,
    /// Skill name (directory name)
    pub name: String,
    /// Source repository, e.g. "anthropics/skills"
    pub source: String,
    /// Source type, e.g. "github"
    #[serde(default = "default_source_type")]
    pub source_type: String,
    /// Install method used: "git" | "degit" | "npx"
    pub install_method: String,
    /// Install timestamp (unix ms)
    pub installed_at: i64,
    /// Last updated timestamp (unix ms)
    pub updated_at: i64,
    /// Version from SKILL.md frontmatter (if any)
    #[serde(default)]
    pub version: Option<String>,
    /// Optional hash / revision (local installed version)
    #[serde(default)]
    pub hash: Option<String>,
    /// Number of files installed
    pub files_installed: u32,
    /// Manifest schema version
    #[serde(default = "default_manifest_version")]
    pub schema_version: u32,
    /// Remote latest commit hash (for update comparison)
    #[serde(default)]
    pub remote_hash: Option<String>,
    /// Last checked update timestamp (unix ms)
    #[serde(default)]
    pub last_checked_at: Option<i64>,
    /// Whether an update is available
    #[serde(default)]
    pub update_available: bool,
    /// Latest version string (if any)
    #[serde(default)]
    pub latest_version: Option<String>,
}

fn default_source_type() -> String {
    "github".to_string()
}

fn default_manifest_version() -> u32 {
    1
}

// ─── Update Check Result ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub skill_path: String,
    pub skill_name: String,
    pub has_update: bool,
    #[serde(default)]
    pub current_hash: Option<String>,
    #[serde(default)]
    pub latest_hash: Option<String>,
    pub last_checked_at: i64,
    #[serde(default)]
    pub error: Option<String>,
}

// ─── Update Result ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub success: bool,
    pub skill_name: String,
    pub skill_path: String,
    #[serde(default)]
    pub previous_hash: Option<String>,
    #[serde(default)]
    pub new_hash: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    pub local_skills: Vec<LocalSkill>,
}
