use crate::models::{ApiResponse, Pagination, RemoteSkill, RepoInfo, RepoSkillInfo, SkillDetail, SkillFile};
use serde::Deserialize;
use tokio::process::Command;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;
use urlencoding;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Strip ANSI escape sequences (e.g. `\x1b[38;5;145m`) from CLI output.
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

const GITHUB_API_BASE: &str = "https://api.github.com/repos";
const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com";
const USER_AGENT: &str = "TRAE-Skill-Manager/1.0.0";

const KNOWN_REPOS: &[&str] = &[
    // ── 官方 Skill 仓库 ──────────────────────────────────────────────
    "anthropics/skills",           // Anthropic 官方：PDF/DOCX/XLSX/PPTX 等
    "vercel-labs/agent-skills",    // Vercel 官方：React/Next.js 最佳实践
    "google/skills",               // Google 官方：BigQuery/GKE/Firebase 等
    "supabase/agent-skills",        // Supabase 官方：Postgres 最佳实践
    "microsoft/skills",            // Microsoft 官方：Foundry/Azure 技能
    "aws/agent-toolkit-for-aws",   // AWS 官方：Agent Toolkit 技能
    // ── 社区 Skill 仓库 ────────────────────────────────────────────
    "obra/superpowers",             // 结构化 debug/TDD/项目规划 meta-skill
    "ComposioHQ/awesome-claude-skills", // 30+ 实用 skill（changelog/mcp-builder 等）
    "czlonkowski/n8n-skills",       // n8n 工作流构建 skill
    "K-Dense-AI/scientific-agent-skills", // 135 个科研领域 skill
    "mattpocock/skills",            // 工程技能包（AI coding agents）
    "addyosmani/agent-skills",      // 生产级工程技能包
    "smyrick/skills",               // AI agent 工作流技能库
    "emilkowalski/skills",          // UI 动效/设计工程技能包
];

// 6 hours: skills/repo metadata changes slowly, and each cache miss fires up to
// 8 unauthenticated GitHub API calls (60/hr limit), so a short TTL burns the
// quota in a few homepage loads.
const CACHE_DURATION_SECS: u64 = 6 * 60 * 60;

fn build_client(token: Option<&str>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(10));

    if let Some(tok) = token {
        if !tok.is_empty() {
            let mut headers = reqwest::header::HeaderMap::new();
            let mut auth_value = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", tok))
                .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static(""));
            auth_value.set_sensitive(true);
            headers.insert(reqwest::header::AUTHORIZATION, auth_value);
            // Also accept the GitHub v3 API
            headers.insert(
                reqwest::header::HeaderName::from_static("x-github-api-version"),
                reqwest::header::HeaderValue::from_static("2022-11-28"),
            );
            builder = builder.default_headers(headers);
        }
    }

    builder
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Reuse one reqwest::Client per token so DNS/TCP/TLS handshakes and HTTP/2
/// connections are pooled across every fetch instead of re-established on each
/// call. A separate client is kept for each distinct token (empty = anonymous).
fn global_client(token: Option<&str>) -> reqwest::Client {
    use std::sync::{OnceLock, RwLock};
    static POOL: OnceLock<RwLock<Vec<(String, reqwest::Client)>>> = OnceLock::new();
    let key = token.unwrap_or("").to_string();
    let pool = POOL.get_or_init(|| RwLock::new(Vec::new()));
    {
        let guard = pool.read().unwrap_or_else(|e| e.into_inner());
        if let Some((_, c)) = guard.iter().find(|(k, _)| *k == key) {
            return c.clone();
        }
    }
    let client = build_client(token);
    let mut guard = pool.write().unwrap_or_else(|e| e.into_inner());
    if let Some((_, c)) = guard.iter().find(|(k, _)| *k == key) {
        return c.clone();
    }
    guard.push((key, client.clone()));
    client
}

/// Check if a response indicates rate limiting and return a friendly error.
fn check_rate_limit(resp: &reqwest::Response, token: Option<&str>) -> Option<String> {
    if resp.status() == 403 {
        let remaining = resp.headers().get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok());
        if remaining == Some("0") {
            let limit = resp.headers().get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("60");
            let reset = resp.headers().get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i64>().ok());
            let reset_msg = match reset {
                Some(ts) => {
                    let now = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    let diff = ts - now;
                    if diff > 0 {
                        let minutes = (diff + 59) / 60;
                        format!("，约 {} 分钟后重置", minutes)
                    } else {
                        String::new()
                    }
                }
                None => String::new(),
            };
            let token_info = if token.is_some_and(|t| !t.is_empty()) {
                format!("已认证（{} 次/小时）", limit)
            } else {
                "未认证（60 次/小时）".to_string()
            };
            return Some(format!("GitHub API 速率限制已用完（{}{}），请稍后再试或配置 Token", token_info, reset_msg));
        }
    }
    None
}

#[derive(Debug, Deserialize)]
struct GitHubContentItem {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    path: String,
    #[serde(rename = "download_url")]
    download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubFile {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    content: Option<String>,
    encoding: Option<String>,
}

// ─── Git Trees API ────────────────────────────────────────────────────────
// GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 returns the whole
// file tree in one request, letting us discover nested skill layouts
// (skills/category/foo/SKILL.md, single-file skills/foo.md, non-skills/ dirs)
// that the Contents API + HEAD probing misses.

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    truncated: bool,
    tree: Vec<GitTreeItem>,
}

#[derive(Debug, Deserialize)]
struct GitTreeItem {
    path: String,
    #[serde(rename = "type")]
    item_type: String,
}

// ─── Cache ────────────────────────────────────────────────────────────────

// Bump when the fetch/merge logic changes so stale caches from older builds
// are ignored instead of masking the new behavior (e.g. the case-insensitive
// source match and skills.sh page scraping).
const CACHE_VERSION: u32 = 4;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CachedSkills {
    skills: Vec<RemoteSkill>,
    timestamp: i64, // unix timestamp seconds
    #[serde(default)]
    version: u32,
}

fn cache_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("skills_cache.json")
}

fn read_cache() -> Option<Vec<RemoteSkill>> {
    let path = cache_path();
    if !path.exists() { return None; }
    let content = fs::read_to_string(&path).ok()?;
    let cached: CachedSkills = serde_json::from_str(&content).ok()?;
    if cached.version != CACHE_VERSION { return None; }
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs() as i64;
    if now - cached.timestamp > CACHE_DURATION_SECS as i64 { return None; }
    Some(cached.skills)
}

/// Whether a valid cache exists and is still fresh (used by the stale-while-
/// revalidate path in main.rs to decide whether a background refresh is due).
pub fn cache_is_fresh() -> bool {
    let path = cache_path();
    if !path.exists() { return false; }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let cached: CachedSkills = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return false,
    };
    if cached.version != CACHE_VERSION { return false; }
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).ok().map(|d| d.as_secs() as i64).unwrap_or(0);
    now - cached.timestamp <= CACHE_DURATION_SECS as i64
}

/// Read the cache regardless of freshness. Used as a fallback when a fresh
/// fetch comes up short (e.g. GitHub API rate limit) so the list never blanks.
pub fn read_cache_allow_stale() -> Option<Vec<RemoteSkill>> {
    let path = cache_path();
    if !path.exists() { return None; }
    let content = fs::read_to_string(&path).ok()?;
    let cached: CachedSkills = serde_json::from_str(&content).ok()?;
    if cached.version != CACHE_VERSION { return None; }
    Some(cached.skills)
}

pub(crate) fn write_cache(skills: &[RemoteSkill]) -> Result<(), String> {
    let path = cache_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    let cached = CachedSkills {
        skills: skills.to_vec(),
        timestamp: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs() as i64,
        version: CACHE_VERSION,
    };
    let json = serde_json::to_string_pretty(&cached).map_err(|e| format!("Failed to serialize cache: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write cache: {}", e))
}

