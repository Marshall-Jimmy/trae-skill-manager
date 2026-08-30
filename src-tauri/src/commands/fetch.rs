use crate::models::{ApiResponse, Pagination, RemoteSkill, RepoInfo, RepoSkillInfo, SkillDetail, SkillFile};
use serde::Deserialize;
use tokio::process::Command;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

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

const GITHUB_API_BASE: &str = "https://api.github.com/repos";
const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com";
const USER_AGENT: &str = "TRAE-Skill-Manager/1.0.0";

const KNOWN_REPOS: &[&str] = &[
    // ── 官方 Skill 仓库 ──────────────────────────────────────────────
    "anthropics/skills",           // Anthropic 官方：PDF/DOCX/XLSX/PPTX 等
    "vercel-labs/agent-skills",    // Vercel 官方：React/Next.js 最佳实践
    "google/skills",               // Google 官方：BigQuery/GKE/Firebase 等
    "supabase/agent-skills",        // Supabase 官方：Postgres 最佳实践
    // ── 社区 Skill 仓库 ────────────────────────────────────────────
    "obra/superpowers",             // 结构化 debug/TDD/项目规划 meta-skill
    "ComposioHQ/awesome-claude-skills", // 30+ 实用 skill（changelog/mcp-builder 等）
    "czlonkowski/n8n-skills",       // n8n 工作流构建 skill
    "K-Dense-AI/scientific-agent-skills", // 135 个科研领域 skill
];

const CACHE_DURATION_SECS: u64 = 300; // 5 minutes

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

// ─── Cache ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CachedSkills {
    skills: Vec<RemoteSkill>,
    timestamp: i64, // unix timestamp seconds
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
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs() as i64;
    if now - cached.timestamp > CACHE_DURATION_SECS as i64 { return None; }
    Some(cached.skills)
}

fn write_cache(skills: &[RemoteSkill]) -> Result<(), String> {
    let path = cache_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    let cached = CachedSkills {
        skills: skills.to_vec(),
        timestamp: SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs() as i64,
    };
    let json = serde_json::to_string_pretty(&cached).map_err(|e| format!("Failed to serialize cache: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write cache: {}", e))
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
        },
    ]
}

// ─── Main fetch: combine GitHub Raw + GitHub API + npx skills search + built-in ─

pub async fn fetch_skills(
    view: Option<String>,
    _page: Option<u32>,
    _per_page: Option<u32>,
    token: Option<&str>,
) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    // Try cache first: cache stores the merged raw data, then we sort by view on read
    let token_owned = token.map(|s| s.to_string());
    let mut all_skills = if let Some(cached) = read_cache() {
        cached
    } else {
        let mut merged = Vec::new();

        // Run all sources in parallel for maximum coverage and speed
        // Each source has its own timeout via the HTTP client
        let token_for_raw = token_owned.clone();
        let raw_fut = async move {
            let mut skills = Vec::new();
            for repo in KNOWN_REPOS {
                match fetch_repo_skills_raw(repo, token_for_raw.as_deref()).await {
                    Ok(s) => skills.extend(s),
                    Err(e) => eprintln!("Warning: raw fetch failed for {}: {}", repo, e),
                }
            }
            skills
        };

        let token_for_api = token_owned.clone();
        let api_fut = async move {
            let mut skills = Vec::new();
            for repo in KNOWN_REPOS {
                match fetch_repo_skills_api(repo, token_for_api.as_deref()).await {
                    Ok(s) => skills.extend(s),
                    Err(e) => eprintln!("Warning: API fetch failed for {}: {}", repo, e),
                }
            }
            skills
        };

        let npx_fut = async {
            match fetch_skills_via_npx().await {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Warning: npx skills search failed: {}", e);
                    Vec::new()
                }
            }
        };

        // Run all sources in parallel with an overall timeout of 15 seconds.
        // Use individual futures so a timeout still preserves partial results.
        let raw_handle = tokio::spawn(raw_fut);
        let api_handle = tokio::spawn(api_fut);
        let npx_handle = tokio::spawn(npx_fut);

        let raw_results = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            raw_handle
        ).await {
            Ok(Ok(results)) => results,
            Ok(Err(e)) => { eprintln!("Warning: raw fetch task failed: {}", e); Vec::new() }
            Err(_) => { eprintln!("Warning: raw fetch timeout"); Vec::new() }
        };
        let api_results = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            api_handle
        ).await {
            Ok(Ok(results)) => results,
            Ok(Err(e)) => { eprintln!("Warning: API fetch task failed: {}", e); Vec::new() }
            Err(_) => { eprintln!("Warning: API fetch timeout"); Vec::new() }
        };
        let npx_results = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            npx_handle
        ).await {
            Ok(Ok(results)) => results,
            Ok(Err(e)) => { eprintln!("Warning: npx fetch task failed: {}", e); Vec::new() }
            Err(_) => { eprintln!("Warning: npx fetch timeout"); Vec::new() }
        };

        // Merge all results with deduplication by id
        let mut seen = std::collections::HashSet::new();
        for skill in raw_results.into_iter().chain(api_results).chain(npx_results) {
            if seen.insert(skill.id.clone()) {
                merged.push(skill);
            }
        }

        // Final fallback: built-in skills list if nothing found
        if merged.is_empty() {
            merged = get_built_in_skills();
        }

        // Write cache (raw unsorted data)
        let _ = write_cache(&merged);

        merged
    };

    // Sort differently based on view (always applied, even on cached data)
    match view.as_deref() {
        Some("trending") => {
            use std::time::{SystemTime, UNIX_EPOCH};
            let seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let mut rng = seed;
            for i in (1..all_skills.len()).rev() {
                rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let j = (rng as usize) % (i + 1);
                all_skills.swap(i, j);
            }
        }
        Some("browse") => {
            all_skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        }
        _ => {
            all_skills.sort_by(|a, b| b.installs.cmp(&a.installs).then_with(|| a.name.cmp(&b.name)));
        }
    }

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

