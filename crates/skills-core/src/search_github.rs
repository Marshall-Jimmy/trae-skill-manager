use crate::models::RemoteSkill;
use serde::Deserialize;

const GITHUB_API_BASE: &str = "https://api.github.com";
const USER_AGENT: &str = "TRAE-Skill-Manager/1.0.0";

#[derive(Debug, Deserialize)]
struct GitHubRepository {
    full_name: String,
    html_url: String,
    #[allow(dead_code)]
    description: Option<String>,
    stargazers_count: u64,
    #[serde(default)]
    #[allow(dead_code)]
    topics: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RepoSearchResponse {
    items: Vec<GitHubRepository>,
}

fn build_client(token: Option<&str>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15));

    if let Some(tok) = token {
        if !tok.is_empty() {
            let mut headers = reqwest::header::HeaderMap::new();
            let mut auth_value = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", tok))
                .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static(""));
            auth_value.set_sensitive(true);
            headers.insert(reqwest::header::AUTHORIZATION, auth_value);
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

/// Aggregator/awesome-list repos are not installable skills; they only
/// document other skills and pollute search results.
fn is_aggregator_repo(full_name: &str, description: Option<&str>) -> bool {
    let name = full_name
        .split('/')
        .nth(1)
        .unwrap_or("")
        .to_lowercase();
    let desc = description.unwrap_or("").to_lowercase();

    if name.starts_with("awesome-") || name.starts_with("awesome_") {
        return true;
    }
    if name.contains("awesome") && (name.contains("skill") || name.contains("agent")) {
        return true;
    }
    if desc.contains("curated list") || desc.contains("collection of") || desc.contains("awesome list") {
        return true;
    }
    const AGGREGATORS: &[&str] = &[
        "awesome-mcp-servers",
        "awesome-claude-skills",
        "awesome-agent-skills",
        "agentic-awesome-skills",
        "awesome-codex-skills",
        "awesome-ai-agents",
        "awesome-llm-apps",
    ];
    AGGREGATORS.contains(&name.as_str())
}

/// Check whether a repo actually ships a SKILL.md. Uses raw.githubusercontent.com
/// (no API rate limit) for root-level and skills/ paths, then falls back to the
/// GitHub API contents endpoint for repos whose name suggests they are skill
/// repos but keep skills in per-skill subdirectories (skills/<name>/SKILL.md,
/// e.g. supabase/agent-skills, anthropics/skills, obra/superpowers).
async fn repo_has_skill_md(client: &reqwest::Client, repo: &str) -> bool {
    for branch in &["main", "master"] {
        for path in &["SKILL.md", "skills/SKILL.md"] {
            let url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}",
                repo, branch, path
            );
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    return true;
                }
            }
        }
    }

    // Only spend a rate-limited API call on repos that plausibly host skills.
    let name = repo.split('/').nth(1).unwrap_or("").to_lowercase();
    if !(name.contains("skill") || name.contains("agent") || name.contains("superpowers")) {
        return false;
    }

    let url = format!("{}/{}/contents/skills", GITHUB_API_BASE, repo);
    matches!(
        client.get(&url).send().await,
        Ok(r) if r.status().is_success()
    )
}