// ─── Trending snapshot ────────────────────────────────────────────────────
// Tracks install counts and first-seen time per skill so the "trending" view
// ranks by real growth (installs delta / elapsed time) plus recency instead of
// reshuffling the whole list on every refresh.

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SkillSnapshot {
    installs: u64,
    first_seen_at: i64, // unix seconds
    last_seen_at: i64,
}

fn snapshot_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("skills_snapshot.json")
}

fn read_snapshot() -> std::collections::HashMap<String, SkillSnapshot> {
    let path = snapshot_path();
    if !path.exists() { return std::collections::HashMap::new(); }
    fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

fn write_snapshot(snapshot: &std::collections::HashMap<String, SkillSnapshot>) {
    let path = snapshot_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(snapshot) {
        let _ = fs::write(&path, json);
    }
}

/// Rank skills for the trending view using the previous snapshot: new skills
/// get a boost, install deltas are converted to a daily growth rate, and
/// recently-pushed repos rank higher. Falls back to installs when no snapshot
/// exists yet (first run).
fn sort_trending(skills: &mut Vec<RemoteSkill>) {
    use std::cmp::Ordering;
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let prev = read_snapshot();

    let mut scored: Vec<(f64, RemoteSkill)> = Vec::with_capacity(skills.len());
    for skill in skills.drain(..) {
        let mut score = 0.0f64;
        match prev.get(&skill.id) {
            Some(p) => {
                let delta = skill.installs.saturating_sub(p.installs) as f64;
                let elapsed_h = ((now - p.last_seen_at).max(3600)) as f64 / 3600.0;
                let growth = delta / elapsed_h;
                score += growth * 10.0;
            }
            None => {
                // Newly seen skill: strong boost so fresh additions surface.
                score += 100.0;
            }
        }
        // Recency: recently-pushed repos rank higher (updated_at is unix ms).
        if let Some(updated_ms) = skill.updated_at {
            let age_days = ((now - updated_ms / 1000).max(0)) as f64 / 86400.0;
            score += (1.0 / (1.0 + age_days)) * 50.0;
        }
        // Baseline installs (log-scaled so big numbers don't dominate).
        score += (skill.installs as f64).ln_1p() * 5.0;
        scored.push((score, skill));
    }
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
    skills.extend(scored.into_iter().map(|(_, s)| s));

    // Persist the new snapshot for the next ranking pass.
    let mut next: std::collections::HashMap<String, SkillSnapshot> = std::collections::HashMap::new();
    for s in skills.iter() {
        let entry = next.entry(s.id.clone()).or_insert(SkillSnapshot {
            installs: 0,
            first_seen_at: now,
            last_seen_at: now,
        });
        entry.installs = s.installs;
        entry.last_seen_at = now;
    }
    write_snapshot(&next);
}

// ─── Built-in fallback skills ─────────────────────────────────────────────

fn get_built_in_skills() -> Vec<RemoteSkill> {
    vec![
        RemoteSkill {
            id: "vercel-labs/skills/web-search".to_string(),
            slug: "web-search".to_string(),
            name: "web-search".to_string(),
            source: "vercel-labs/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/vercel-labs/skills".to_string(),
            url: "https://github.com/vercel-labs/skills/tree/main/skills/web-search".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "vercel-labs/skills/github".to_string(),
            slug: "github".to_string(),
            name: "github".to_string(),
            source: "vercel-labs/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/vercel-labs/skills".to_string(),
            url: "https://github.com/vercel-labs/skills/tree/main/skills/github".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "vercel-labs/skills/linear".to_string(),
            slug: "linear".to_string(),
            name: "linear".to_string(),
            source: "vercel-labs/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/vercel-labs/skills".to_string(),
            url: "https://github.com/vercel-labs/skills/tree/main/skills/linear".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/web-search".to_string(),
            slug: "web-search".to_string(),
            name: "web-search".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/web-search".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/github".to_string(),
            slug: "github".to_string(),
            name: "github".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/github".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/linear".to_string(),
            slug: "linear".to_string(),
            name: "linear".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/linear".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/notion".to_string(),
            slug: "notion".to_string(),
            name: "notion".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/notion".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/slack".to_string(),
            slug: "slack".to_string(),
            name: "slack".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/slack".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/jira".to_string(),
            slug: "jira".to_string(),
            name: "jira".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/jira".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/stripe".to_string(),
            slug: "stripe".to_string(),
            name: "stripe".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/stripe".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/aws".to_string(),
            slug: "aws".to_string(),
            name: "aws".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/aws".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/postgres".to_string(),
            slug: "postgres".to_string(),
            name: "postgres".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/postgres".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/redis".to_string(),
            slug: "redis".to_string(),
            name: "redis".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/redis".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/docker".to_string(),
            slug: "docker".to_string(),
            name: "docker".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/docker".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/kubernetes".to_string(),
            slug: "kubernetes".to_string(),
            name: "kubernetes".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/kubernetes".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/terraform".to_string(),
            slug: "terraform".to_string(),
            name: "terraform".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/terraform".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "anthropics/skills/cloudflare".to_string(),
            slug: "cloudflare".to_string(),
            name: "cloudflare".to_string(),
            source: "anthropics/skills".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/anthropics/skills".to_string(),
            url: "https://github.com/anthropics/skills/tree/main/cloudflare".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/filesystem".to_string(),
            slug: "filesystem".to_string(),
            name: "filesystem".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/github".to_string(),
            slug: "github".to_string(),
            name: "github".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/github".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/postgres".to_string(),
            slug: "postgres".to_string(),
            name: "postgres".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/slack".to_string(),
            slug: "slack".to_string(),
            name: "slack".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/google-drive".to_string(),
            slug: "google-drive".to_string(),
            name: "google-drive".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/google-drive".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/puppeteer".to_string(),
            slug: "puppeteer".to_string(),
            name: "puppeteer".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "modelcontextprotocol/servers/sentry".to_string(),
            slug: "sentry".to_string(),
            name: "sentry".to_string(),
            source: "modelcontextprotocol/servers".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/modelcontextprotocol/servers".to_string(),
            url: "https://github.com/modelcontextprotocol/servers/tree/main/src/sentry".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
        RemoteSkill {
            id: "microsoft/playwright-mcp".to_string(),
            slug: "playwright-mcp".to_string(),
            name: "playwright-mcp".to_string(),
            source: "microsoft/playwright-mcp".to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: "https://github.com/microsoft/playwright-mcp".to_string(),
            url: "https://github.com/microsoft/playwright-mcp".to_string(),
            is_duplicate: false,
            data_source: "fallback".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        },
    ]
}

// ─── Main fetch: combine GitHub Raw + GitHub API + skills.sh API + built-in ─

/// Fetch every known source (GitHub repos + skills.sh) and merge the results
/// into a single deduplicated list. Exposed so main.rs can run this in the
/// background for stale-while-revalidate without blocking the first paint.
pub async fn fetch_all_sources(token: Option<&str>) -> Vec<RemoteSkill> {
    // Query the current quota once (free endpoint) and only fetch as many
    // sources as the budget can cover; the rest fall back to cache. Each
    // source costs up to 2 calls (main tree + master fallback), usually 1.
    let mut budget = fetch_quota_budget(token).await;
    let mut repos_to_fetch: Vec<&str> = Vec::new();
    for repo in KNOWN_REPOS {
        if budget.reserve(2) {
            repos_to_fetch.push(repo);
        } else {
            eprintln!(
                "Warning: GitHub quota low ({} calls left), using cache for {}",
                budget.available(),
                repo
            );
        }
    }
    if repos_to_fetch.is_empty() {
        eprintln!("Warning: GitHub quota exhausted, using cache only");
    }

    // Fetch the GitHub repos and the skills.sh leaderboard concurrently — they
    // hit different services with independent rate limits, so running them in
    // parallel roughly halves cold-start latency.
    let token_for_api = token.map(|s| s.to_string());
    let github_handle = tokio::spawn(async move {
        // Cap 8 in flight so a slow/rate-limited repo doesn't stall the rest
        // or hammer the API.
        let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
        let mut set = tokio::task::JoinSet::new();
        for repo in repos_to_fetch {
            let sem = sem.clone();
            let repo = repo.to_string();
            let token = token_for_api.clone();
            set.spawn(async move {
                let _permit = sem.acquire_owned().await.ok();
                fetch_repo_skills_api(&repo, token.as_deref()).await
            });
        }
        let mut out = Vec::new();
        while let Some(res) = set.join_next().await {
            match res {
                Ok(Ok(s)) => out.extend(s),
                Ok(Err(e)) => eprintln!("Warning: API fetch failed: {}", e),
                Err(e) => eprintln!("Warning: API fetch task failed: {}", e),
            }
        }
        out
    });
    let skills_sh_handle = tokio::spawn(fetch_skills_via_skills_sh());

    let mut merged = github_handle.await.unwrap_or_default();
    let npx_results = match skills_sh_handle.await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            eprintln!("Warning: skills.sh fetch failed: {}", e);
            Vec::new()
        }
        Err(e) => {
            eprintln!("Warning: skills.sh task failed: {}", e);
            Vec::new()
        }
    };

    // Merge with deduplication by id. skills.sh results first so real install
    // counts win over the GitHub API's installs: 0.
    let mut seen = std::collections::HashSet::new();
    let mut merged_all = Vec::with_capacity(npx_results.len() + merged.len());
    for skill in npx_results {
        if seen.insert(skill.id.clone()) {
            merged_all.push(skill);
        }
    }
    for skill in merged {
        if seen.insert(skill.id.clone()) {
            merged_all.push(skill);
        }
    }
    merged = merged_all;

    // If the fresh fetch came up short (e.g. GitHub API rate limit), merge the
    // stale cache so previously-seen skills don't vanish.
    if let Some(stale) = read_cache_allow_stale() {
        for skill in stale {
            if seen.insert(skill.id.clone()) {
                merged.push(skill);
            }
        }
    }

    // Final fallback: built-in skills list if nothing found.
    if merged.is_empty() {
        merged = get_built_in_skills();
    }

    let _ = write_cache(&merged);
    merged
}