// ─── GitHub Raw fetch (no rate limit) ─────────────────────────────────────

async fn fetch_repo_skills_raw(repo: &str, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    // Try to fetch directory listing via raw GitHub
    // GitHub raw doesn't provide directory listings, so we try common skill names
    let client = build_client(token);
    let mut skills = Vec::new();

    // Common skill names to check
    let common_skills = [
        "web-search", "github", "linear", "notion", "slack", "jira", "stripe",
        "aws", "postgres", "redis", "docker", "kubernetes", "terraform",
        "cloudflare", "filesystem", "google-drive", "puppeteer", "sentry",
        "playwright-mcp", "agent-skills",
    ];

    for skill_name in &common_skills {
        let url = format!("{}/{}/main/{}/SKILL.md", GITHUB_RAW_BASE, repo, skill_name);
        let resp = client.head(&url).send().await;
        if let Ok(r) = resp {
            if r.status().is_success() {
                skills.push(RemoteSkill {
                    id: format!("{}/{}", repo, skill_name),
                    slug: skill_name.to_string(),
                    name: skill_name.to_string(),
                    source: repo.to_string(),
                    installs: 0,
                    source_type: "github".to_string(),
                    install_url: format!("https://github.com/{}", repo),
                    url: format!("https://github.com/{}/tree/main/{}", repo, skill_name),
                    is_duplicate: false,
                    data_source: "github-raw".to_string(),
                    stars: None,
                });
            }
        }
    }

    if skills.is_empty() {
        return Err("No skills found via raw GitHub".to_string());
    }

    Ok(skills)
}

/// Fetch a GitHub repo's README or SKILL.md content for community skill preview.
pub async fn fetch_github_repo_readme(repo_full_name: &str, token: Option<&str>) -> Result<String, String> {
    let client = build_client(token);

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
    let client = build_client(token);

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
    let client = build_client(token);

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
    let client = build_client(token);

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

async fn fetch_repo_skills_api(repo: &str, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    let url = format!("{}/{}/contents/skills", GITHUB_API_BASE, repo);
    let client = build_client(token);

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

    let mut skills = Vec::new();
    for item in items {
        if item.item_type != "dir" {
            continue;
        }
        skills.push(RemoteSkill {
            id: format!("{}/{}", repo, item.name),
            slug: item.name.clone(),
            name: item.name.clone(),
            source: repo.to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo),
            url: format!("https://github.com/{}/tree/main/skills/{}", repo, item.name),
            is_duplicate: false,
            data_source: "github-api".to_string(),
            stars: None,
        });
    }

    Ok(skills)
}

async fn fetch_repo_skills_from_root_api(repo: &str, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    let url = format!("{}/{}/contents/", GITHUB_API_BASE, repo);
    let client = build_client(token);

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

    let skip = [".github", ".gitignore", "bin", "src", "tests", "scripts", "spec", "template", "docs", "examples"];
    let mut skills = Vec::new();
    for item in items {
        if item.item_type != "dir" || skip.contains(&item.name.as_str()) {
            continue;
        }
        skills.push(RemoteSkill {
            id: format!("{}/{}", repo, item.name),
            slug: item.name.clone(),
            name: item.name.clone(),
            source: repo.to_string(),
            installs: 0,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo),
            url: format!("https://github.com/{}/tree/main/{}", repo, item.name),
            is_duplicate: false,
            data_source: "github-api".to_string(),
            stars: None,
        });
    }

    Ok(skills)
}

// ─── npx skills search fallback ───────────────────────────────────────────