/// Search for community skills on GitHub.
///
/// Merges two sources so popular skills always surface regardless of GitHub
/// API rate limits:
///   1. skills.sh search (reliable, real install counts, no GitHub rate limit)
///   2. GitHub `/search/repositories` with `{q} in:name` (verified to return
///      relevant repos; the old `{q} topic:agent-skills` queries were dropped
///      because GitHub ignores the free-text term when combined with a topic
///      qualifier, returning unrelated high-star repos).
///
/// GitHub-only candidates are verified to actually ship a SKILL.md via
/// raw.githubusercontent.com (no API rate limit); skills.sh candidates are
/// already verified by the index.
pub async fn search_github_skills(query: &str, limit: u32, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.min(100);
    let client = build_client(token);

    let mut all_skills = Vec::new();
    let mut covered_sources = std::collections::HashSet::new();

    // 1. skills.sh search: primary source, always works.
    let ss_client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| client.clone());
    let ss_results = crate::fetch::search_skills_via_skills_sh(&ss_client, q).await;
    eprintln!("[search_github] skills.sh results for '{}': {}", q, ss_results.len());
    for skill in ss_results {
        covered_sources.insert(skill.source.clone());
        all_skills.push(skill);
    }

    // 2. GitHub name search: catches repos whose name contains the query.
    if let Ok(skills) = search_repos(&client, &format!("{} in:name", q), limit, token).await {
        for skill in skills {
            if !covered_sources.contains(&skill.source) {
                all_skills.push(skill);
            }
        }
    }

    // 3. Verify GitHub-only candidates actually ship a SKILL.md. skills.sh
    //    candidates are already verified by the index.
    let total_candidates = all_skills.len();
    let mut handles = Vec::new();
    for skill in all_skills {
        if skill.data_source == "skills-sh" {
            handles.push(tokio::spawn(async move { Some(skill) }));
            continue;
        }
        let client = client.clone();
        let source = skill.source.clone();
        handles.push(tokio::spawn(async move {
            if is_aggregator_repo(&source, None) {
                return None;
            }
            if repo_has_skill_md(&client, &source).await {
                Some(skill)
            } else {
                None
            }
        }));
    }

    let mut verified = Vec::new();
    for handle in handles {
        if let Ok(Some(skill)) = handle.await {
            verified.push(skill);
        }
    }
    eprintln!("[search_github] verified {} / {} candidates", verified.len(), total_candidates);

    // Sort by installs (skills.sh) then stars (GitHub) descending.
    verified.sort_by(|a, b| b.installs.cmp(&a.installs).then_with(|| a.name.cmp(&b.name)));
    verified.truncate(limit as usize);

    Ok(verified)
}

async fn search_repos(
    client: &reqwest::Client,
    search_query: &str,
    limit: u32,
    token: Option<&str>,
) -> Result<Vec<RemoteSkill>, String> {
    let url = format!(
        "{}/search/repositories?q={}&sort=stars&order=desc&per_page={}",
        GITHUB_API_BASE,
        urlencoding::encode(search_query),
        limit
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("GitHub search request failed: {}", e))?;

    if response.status().as_u16() == 403 {
        let remaining = response.headers().get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok());
        if remaining == Some("0") {
            let token_info = if token.is_some_and(|t| !t.is_empty()) {
                "已认证"
            } else {
                "未认证（60 次/小时）"
            };
            return Err(format!("GitHub API 速率限制已用完（{}），请稍后再试或配置 Token", token_info));
        }
        return Err("GitHub API 速率限制，请稍后再试".to_string());
    }

    if !response.status().is_success() {
        return Err(format!("GitHub API error ({})", response.status()));
    }

    let search_result: RepoSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub search response: {}", e))?;

    let mut skills = Vec::new();
    for repo in search_result.items {
        let skill_name = repo
            .full_name
            .split('/')
            .nth(1)
            .unwrap_or(&repo.full_name)
            .to_string();
        skills.push(RemoteSkill {
            id: format!("{}/{}", repo.full_name, skill_name),
            slug: skill_name.clone(),
            name: skill_name,
            source: repo.full_name.clone(),
            installs: repo.stargazers_count,
            source_type: "github".to_string(),
            install_url: format!("https://github.com/{}", repo.full_name),
            url: repo.html_url,
            is_duplicate: false,
            data_source: "github-api".to_string(),
            stars: Some(repo.stargazers_count),
            repo_description: repo.description.clone(),
            updated_at: None,
            license: None,
        });
    }

    Ok(skills)
}

/// Search GitHub repositories by keyword (broader search).
/// Uses `{q} in:name` — the old `{q} topic:agent-skills` query was dropped
/// because GitHub ignores the free-text term when combined with a topic
/// qualifier, returning unrelated high-star repos.
pub async fn search_github_repos(query: &str, limit: u32, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = build_client(token);
    let search_query = format!("{} in:name", query.trim());

    search_repos(&client, &search_query, limit, token).await
}