/// Sort a skill list according to the requested view. Shared by the blocking
/// fetch path and the stale-while-revalidate path in main.rs.
pub fn sort_skills(mut skills: Vec<RemoteSkill>, view: Option<&str>) -> Vec<RemoteSkill> {
    match view {
        Some("trending") => sort_trending(&mut skills),
        Some("browse") => {
            skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        }
        _ => {
            skills.sort_by(|a, b| b.installs.cmp(&a.installs).then_with(|| a.name.cmp(&b.name)));
        }
    }
    skills
}

pub async fn fetch_skills(
    view: Option<String>,
    _page: Option<u32>,
    _per_page: Option<u32>,
    token: Option<&str>,
) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    // Try cache first: cache stores the merged raw data, then we sort by view on read.
    let token_owned = token.map(|s| s.to_string());
    let all_skills = if let Some(cached) = read_cache() {
        cached
    } else {
        fetch_all_sources(token_owned.as_deref()).await
    };

    // No blocking enrich here: repo descriptions are filled in by the delayed
    // background pass (see main.rs spawn_delayed_enrich) so first paint stays fast.
    let all_skills = sort_skills(all_skills, view.as_deref());

    let total = all_skills.len() as u32;
    Ok(ApiResponse {
        data: all_skills,
        pagination: Some(Pagination {
            page: 0,
            per_page: total,
            total,
            has_more: false,
        }),
    })
}

/// Attach each skill's GitHub repository description (if known) so the card
/// can show a short one-line intro. Uses the cached repo-info store and only
/// fetches the most popular repos to respect API rate limits.
pub async fn enrich_repo_descriptions(skills: &mut Vec<RemoteSkill>, token: Option<&str>) {
    let mut source_installs: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for s in skills.iter() {
        if is_github_source(&s.source) {
            *source_installs.entry(s.source.clone()).or_insert(0) += s.installs;
        }
    }
    let mut sources: Vec<String> = source_installs.keys().cloned().collect();
    sources.sort_by(|a, b| source_installs[b].cmp(&source_installs[a]));
    sources.truncate(20);

    let infos = fetch_github_repos_info_batch(&sources, token).await;
    for s in skills.iter_mut() {
        if let Some(info) = infos.get(&normalize_github_source(&s.source)) {
            if let Some(desc) = &info.description {
                if !desc.trim().is_empty() {
                    s.repo_description = Some(desc.clone());
                }
            }
            if let Some(lic) = &info.license {
                if let Some(spdx) = &lic.spdx_id {
                    if !spdx.trim().is_empty() {
                        s.license = Some(spdx.clone());
                    }
                }
            }
            if s.updated_at.is_none() {
                s.updated_at = iso_to_unix_ms(&info.updated_at);
            }
        }
    }
}

/// Parse a GitHub ISO-8601 timestamp (e.g. `2026-08-31T08:29:03Z`) to unix ms.
/// Uses fixed byte positions (`YYYY-MM-DDTHH:MM:SS`) so it never panics on
/// malformed or shorter strings.
fn iso_to_unix_ms(iso: &str) -> Option<i64> {
    let t = iso.trim().as_bytes();
    if t.len() < 19 {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        std::str::from_utf8(&t[r]).ok()?.trim().parse::<i64>().ok()
    };
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, m, s) = (num(11..13)?, num(14..16)?, num(17..19)?);
    // Days from civil (days since 1970-01-01), Howard Hinnant's algorithm.
    let y = if mo <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some((days * 86400 + h * 3600 + m * 60 + s) * 1000)
}

// ─── GitHub README / SKILL.md content ─────────────────────────────────────

/// Fetch a GitHub repo's README or SKILL.md content for community skill preview.
pub async fn fetch_github_repo_readme(repo_full_name: &str, token: Option<&str>) -> Result<String, String> {
    let client = global_client(token);

    // Try SKILL.md first (most relevant for skills)
    for branch in &["main", "master"] {
        let skill_md_url = format!("{}/{}/{}/SKILL.md", GITHUB_RAW_BASE, repo_full_name, branch);
        if let Ok(resp) = client.get(&skill_md_url).send().await {
            if resp.status().is_success() {
                if let Ok(content) = resp.text().await {
                    if !content.trim().is_empty() {
                        return Ok(content);
                    }
                }
            }
        }
    }

    // Fallback to README.md
    for branch in &["main", "master"] {
        for readme_name in &["README.md", "readme.md", "Readme.md"] {
            let readme_url = format!("{}/{}/{}/{}", GITHUB_RAW_BASE, repo_full_name, branch, readme_name);
            if let Ok(resp) = client.get(&readme_url).send().await {
                if resp.status().is_success() {
                    if let Ok(content) = resp.text().await {
                        if !content.trim().is_empty() {
                            return Ok(content);
                        }
                    }
                }
            }
        }
    }

    Err(format!("无法获取 {} 的 README 或 SKILL.md", repo_full_name))
}

/// Fetch only README.md from a GitHub repo root (for docs tab toggle).
pub async fn fetch_github_readme_only(repo_full_name: &str, token: Option<&str>) -> Result<String, String> {
    let client = global_client(token);

    for branch in &["main", "master"] {
        for readme_name in &["README.md", "readme.md", "Readme.md"] {
            let readme_url = format!("{}/{}/{}/{}", GITHUB_RAW_BASE, repo_full_name, branch, readme_name);
            if let Ok(resp) = client.get(&readme_url).send().await {
                if resp.status().is_success() {
                    if let Ok(content) = resp.text().await {
                        if !content.trim().is_empty() {
                            return Ok(content);
                        }
                    }
                }
            }
        }
    }

    Err(format!("无法获取 {} 的 README.md", repo_full_name))
}