async fn fetch_skills_via_npx() -> Result<Vec<RemoteSkill>, String> {
    let output = hidden_command("npx")
        .args(["skills", "search", "--limit", "50"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute npx skills search: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "npx skills search failed: {}",
            if stderr.is_empty() { stdout } else { stderr }
        ));
    }

    parse_npx_search_output(&stdout)
}

fn parse_npx_search_output(output: &str) -> Result<Vec<RemoteSkill>, String> {
    let mut skills = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("Searching")
            || trimmed.starts_with("──")
            || trimmed.starts_with("---")
            || trimmed.starts_with("No skills")
            || trimmed.starts_with("Usage:")
            || trimmed.starts_with("Found")
        {
            continue;
        }

        // Parse lines like: "owner/repo/skill-name  Description here"
        let parts: Vec<&str> = if trimmed.contains('\t') {
            trimmed.splitn(2, '\t').collect()
        } else {
            let mut split_pos = None;
            let chars: Vec<char> = trimmed.chars().collect();
            for i in 0..chars.len().saturating_sub(1) {
                if chars[i] == ' ' && chars[i + 1] == ' ' {
                    split_pos = Some(i);
                    break;
                }
            }
            match split_pos {
                Some(pos) => {
                    let (a, b) = trimmed.split_at(pos);
                    vec![a.trim(), b.trim()]
                }
                None => vec![trimmed],
            }
        };

        let id_part = parts[0].trim();
        let _description = parts.get(1).map(|s| s.trim().to_string());

        // Parse "owner/repo/skill-name" or "owner/repo"
        let segments: Vec<&str> = id_part.split('/').collect();
        if segments.len() >= 2 {
            let source = format!("{}/{}", segments[0], segments[1]);
            let slug = if segments.len() >= 3 {
                segments[2..].join("/")
            } else {
                segments[1].to_string()
            };

            skills.push(RemoteSkill {
                id: id_part.to_string(),
                slug: slug.clone(),
                name: slug.clone(),
                source,
                installs: 0,
                source_type: "github".to_string(),
                install_url: format!("https://github.com/{}", id_part),
                url: format!("https://github.com/{}", id_part),
                is_duplicate: false,
                data_source: "npx".to_string(),
                stars: None,
            });
        }
    }

    Ok(skills)
}

// ─── Search ───────────────────────────────────────────────────────────────

pub async fn search_skills(
    query: &str,
    _limit: Option<u32>,
    token: Option<&str>,
) -> Result<ApiResponse<Vec<RemoteSkill>>, String> {
    let all = fetch_skills(None, None, None, token).await?;
    let q = query.to_lowercase();

    let filtered: Vec<RemoteSkill> = all
        .data
        .into_iter()
        .filter(|s| {
            s.name.to_lowercase().contains(&q)
                || s.source.to_lowercase().contains(&q)
        })
        .collect();

    let total = filtered.len() as u32;
    Ok(ApiResponse {
        data: filtered,
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
    let client = build_client(token);

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
        Ok(skills) if !skills.is_empty() => return Ok(skills),
        Ok(_) => { /* empty, try fallback */ }
        Err(e) => eprintln!("Warning: npx --list failed for {}: {}", normalized, e),
    }

    // Method 2: Fallback to GitHub API + Raw scanning
    list_repo_skills_via_github(&normalized, token).await
}

/// Use `npx skills add <source> --list` to discover real skills in a repo.
async fn list_repo_skills_via_npx(source: &str) -> Result<Vec<RepoSkillInfo>, String> {
    let output = hidden_command("npx")
        .args(["skills", "add", source, "--list"])
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
        let trimmed = line.trim();

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
            || trimmed.contains("│")
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
        if line.contains("│") {
            let content = line.split("│").last().unwrap_or("").trim();
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
    let client = build_client(token);

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

        // Check via Raw if this dir has SKILL.md
        let skill_md_url = format!("{}/{}/main/{}/SKILL.md", GITHUB_RAW_BASE, source, item.name);
        let md_resp = client.head(&skill_md_url).send().await;
        if matches!(md_resp, Ok(ref r) if r.status().is_success()) {
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

/// Normalize GitHub source: extract owner/repo from full URL or clean up
fn normalize_github_source(source: &str) -> String {
    let trimmed = source.trim();
    if trimmed.starts_with("https://github.com/") {
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
    }
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
            let mut split_pos = None;
            let chars: Vec<char> = cleaned.chars().collect();
            for i in 0..chars.len().saturating_sub(1) {
                if chars[i] == ' ' && chars[i + 1] == ' ' {
                    split_pos = Some(i);
                    break;
                }
            }
            match split_pos {
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
        .filter(|(_, v)| now - v.timestamp <= CACHE_DURATION_SECS as i64)
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

    let client = build_client(token);
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
    let client = build_client(Some(token));
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
    let client = build_client(token);
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
