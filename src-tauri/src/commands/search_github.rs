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

/// Search for community skills on GitHub.
/// Uses /search/repositories (no auth required) with multiple query strategies.
pub async fn search_github_skills(query: &str, limit: u32, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    let client = build_client(token);
    let limit = limit.min(100);
    let mut all_skills = Vec::new();
    let mut seen_repos = std::collections::HashSet::new();

    // Strategy 1: Search repos with SKILL.md in readme
    if !query.trim().is_empty() {
        let search_query = format!("{} SKILL.md in:readme", query.trim());
        if let Ok(skills) = search_repos(&client, &search_query, limit, token).await {
            for skill in skills {
                if seen_repos.insert(skill.source.clone()) {
                    all_skills.push(skill);
                }
            }
        }
    }

    // Strategy 2: Search repos with "agent skills" or "claude skills" topic
    let topic_query = if query.trim().is_empty() {
        "topic:agent-skills".to_string()
    } else {
        format!("{} topic:agent-skills", query.trim())
    };
    if let Ok(skills) = search_repos(&client, &topic_query, limit, token).await {
        for skill in skills {
            if seen_repos.insert(skill.source.clone()) {
                all_skills.push(skill);
            }
        }
    }

    // Strategy 3: Search repos with "skill" in name and description
    let name_query = if query.trim().is_empty() {
        "skill agent in:name,description".to_string()
    } else {
        format!("{} skill agent in:name,description", query.trim())
    };
    if let Ok(skills) = search_repos(&client, &name_query, limit, token).await {
        for skill in skills {
            if seen_repos.insert(skill.source.clone()) {
                all_skills.push(skill);
            }
        }
    }

    // Sort by stars descending
    all_skills.sort_by(|a, b| b.installs.cmp(&a.installs));

    // Trim to limit
    all_skills.truncate(limit as usize);

    Ok(all_skills)
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
        });
    }

    Ok(skills)
}

/// Search GitHub repositories by keyword (broader search).
pub async fn search_github_repos(query: &str, limit: u32, token: Option<&str>) -> Result<Vec<RemoteSkill>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = build_client(token);
    let search_query = format!("{} SKILL.md in:readme", query.trim());

    search_repos(&client, &search_query, limit, token).await
}