/// Fetch only SKILL.md from a GitHub repo root (for docs tab toggle).
pub async fn fetch_github_skill_md_root(repo_full_name: &str, token: Option<&str>) -> Result<String, String> {
    let client = global_client(token);

    for branch in &["main", "master"] {
        let skill_md_url = format!("{}/{}/{}/SKILL.md", GITHUB_RAW_BASE, repo_full_name, branch);
        if let Ok(resp) = client.get(&skill_md_url).send().await {
            if resp.status().is_success() {
                if let Ok(content) = resp.text().await {
                    if !content.trim().is_empty() {
                        return Ok(content);
                    }
                }
            }
        }
    }

    Err(format!("无法获取 {} 的 SKILL.md", repo_full_name))
}

/// Fetch a specific SKILL.md from a subdirectory of a GitHub repo.
pub async fn fetch_github_skill_md(repo_full_name: &str, skill_path: &str, token: Option<&str>) -> Result<String, String> {
    let client = global_client(token);

    // skill_path could be "skills/web-search" or just "web-search"
    let full_path = if skill_path.contains("SKILL.md") {
        skill_path.to_string()
    } else {
        format!("{}/SKILL.md", skill_path.trim_end_matches('/'))
    };

    for branch in &["main", "master"] {
        let url = format!("{}/{}/{}/{}", GITHUB_RAW_BASE, repo_full_name, branch, full_path);
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(content) = resp.text().await {
                    if !content.trim().is_empty() {
                        return Ok(content);
                    }
                }
            }
        }
    }

    Err(format!("无法获取 {} 的 SKILL.md", skill_path))
}

// ─── GitHub API fetch (with rate limit) ───────────────────────────────────

/// Check whether `<path>/SKILL.md` exists on `main` or `master` via
/// raw.githubusercontent.com (no API rate limit) and return the branch that
/// has it. Some repos (e.g. ComposioHQ/awesome-claude-skills) use `master`.
async fn skill_md_branch(client: &reqwest::Client, repo: &str, path: &str) -> Option<&'static str> {
    for branch in &["main", "master"] {
        let url = format!("{}/{}/{}/{}", GITHUB_RAW_BASE, repo, branch, path);
        if let Ok(resp) = client.head(&url).send().await {
            if resp.status().is_success() {
                return Some(branch);
            }
        }
    }
    None
}

/// Directories that are never skills regardless of layout. Shared by the tree
/// and Contents-API paths so both filters stay in sync.
const SKIP_DIRS: &[&str] = &[
    ".github", ".gitignore", ".claude", ".vscode", ".cursor", "node_modules",
    "tests", "docs", "examples", "scripts", "bin", "src", "template", "spec",
    "references", "resources", "assets", "images",
];

/// Discover a repo's skills from its full git tree (one request). Handles
/// nested layouts (`skills/category/foo/SKILL.md`), single-file skills
/// (`skills/foo.md`) and non-`skills/` roots that the Contents API misses.
async fn fetch_repo_skills_via_tree(
    repo: &str,
    token: Option<&str>,
    default_branch: &str,
) -> Result<Vec<RemoteSkill>, String> {
    let url = format!("{}/{}/git/trees/{}?recursive=1", GITHUB_API_BASE, repo, default_branch);
    let client = global_client(token);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if let Some(rate_msg) = check_rate_limit(&resp, token) {
        return Err(rate_msg);
    }
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        // Wrong branch: the caller advances to the next candidate (main→master).
        return Err("branch not found (404)".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status: {}", resp.status()));
    }

    let tree: GitTreeResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse git tree response: {}", e))?;

    // Very large repos truncate the recursive tree; the caller falls back to
    // the Contents API in that case.
    if tree.truncated {
        return Err("git tree truncated".to_string());
    }

    let lower = repo.to_lowercase();
    let mut skills = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for item in &tree.tree {
        if item.item_type != "blob" {
            continue;
        }
        let p = &item.path;
        let (name, url_path) = if p.ends_with("/SKILL.md") || p == "SKILL.md" {
            let dir = p.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
            let name = dir.rsplit('/').next().unwrap_or(dir).to_string();
            (name, dir.to_string())
        } else if p.starts_with("skills/") && p.ends_with(".md") && !p["skills/".len()..].contains('/') {
            // Single-file skill: skills/foo.md (top level only). Nested .md
            // files (e.g. skills/<name>/references/foo.md) are skill docs, not
            // skills themselves.
            let stem = p.trim_end_matches(".md").to_string();
            let name = stem.rsplit('/').next().unwrap_or(&stem).to_string();
            (name, stem)
        } else {
            continue;
        };
        if name.is_empty() || name == "skills" {
            continue;
        }
        // Filter out obvious non-skill paths (config folders, tooling, docs).
        if SKIP_DIRS.iter().any(|s| p.split('/').any(|seg| seg == *s)) {
            continue;
        }
        if !seen.insert(name.clone()) {
            continue;
        }
        skills.push(RemoteSkill {
            id: format!("{}/{}", lower, name),
            slug: name.clone(),
            name: name.clone(),
            source: lower.clone(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo),
            url: format!("https://github.com/{}/tree/{}/{}", repo, default_branch, url_path),
            is_duplicate: false,
            data_source: "github-tree".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        });
    }

    Ok(skills)
}

async fn fetch_repo_skills_api(repo: &str, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    // Prefer the Git Trees API: one request discovers nested layouts. Try the
    // most common branches directly (main, then master) instead of fetching
    // repo metadata first — that saves one API call per repo on cold start
    // (13/14 known repos are on main, the rest on master). Only a 404 (wrong
    // branch) advances to the next candidate; rate limits and network errors
    // abort immediately. Fall back to the Contents API if the tree is
    // truncated or the default branch is neither main nor master.
    for branch in ["main", "master"] {
        match fetch_repo_skills_via_tree(repo, token, branch).await {
            Ok(skills) if !skills.is_empty() => return Ok(skills),
            Ok(_) => {}
            Err(e) => {
                if !e.contains("branch not found (404)") {
                    eprintln!("Warning: tree fetch failed for {}: {}", repo, e);
                    break;
                }
            }
        }
    }

    let url = format!("{}/{}/contents/skills", GITHUB_API_BASE, repo);
    let client = global_client(token);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    // Check rate limit
    if let Some(rate_msg) = check_rate_limit(&resp, token) {
        return Err(rate_msg);
    }

    if resp.status() == 404 {
        return fetch_repo_skills_from_root_api(repo, token).await;
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status: {}", resp.status()));
    }

    let items: Vec<GitHubContentItem> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    // Use the actual default branch for the tree URL (raw check, no rate limit).
    let branch = match items.first() {
        Some(first) => {
            let path = format!("skills/{}/SKILL.md", first.name);
            skill_md_branch(&client, repo, &path).await.unwrap_or("main")
        }
        None => "main",
    };

    let mut skills = Vec::new();
    let lower = repo.to_lowercase();
    for item in items {
        if item.item_type != "dir" {
            continue;
        }
        skills.push(RemoteSkill {
            id: format!("{}/{}", lower, item.name),
            slug: item.name.clone(),
            name: item.name.clone(),
            source: lower.clone(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo),
            url: format!("https://github.com/{}/tree/{}/skills/{}", repo, branch, item.name),
            is_duplicate: false,
            data_source: "github-api".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        });
    }

    Ok(skills)
}

async fn fetch_repo_skills_from_root_api(repo: &str, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    let url = format!("{}/{}/contents/", GITHUB_API_BASE, repo);
    let client = global_client(token);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if let Some(rate_msg) = check_rate_limit(&resp, token) {
        return Err(rate_msg);
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status: {}", resp.status()));
    }

    let items: Vec<GitHubContentItem> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let skip = SKIP_DIRS;

    // Verify each dir actually ships a SKILL.md (concurrently via raw HEAD
    // checks, no API rate limit); this filters out config folders (.claude/
    // .vscode) and sub-collections, and detects the real default branch.
    let mut set = tokio::task::JoinSet::new();
    for item in &items {
        if item.item_type != "dir" || skip.contains(&item.name.as_str()) {
            continue;
        }
        let client = client.clone();
        let repo = repo.to_string();
        let name = item.name.clone();
        set.spawn(async move {
            let branch = skill_md_branch(&client, &repo, &format!("{}/SKILL.md", name)).await;
            (name, branch)
        });
    }

    let mut skills = Vec::new();
    let lower = repo.to_lowercase();
    while let Some(res) = set.join_next().await {
        let Ok((name, Some(branch))) = res else {
            continue;
        };
        skills.push(RemoteSkill {
            id: format!("{}/{}", lower, name),
            slug: name.clone(),
            name: name.clone(),
            source: lower.clone(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo),
            url: format!("https://github.com/{}/tree/{}/{}", repo, branch, name),
            is_duplicate: false,
            data_source: "github-api".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        });
    }

    Ok(skills)
}

