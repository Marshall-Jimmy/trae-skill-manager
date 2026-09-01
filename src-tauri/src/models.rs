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
    #[serde(default, rename = "repoDescription")]
    pub repo_description: Option<String>,
    /// Last repo update time (unix ms), used for freshness / heat ranking.
    #[serde(default, rename = "updatedAt")]
    pub updated_at: Option<i64>,
    /// Repo license SPDX id (e.g. "MIT"), from GitHub repo metadata.
    #[serde(default)]
    pub license: Option<String>,
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
#[serde(rename_all = "camelCase")]
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
    #[serde(default)]
    pub use_immersive: bool,
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
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub global_skills_path: String,
    pub project_path: String,
    pub theme: String,
    /// 强调色（"r,g,b" 三元组或 #hex），Phase 8.4 主题自定义
    #[serde(default)]
    pub accent_color: Option<String>,
    /// 界面语言（"zh" | "en" | "system"），Phase 8.2 多语言
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub translation: TranslationConfig,
    #[serde(default)]
    pub github: GithubConfig,
    /// 当前目标工具（Phase 3 Tool Adapter），默认 "trae"
    #[serde(default = "default_active_tool")]
    pub active_tool_id: String,
    /// 本地 HTTP 网关配置（Phase 9.1），默认关闭
    #[serde(default)]
    pub local_api: LocalApiConfig,
}

fn default_active_tool() -> String {
    "trae".to_string()
}

// ─── Local API Config (Phase 9.1 本地 HTTP 网关) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiConfig {
    /// 是否启用本地 HTTP 网关（默认关闭，仅显式开启时启动）
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_local_api_port")]
    pub port: u16,
    /// Bearer token，首次启用时自动生成并持久化
    #[serde(default)]
    pub token: String,
}

fn default_local_api_port() -> u16 {
    18765
}

impl Default for LocalApiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: default_local_api_port(),
            token: String::new(),
        }
    }
}

// ─── Skill Diagnosis (Phase 7.1 健康度诊断) ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisTokenCost {
    pub total_tokens: u64,
    pub skill_count: u32,
    pub file_count: u32,
    pub avg_tokens_per_skill: u64,
    pub top_skills: Vec<DiagnosisTopSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisTopSkill {
    pub name: String,
    pub tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisConflict {
    pub name: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisZombie {
    pub path: String,
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisQualityIssue {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisQuality {
    pub name: String,
    pub path: String,
    pub score: u32,
    pub issues: Vec<DiagnosisQualityIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisSummary {
    pub total: u32,
    pub healthy: u32,
    pub warnings: u32,
    pub errors: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDiagnosisResult {
    pub token_cost: DiagnosisTokenCost,
    pub conflicts: Vec<DiagnosisConflict>,
    pub zombies: Vec<DiagnosisZombie>,
    pub quality: Vec<DiagnosisQuality>,
    pub summary: DiagnosisSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryConfig {
    pub enabled: bool,
}

// ─── Skill Preset (Phase 7.3 技能栈配方) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetSkillRef {
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub skills: Vec<PresetSkillRef>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: Option<i64>,
    /// 内置官方配方为 true，用户自建为 false
    #[serde(default)]
    pub built_in: bool,
}

// ─── App Update (Phase 8.1 自动更新) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub available: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub current_version: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub pub_date: Option<String>,
    #[serde(default)]
    pub download_url: Option<String>,
}

// ─── Tool Status (from Tool Adapter registry) ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: String,
    pub display_name: String,
    pub icon: String,
    pub installed: bool,
    pub running: bool,
    pub global_dir: Option<String>,
    pub project_dir: String,
}

// ─── Running Tool (Phase 4 进程检测) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningTool {
    pub tool_id: String,
    pub pid: u32,
    pub exe_path: Option<String>,
    pub cwd: Option<String>,
    pub workspace_hint: Option<String>,
}

// ─── Cross-Tool Sync (Phase 5.2) ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSkillEntry {
    pub tool_id: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossToolSkill {
    pub name: String,
    pub entries: Vec<ToolSkillEntry>,
}

// ─── Batch / Single operation results ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub results: Vec<SingleResult>,
    pub total: u32,
    pub succeeded: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleResult {
    pub skill_name: String,
    pub success: bool,
    pub message: String,
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