// ─── skills.sh search API fallback ────────────────────────────────────────
// The skills CLI has no `search` subcommand (only `find`, which requires a
// query and caps results at 6). We call the same skills.sh search API the CLI
// wraps, using several broad queries for ecosystem coverage. This avoids
// spawning npx entirely and returns structured JSON.
//
// Note: the bare `skills.sh` host hangs on GET (returns 200 for HEAD but
// stalls on GET); the `www.` host responds normally, so we use it here.

const SKILLS_SH_API: &str = "https://www.skills.sh/api/search";

/// A GitHub source is `owner/repo` where the owner is not a domain (e.g.
/// `skills.volces.com/...` is not a GitHub repo and would produce a broken
/// install URL).
fn is_github_source(source: &str) -> bool {
    let parts: Vec<&str> = source.split('/').collect();
    parts.len() == 2
        && !parts[0].is_empty()
        && !parts[0].contains('.')
        && !parts[1].is_empty()
}

/// Query the skills.sh search API for a single keyword and map results to
/// RemoteSkill (github sources only).
pub(crate) async fn search_skills_via_skills_sh(client: &reqwest::Client, query: &str) -> Vec<RemoteSkill> {
    let url = format!("{}?q={}&limit=50", SKILLS_SH_API, urlencoding::encode(query));
    let resp = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Vec::new(),
    };
    let data: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let items = match data.get("skills").and_then(|s| s.as_array()) {
        Some(items) => items,
        None => return Vec::new(),
    };
    let mut skills = Vec::new();
    for item in items {
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let source = item.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let installs = item.get("installs").and_then(|v| v.as_u64()).unwrap_or(0);
        if id.is_empty() || !is_github_source(&source) {
            continue;
        }
        skills.push(RemoteSkill {
            id: id.clone(),
            slug: name.clone(),
            name: name.clone(),
            source: source.clone(),
            installs,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", source),
            url: format!("https://skills.sh/{}", id),
            is_duplicate: false,
            data_source: "skills-sh".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        });
    }
    skills
}

/// Parse skills.sh's abbreviated install counts ("9.1K", "1.2M", "3").
fn parse_abbreviated_installs(s: &str) -> u64 {
    let t = s.trim();
    if let Some(stripped) = t.strip_suffix('K') {
        return (stripped.trim().parse::<f64>().unwrap_or(0.0) * 1000.0) as u64;
    }
    if let Some(stripped) = t.strip_suffix('M') {
        return (stripped.trim().parse::<f64>().unwrap_or(0.0) * 1_000_000.0) as u64;
    }
    t.parse::<u64>().unwrap_or(0)
}

/// Extract the text of the first `<tag ...>` ... `</tag>` block after `from`.
fn extract_row_text(html: &str, from: usize, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let open_rel = html[from..].find(&open)?;
    let open_end = html[from + open_rel..].find('>')? + from + open_rel;
    let close = format!("</{}>", tag);
    let close_rel = html[open_end + 1..].find(&close)?;
    Some(html[open_end + 1..open_end + 1 + close_rel].trim().to_string())
}

/// Scrape a skills.sh source page for its complete skill list. The page
/// renders each skill as a row: `<a href="/{source}/{slug}">` with the name
/// in an `<h3>` and the install count in a trailing `<span class="font-mono">`.
/// The fuzzy search API only surfaces a fraction of a repo's skills (e.g.
/// google/skills, microsoft/skills), so this page is the reliable source.
async fn fetch_source_skills_via_page(client: &reqwest::Client, source: &str) -> Vec<RemoteSkill> {
    let lower = source.to_lowercase();
    let url = format!("https://skills.sh/{}", lower);
    let resp = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Vec::new(),
    };
    let html = match resp.text().await {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };

    let href_marker = format!("href=\"/{}/", lower);
    let mut skills = Vec::new();
    let mut search_from = 0;
    while let Some(rel) = html[search_from..].find(&href_marker) {
        let row_start = search_from + rel;
        let slug_start = row_start + href_marker.len();
        let slug_end = match html[slug_start..].find('"') {
            Some(e) => slug_start + e,
            None => break,
        };
        let slug = &html[slug_start..slug_end];
        search_from = slug_end + 1;
        if slug.is_empty() || slug.contains('/') {
            continue;
        }

        let name = extract_row_text(&html, row_start, "h3").unwrap_or_else(|| slug.to_string());
        let installs = extract_row_text(&html, row_start, "span")
            .map(|s| parse_abbreviated_installs(&s))
            .unwrap_or(0);

        let id = format!("{}/{}", lower, slug);
        skills.push(RemoteSkill {
            id: id.clone(),
            slug: slug.to_string(),
            name,
            source: lower.clone(),
            installs,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", source),
            url: format!("https://skills.sh/{}", id),
            is_duplicate: false,
            data_source: "skills-sh-page".to_string(),
            stars: None,
            repo_description: None,
            updated_at: None,
            license: None,
        });
    }
    skills
}

async fn fetch_skills_via_skills_sh() -> Result<Vec<RemoteSkill>, String> {
    // Reuse the anonymous global client so skills.sh requests share the same
    // connection pool instead of re-handshaking per request.
    let client = global_client(None);

    // Scrape each curated repo's skills.sh page for its complete skill list
    // (the fuzzy search API only surfaces a fraction of a repo's skills), plus
    // the search API as a supplement for any skills the page omits, plus a few
    // broad terms for general community coverage. Keeping the request count low
    // avoids skills.sh's 60 req/min rate limit.
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(12));
    let mut handles = Vec::new();

    for repo in KNOWN_REPOS {
        let client = client.clone();
        let sem = semaphore.clone();
        let repo = repo.to_string();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire_owned().await.ok();
            let mut result = fetch_source_skills_via_page(&client, &repo).await;
            let mut seen: std::collections::HashSet<String> =
                result.iter().map(|s| s.id.clone()).collect();
            for skill in search_skills_via_skills_sh(&client, &repo).await {
                if seen.insert(skill.id.clone()) {
                    result.push(skill);
                }
            }
            result
        }));
    }
    for query in ["ai", "web", "data", "code", "design", "productivity"] {
        let client = client.clone();
        let sem = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire_owned().await.ok();
            search_skills_via_skills_sh(&client, query).await
        }));
    }

    let mut seen = std::collections::HashSet::new();
    let mut skills = Vec::new();
    for handle in handles {
        if let Ok(result) = handle.await {
            for skill in result {
                if seen.insert(skill.id.clone()) {
                    skills.push(skill);
                }
            }
        }
    }

    if skills.is_empty() {
        return Err("No skills found via skills.sh API".to_string());
    }

    Ok(skills)
}

// ─── Search ───────────────────────────────────────────────────────────────

/// Expand a query into alias terms so related formats surface together
/// (e.g. searching "pdf" also matches docx/pptx/xlsx skills).
pub fn expand_query_aliases(query: &str) -> Vec<String> {
    let q = query.trim().to_lowercase();
    let mut terms = vec![q.clone()];
    let family: &[&str] = match q.as_str() {
        "pdf" | "doc" | "docx" | "word" | "document" => {
            &["pdf", "doc", "docx", "word", "document"]
        }
        "xlsx" | "excel" | "sheet" | "spreadsheet" | "csv" | "表格" => {
            &["xlsx", "excel", "sheet", "spreadsheet", "csv"]
        }
        "ppt" | "pptx" | "slide" | "slides" | "presentation" | "演示" => {
            &["ppt", "pptx", "slide", "slides", "presentation"]
        }
        "email" | "mail" | "gmail" | "outlook" | "邮件" => {
            &["email", "mail", "gmail", "outlook"]
        }
        "translate" | "translation" | "i18n" | "翻译" => {
            &["translate", "translation", "i18n", "language"]
        }
        "database" | "db" | "sql" | "postgres" | "mysql" | "数据库" => {
            &["database", "db", "sql", "postgres", "mysql", "query"]
        }
        "git" | "github" | "repo" | "repository" | "版本" => {
            &["git", "github", "repo", "repository"]
        }
        "terminal" | "shell" | "cli" | "command" | "bash" | "终端" => {
            &["terminal", "shell", "cli", "command", "bash", "zsh"]
        }
        "search" | "web-search" | "websearch" | "browser" | "搜索" => {
            &["search", "web-search", "websearch", "browser", "web"]
        }
        "video" | "audio" | "media" | "music" | "sound" => {
            &["video", "audio", "media", "music", "sound"]
        }
        "image" | "photo" | "picture" | "img" | "图片" => {
            &["image", "photo", "picture", "img", "canvas"]
        }
        "note" | "notes" | "notion" | "笔记" => {
            &["note", "notes", "notion", "writing"]
        }
        "calendar" | "meeting" | "schedule" | "日程" | "会议" => {
            &["calendar", "meeting", "schedule"]
        }
        "code" | "coding" | "programming" | "script" | "开发" => {
            &["code", "coding", "programming", "script"]
        }
        "test" | "testing" | "qa" | "测试" => {
            &["test", "testing", "qa", "debug"]
        }
        "deploy" | "deployment" | "devops" | "ci" | "cd" | "部署" => {
            &["deploy", "deployment", "devops", "ci", "cd"]
        }
        _ => &[],
    };
    for t in family {
        if !terms.contains(&t.to_string()) {
            terms.push(t.to_string());
        }
    }
    terms
}

/// Relevance score: name match dominates, then source, then repo description.
pub fn relevance_score(skill: &RemoteSkill, terms: &[String]) -> i64 {
    let name = skill.name.to_lowercase();
    let source = skill.source.to_lowercase();
    let desc = skill
        .repo_description
        .as_deref()
        .unwrap_or("")
        .to_lowercase();
    let mut score = 0i64;
    for term in terms {
        if name == *term {
            score += 100;
        } else if name.starts_with(term.as_str()) {
            score += 60;
        } else if name.contains(term.as_str()) {
            score += 40;
        }
        if source == *term {
            score += 30;
        } else if source.contains(term.as_str()) {
            score += 15;
        }
        if desc.contains(term.as_str()) {
            score += 8;
        }
    }
    score
}

/// Levenshtein distance for typo tolerance on short queries.
fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        curr[0] = i;
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

pub async fn search_skills(
    query: &str,
    _limit: Option<u32>,
    token: Option<&str>,
) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return fetch_skills(None, None, None, token).await;
    }

    let terms = expand_query_aliases(&q);

    // Primary: query skills.sh directly with the user's keyword. This surfaces
    // popular skills with real install counts that the pre-fetched list may
    // not contain (the root cause of "热门 skill 搜不出来").
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
    let mut results = search_skills_via_skills_sh(&client, &q).await;

    // Secondary: match against the pre-fetched merged list (KNOWN_REPOS +
    // generic skills.sh queries + built-in fallback) using alias-aware
    // relevance scoring instead of a plain substring check.
    let mut seen: std::collections::HashSet<String> =
        results.iter().map(|s| s.id.clone()).collect();
    if let Ok(all) = fetch_skills(None, None, None, token).await {
        for s in all.data {
            if relevance_score(&s, &terms) > 0 {
                if seen.insert(s.id.clone()) {
                    results.push(s);
                }
            }
        }
    }

    // Typo tolerance: for short queries (<= 4 chars), also include skills whose
    // name is within edit distance 1 of the query (e.g. "pfd" → "pdf").
    if q.chars().count() <= 4 {
        let mut fuzzy_added = 0usize;
        for s in results.clone() {
            if fuzzy_added >= 5 {
                break;
            }
            if seen.contains(&s.id) {
                continue;
            }
            let name = s.name.to_lowercase();
            if name.chars().count() <= 8 && levenshtein(&q, &name) <= 1 {
                seen.insert(s.id.clone());
                results.push(s);
                fuzzy_added += 1;
            }
        }
    }

    // Rank by relevance first, then by installs (popularity) as a tie-breaker.
    results.sort_by(|a, b| {
        let ra = relevance_score(a, &terms);
        let rb = relevance_score(b, &terms);
        rb.cmp(&ra).then_with(|| b.installs.cmp(&a.installs)).then_with(|| a.name.cmp(&b.name))
    });

    let total = results.len() as u32;
    Ok(ApiResponse {
        data: results,
        pagination: Some(Pagination {
            page: 0,
            per_page: total,
            total,
            has_more: false,
        }),
    })
}

// ─── Skill Detail ─────────────────────────────────────────────────────────

pub async fn fetch_skill_detail(
    source: &str,
    slug: &str,
    token: Option<&str>,
) -> Result<SkillDetail, String> {
    let mut files = Vec::new();
    let client = global_client(token);

    // Try skills/ subdirectory first
    let url = format!("{}/{}/contents/skills/{}", GITHUB_API_BASE, source, slug);
    let resp = client.get(&url).send().await;
    let items = match resp {
        Ok(r) if r.status().is_success() => {
            r.json::<Vec<GitHubContentItem>>().await.ok()
        }
        _ => None,
    };

    // Fallback: try root directory
    let items = match items {
        Some(i) => Some(i),
        None => {
            let url2 = format!("{}/{}/contents/{}", GITHUB_API_BASE, source, slug);
            let resp2 = client.get(&url2).send().await;
            match resp2 {
                Ok(r) if r.status().is_success() => {
                    r.json::<Vec<GitHubContentItem>>().await.ok()
                }
                _ => None,
            }
        }
    };

    if let Some(items) = items {
        for item in items {
            if item.item_type == "file" {
                if let Some(dl_url) = item.download_url {
                    let content = match client.get(&dl_url).send().await {
                        Ok(resp) => resp.text().await.unwrap_or_default(),
                        Err(_) => String::new(),
                    };

                    files.push(SkillFile {
                        path: item.path,
                        contents: content,
                    });
                }
            }
        }
    }

    Ok(SkillDetail {
        id: format!("{}/{}", source, slug),
        source: source.to_string(),
        slug: slug.to_string(),
        installs: 0,
        hash: None,
        files,
    })
}

// ─── List repo skills: npx --list first, GitHub API fallback ──────────────

pub async fn list_repo_skills(source: &str, token: Option<&str>) -> Result<Vec<RepoSkillInfo>, String> {
    let normalized = normalize_github_source(source);

    // Method 1: Use `npx skills add <source> --list` (most accurate, discovers real skills)
    match list_repo_skills_via_npx(&normalized).await {
        Ok(skills) if !skills.is_empty() => {
            eprintln!("[debug] npx --list OK for {}: {} skills", normalized, skills.len());
            return Ok(skills);
        }
        Ok(skills) => {
            eprintln!("[debug] npx --list EMPTY for {} ({} skills)", normalized, skills.len());
        }
        Err(e) => eprintln!("Warning: npx --list failed for {}: {}", normalized, e),
    }

    // Method 2: Fallback to GitHub API + Raw scanning
    let fallback = list_repo_skills_via_github(&normalized, token).await;
    eprintln!("[debug] github fallback for {}: {:?}", normalized, fallback.as_ref().map(|v| v.len()));
    fallback
}

/// Use `npx skills add <source> --list` to discover real skills in a repo.
async fn list_repo_skills_via_npx(source: &str) -> Result<Vec<RepoSkillInfo>, String> {
    let output = hidden_command(crate::utils::npx_program())
        .args(["-y", "skills", "add", source, "--list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute npx: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "npx skills add --list failed: {}",
            if stderr.is_empty() { stdout } else { stderr }
        ));
    }

    // Parse the output to extract skill names and descriptions
    // Format from npx:
    //   Available Skills
    //   Skill Group Name
    //       skill-name
    //         description text...
    let mut skills = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_desc_lines: Vec<String> = Vec::new();

    for line in stdout.lines() {
        let trimmed = strip_ansi(line).trim().to_string();

        // Skip headers and noise
        if trimmed.is_empty()
            || trimmed.starts_with("──")
            || trimmed.starts_with("---")
            || trimmed.starts_with("Available Skills")
            || trimmed.starts_with("Use --skill")
            || trimmed.starts_with("Tip:")
            || trimmed.starts_with("Source:")
            || trimmed.starts_with("Cloning")
            || trimmed.starts_with("Repository")
            || trimmed.starts_with("Discovering")
            || trimmed.starts_with("Found")
            || trimmed.contains("skills.sh")
            || trimmed.contains("████")
            || trimmed.contains("◇")
            || trimmed.contains("◒")
            || trimmed.contains("└")
            || trimmed.contains("├")
            || trimmed.contains("┌")
        {
            // If we were collecting a skill, save it before skipping
            if let Some(name) = current_name.take() {
                let desc = current_desc_lines.join(" ").trim().to_string();
                skills.push(RepoSkillInfo {
                    name,
                    description: if desc.is_empty() { None } else { Some(desc) },
                });
                current_desc_lines.clear();
            }
            continue;
        }

        // Lines starting with │ are part of the box drawing
        if trimmed.contains("│") {
            let content = trimmed.split("│").last().unwrap_or("").trim();
            if content.is_empty() {
                continue;
            }

            // Check if this is a skill name (indented with 4+ spaces, no description)
            // Skill names are typically short identifiers like "web-search", "github"
            let is_skill_name = content.len() < 60
                && !content.ends_with('.')
                && (content.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '/'));

            if is_skill_name && !content.starts_with("Skills") {
                // Save previous skill if exists
                if let Some(name) = current_name.take() {
                    let desc = current_desc_lines.join(" ").trim().to_string();
                    skills.push(RepoSkillInfo {
                        name,
                        description: if desc.is_empty() { None } else { Some(desc) },
                    });
                    current_desc_lines.clear();
                }
                current_name = Some(content.to_string());
            } else if current_name.is_some() {
                // This is a description line
                current_desc_lines.push(content.to_string());
            }
        }
    }

    // Don't forget the last skill
    if let Some(name) = current_name.take() {
        let desc = current_desc_lines.join(" ").trim().to_string();
        skills.push(RepoSkillInfo {
            name,
            description: if desc.is_empty() { None } else { Some(desc) },
        });
    }

    Ok(skills)
}

/// Fallback: scan repo via GitHub API + Raw
async fn list_repo_skills_via_github(source: &str, token: Option<&str>) -> Result<Vec<RepoSkillInfo>, String> {
    let client = global_client(token);

    // Check if SKILL.md exists at root (via Raw, no rate limit)
    let root_url = format!("{}/{}/main/SKILL.md", GITHUB_RAW_BASE, source);
    let root_resp = client.head(&root_url).send().await;
    if matches!(root_resp, Ok(ref r) if r.status().is_success()) {
        let repo_name = source.split('/').last().unwrap_or(source);
        return Ok(vec![RepoSkillInfo {
            name: repo_name.to_string(),
            description: Some("整个仓库是一个 Skill（根目录 SKILL.md）".to_string()),
        }]);
    }

    // Try master branch
    let master_url = format!("{}/{}/master/SKILL.md", GITHUB_RAW_BASE, source);
    let master_resp = client.head(&master_url).send().await;
    if matches!(master_resp, Ok(ref r) if r.status().is_success()) {
        let repo_name = source.split('/').last().unwrap_or(source);
        return Ok(vec![RepoSkillInfo {
            name: repo_name.to_string(),
            description: Some("整个仓库是一个 Skill（根目录 SKILL.md）".to_string()),
        }]);
    }

    // Scan subdirectories via GitHub API
    let url = format!("{}/{}/contents/", GITHUB_API_BASE, source);
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub API 请求失败: {}", e))?;

    if resp.status() == 404 {
        return Err(format!("仓库 {} 不存在或不是公开仓库", source));
    }

    if let Some(rate_msg) = check_rate_limit(&resp, token) {
        return Err(rate_msg);
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API 返回状态码: {}", resp.status()));
    }

    let items: Vec<GitHubContentItem> = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {}", e))?;

    let skip = [".github", ".gitignore", "bin", "src", "tests", "scripts", "spec", "template", "docs", "examples", ".vscode", ".devcontainer", "node_modules", "dist", "build"];
    let mut skills = Vec::new();

    for item in &items {
        if item.item_type != "dir" || skip.contains(&item.name.as_str()) {
            continue;
        }

        // Check via Raw if this dir has SKILL.md (try main and master branches)
        if skill_md_branch(&client, source, &format!("{}/SKILL.md", item.name))
            .await
            .is_some()
        {
            skills.push(RepoSkillInfo {
                name: item.name.clone(),
                description: Some("包含 SKILL.md".to_string()),
            });
        }
    }

    if skills.is_empty() {
        return Err(format!(
            "仓库 {} 中没有找到 Skill。\n\n请确认：\n1. 仓库是公开的\n2. 仓库包含 SKILL.md 文件\n3. 地址格式为 owner/repo",
            source
        ));
    }

    Ok(skills)
}

/// Normalize GitHub source: extract owner/repo from full URL or clean up.
/// Lowercased so cache keys and lookups match regardless of input case.
fn normalize_github_source(source: &str) -> String {
    let trimmed = source.trim();
    let cleaned = if trimmed.starts_with("https://github.com/") {
        trimmed
            .replace("https://github.com/", "")
            .trim_end_matches('/')
            .to_string()
    } else if trimmed.starts_with("http://github.com/") {
        trimmed
            .replace("http://github.com/", "")
            .trim_end_matches('/')
            .to_string()
    } else if trimmed.starts_with("github.com/") {
        trimmed
            .replace("github.com/", "")
            .trim_end_matches('/')
            .to_string()
    } else {
        trimmed.trim_end_matches('/').to_string()
    };
    cleaned.to_lowercase()
}

#[allow(dead_code)]
fn parse_repo_skills_output(output: &str) -> Result<Vec<RepoSkillInfo>, String> {
    let mut skills = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("Available skills")
            || trimmed.starts_with("──")
            || trimmed.starts_with("---")
            || trimmed.starts_with("No skills found")
            || trimmed.starts_with("Usage:")
        {
            continue;
        }

        let cleaned = trimmed
            .trim_start_matches("[x]")
            .trim_start_matches("[ ]")
            .trim();

        if cleaned.is_empty() {
            continue;
        }

        let parts: Vec<&str> = if cleaned.contains('\t') {
            cleaned.splitn(2, '\t').collect()
        } else {
            match cleaned.find("  ") {
                Some(pos) => {
                    let (a, b) = cleaned.split_at(pos);
                    vec![a.trim(), b.trim()]
                }
                None => vec![cleaned],
            }
        };

        let name = parts[0].trim().to_string();
        if !name.is_empty() && !name.starts_with('#') {
            skills.push(RepoSkillInfo {
                name,
                description: parts.get(1).map(|s| s.trim().to_string()),
            });
        }
    }

    Ok(skills)
}

// ─── GitHub Repo Info ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GitHubRepoResponse {
    full_name: String,
    description: Option<String>,
    html_url: String,
    stargazers_count: u64,
    forks_count: u64,
    open_issues_count: u64,
    language: Option<String>,
    license: Option<GitHubLicense>,
    created_at: String,
    updated_at: String,
    pushed_at: String,
    owner: GitHubOwner,
    default_branch: String,
}

#[derive(Debug, Deserialize)]
struct GitHubOwner {
    login: String,
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubLicense {
    spdx_id: Option<String>,
    name: Option<String>,
}

// ─── Repo Info Cache ──────────────────────────────────────────────────────

// Repo metadata (description/license/stars) changes very slowly; 7 days keeps
// the cache useful across many app launches without re-burning quota.
const REPO_INFO_TTL_SECS: i64 = 7 * 24 * 60 * 60;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CachedRepoInfo {
    info: RepoInfo,
    timestamp: i64,
}

fn repo_info_cache_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("repo_info_cache.json")
}

fn read_repo_info_cache() -> Option<std::collections::HashMap<String, CachedRepoInfo>> {
    let path = repo_info_cache_path();
    if !path.exists() { return None; }
    let content = fs::read_to_string(&path).ok()?;
    let cache: std::collections::HashMap<String, CachedRepoInfo> = serde_json::from_str(&content).ok()?;
    // Filter out expired entries
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs() as i64;
    let filtered: std::collections::HashMap<_, _> = cache
        .into_iter()
        .filter(|(_, v)| now - v.timestamp <= REPO_INFO_TTL_SECS)
        .collect();
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn write_repo_info_cache(cache: &std::collections::HashMap<String, CachedRepoInfo>) -> Result<(), String> {
    let path = repo_info_cache_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(cache).map_err(|e| format!("Failed to serialize cache: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write cache: {}", e))
}

/// Fetch detailed information about a GitHub repository.
pub async fn fetch_github_repo_info(
    repo_full_name: &str,
    token: Option<&str>,
) -> Result<RepoInfo, String> {
    let normalized = normalize_github_source(repo_full_name);

    // Check cache first
    if let Some(mut cache) = read_repo_info_cache() {
        if let Some(cached) = cache.remove(&normalized) {
            return Ok(cached.info);
        }
    }

    let client = global_client(token);
    let url = format!("{}/{}", GITHUB_API_BASE, &normalized);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub API 请求失败: {}", e))?;

    if let Some(rate_msg) = check_rate_limit(&resp, token) {
        return Err(rate_msg);
    }

    if resp.status() == 404 {
        return Err(format!("仓库 {} 不存在", normalized));
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API 返回状态码: {}", resp.status()));
    }

    let repo: GitHubRepoResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {}", e))?;

    let info = RepoInfo {
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        open_issues_count: repo.open_issues_count,
        language: repo.language,
        license: repo.license.map(|l| crate::models::LicenseInfo {
            spdx_id: l.spdx_id,
            name: l.name,
        }),
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        owner: crate::models::OwnerInfo {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
        },
        default_branch: repo.default_branch,
    };

    // Save to cache
    let mut cache = read_repo_info_cache().unwrap_or_default();
    cache.insert(
        normalized.clone(),
        CachedRepoInfo {
            info: info.clone(),
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
        },
    );
    let _ = write_repo_info_cache(&cache);

    Ok(info)
}

/// Test if a GitHub token is valid by making a simple API call.
pub async fn test_github_token(token: &str) -> Result<(), String> {
    let client = global_client(Some(token));
    let url = "https://api.github.com/user";

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else if resp.status() == 401 {
        Err("Token 无效或已过期".to_string())
    } else {
        Err(format!("验证失败 (状态码: {})", resp.status()))
    }
}

/// GitHub rate-limit status for the core API, used by the settings page to
/// show the user their remaining quota and reset time.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GithubRateLimit {
    pub limit: u64,
    pub remaining: u64,
    pub reset_unix: i64,
    pub authenticated: bool,
}

pub async fn get_github_rate_limit(token: Option<&str>) -> Result<GithubRateLimit, String> {
    let client = global_client(token);
    let url = "https://api.github.com/rate_limit";
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("查询失败 (状态码: {})", resp.status()));
    }
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析失败: {}", e))?;
    let core = &data["resources"]["core"];
    Ok(GithubRateLimit {
        limit: core["limit"].as_u64().unwrap_or(0),
        remaining: core["remaining"].as_u64().unwrap_or(0),
        reset_unix: core["reset"].as_i64().unwrap_or(0),
        authenticated: token.is_some_and(|t| !t.is_empty()),
    })
}

// ─── GitHub quota budget ──────────────────────────────────────────────────
// Tracks the remaining API quota so a cold start doesn't blow through the
// unauthenticated 60/hr limit. Each source costs up to 2 calls (main tree +
// master fallback), usually 1.

#[derive(Debug, Clone)]
pub struct QuotaBudget {
    pub remaining: u64,
    pub limit: u64,
    consumed: u64,
}

impl QuotaBudget {
    /// Calls still affordable this round after reserving a 20% safety buffer
    /// so the app never hits the hard limit mid-fetch.
    pub fn available(&self) -> u64 {
        let safety = (self.limit as f64 * 0.2) as u64;
        self.remaining.saturating_sub(self.consumed).saturating_sub(safety)
    }

    /// Reserve `n` calls; returns false if the budget can't cover them.
    pub fn reserve(&mut self, n: u64) -> bool {
        if self.available() >= n {
            self.consumed += n;
            true
        } else {
            false
        }
    }
}

/// Query the current quota (the rate_limit endpoint itself doesn't consume
/// quota). Falls back to an "unlimited" budget on failure so callers still run.
pub async fn fetch_quota_budget(token: Option<&str>) -> QuotaBudget {
    match get_github_rate_limit(token).await {
        Ok(rl) => QuotaBudget {
            remaining: rl.remaining,
            limit: rl.limit,
            consumed: 0,
        },
        Err(_) => QuotaBudget {
            remaining: u64::MAX,
            limit: u64::MAX,
            consumed: 0,
        },
    }
}

/// Batch fetch repo info for multiple repos (used for enriching trending/hot lists).
/// Returns a map of repo full_name -> RepoInfo for successfully fetched repos.
pub async fn fetch_github_repos_info_batch(
    repo_full_names: &[String],
    token: Option<&str>,
) -> std::collections::HashMap<String, RepoInfo> {
    use std::collections::HashMap;
    let mut results = HashMap::new();

    if repo_full_names.is_empty() {
        return results;
    }

    // Check cache first
    let cache = read_repo_info_cache().unwrap_or_default();
    let mut to_fetch: Vec<String> = Vec::new();

    for name in repo_full_names {
        let normalized = normalize_github_source(name);
        if let Some(cached) = cache.get(&normalized) {
            results.insert(normalized, cached.info.clone());
        } else {
            to_fetch.push(normalized);
        }
    }

    // Fetch remaining ones sequentially to avoid rate limiting
    // Limit concurrent requests to be kind to the API
    let client = global_client(token);
    let mut new_cache_entries: HashMap<String, CachedRepoInfo> = HashMap::new();
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Limit to first 20 repos to be safe with rate limits
    let limit = to_fetch.len().min(20);
    for name in to_fetch.iter().take(limit) {
        let url = format!("{}/{}", GITHUB_API_BASE, name);
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(repo) = resp.json::<GitHubRepoResponse>().await {
                    let info = RepoInfo {
                        full_name: repo.full_name.clone(),
                        description: repo.description,
                        html_url: repo.html_url,
                        stargazers_count: repo.stargazers_count,
                        forks_count: repo.forks_count,
                        open_issues_count: repo.open_issues_count,
                        language: repo.language,
                        license: repo.license.map(|l| crate::models::LicenseInfo {
                            spdx_id: l.spdx_id,
                            name: l.name,
                        }),
                        created_at: repo.created_at,
                        updated_at: repo.updated_at,
                        pushed_at: repo.pushed_at,
                        owner: crate::models::OwnerInfo {
                            login: repo.owner.login,
                            avatar_url: repo.owner.avatar_url,
                        },
                        default_branch: repo.default_branch,
                    };
                    results.insert(name.clone(), info.clone());
                    new_cache_entries.insert(
                        name.clone(),
                        CachedRepoInfo { info, timestamp: now },
                    );
                }
            }
        }
    }

    // Update cache with new entries
    if !new_cache_entries.is_empty() {
        let mut full_cache = cache;
        full_cache.extend(new_cache_entries);
        let _ = write_repo_info_cache(&full_cache);
    }

    results
}
