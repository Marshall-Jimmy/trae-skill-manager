use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const USER_AGENT: &str = "TRAE-Skill-Manager/1.0.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationEntry {
    pub original: String,
    pub translated: String,
    pub language: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationCache {
    pub entries: HashMap<String, TranslationEntry>,
}

fn translation_cache_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_default();
    data_dir.join("trae-skill-manager").join("translations.json")
}

fn read_translation_cache() -> HashMap<String, TranslationEntry> {
    let path = translation_cache_path();
    if !path.exists() {
        return HashMap::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    let cache: TranslationCache = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    cache.entries
}

fn write_translation_cache(entries: &HashMap<String, TranslationEntry>) -> Result<(), String> {
    let path = translation_cache_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    let cache = TranslationCache {
        entries: entries.clone(),
    };
    let json = serde_json::to_string_pretty(&cache)
        .map_err(|e| format!("Failed to serialize translations: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write translations: {}", e))
}

fn build_client() -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30));

    // Respect HTTP_PROXY / HTTPS_PROXY env vars (common for local proxy tools),
    // otherwise direct connections to Google's translate endpoint fail.
    for var in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(proxy_url) = std::env::var(var) {
            if !proxy_url.trim().is_empty() {
                if let Ok(proxy) = reqwest::Proxy::all(proxy_url.trim()) {
                    builder = builder.proxy(proxy);
                }
                break;
            }
        }
    }

    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Debug, Deserialize)]
struct ChatMessageResponse {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

/// Translate a batch of texts.
/// When `use_immersive` is true, uses the free Google Translate endpoint
/// (the same chain Immersive Translate's free tier relies on); otherwise
/// uses an OpenAI-compatible API.
/// Returns a map of original text -> translated text.
pub async fn translate_texts(
    texts: Vec<String>,
    target_language: &str,
    api_key: &str,
    api_base: &str,
    model: &str,
    use_immersive: bool,
) -> Result<HashMap<String, String>, String> {
    if use_immersive {
        return translate_texts_immersive(texts, target_language).await;
    }
    if texts.is_empty() {
        return Ok(HashMap::new());
    }
    if api_key.is_empty() {
        return Err("API Key 未配置，请先在设置中配置 AI 翻译".to_string());
    }

    // Check cache first
    let mut cache = read_translation_cache();
    let mut result = HashMap::new();
    let mut texts_to_translate = Vec::new();

    for text in &texts {
        let text_trimmed = text.trim();
        if text_trimmed.is_empty() {
            continue;
        }
        let cache_key = format!("{}:{}", target_language, text_trimmed);
        if let Some(entry) = cache.get(&cache_key) {
            result.insert(text_trimmed.to_string(), entry.translated.clone());
        } else {
            texts_to_translate.push(text_trimmed.to_string());
        }
    }

    if texts_to_translate.is_empty() {
        return Ok(result);
    }

    // Build the prompt
    let language_name = language_name(target_language);
    let combined_text = texts_to_translate.join("\n---\n");

    let prompt = format!(
        "Translate the following skill descriptions into {}. \
Keep technical terms accurate. \
The tokens ⟦TRAE_CODE_BLOCK_N⟧ (where N is a number) are placeholders standing in for code snippets. \
You MUST preserve each one exactly as written: keep the ⟦ and ⟧ brackets, keep the text TRAE_CODE_BLOCK, and keep the number unchanged. \
Do not translate, reword, remove, or reformat them in any way. \
Return ONLY the translations, one per line, in the same order, separated by '---'. \
Do not add any extra explanation.\n\n{}",
        language_name, combined_text
    );

    let client = build_client();
    let chat_url = format!("{}/chat/completions", api_base.trim_end_matches('/'));

    let request_body = ChatRequest {
        model: model.to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        temperature: 0.3,
        max_tokens: 2048,
    };

    let response = client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Translation request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Translation API error ({}): {}", status, body));
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse translation response: {}", e))?;

    let translated_text = chat_response
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .unwrap_or_default();

    // Parse the response - split by ---
    let translations: Vec<&str> = translated_text.split("---").map(|s| s.trim()).collect();

    for (i, original) in texts_to_translate.iter().enumerate() {
        let translated = translations.get(i).unwrap_or(&"").to_string();
        let translated_clean = translated.trim().to_string();
        if !translated_clean.is_empty() {
            result.insert(original.clone(), translated_clean.clone());

            // Save to cache
            let cache_key = format!("{}:{}", target_language, original);
            let now = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            cache.insert(
                cache_key,
                TranslationEntry {
                    original: original.clone(),
                    translated: translated_clean,
                    language: target_language.to_string(),
                    timestamp: now,
                },
            );
        }
    }

    // Write cache back
    let _ = write_translation_cache(&cache);

    Ok(result)
}

/// Translate a single text.
#[allow(dead_code)]
pub async fn translate_text(
    text: &str,
    target_language: &str,
    api_key: &str,
    api_base: &str,
    model: &str,
) -> Result<String, String> {
    let mut result = translate_texts(
        vec![text.to_string()],
        target_language,
        api_key,
        api_base,
        model,
        false,
    )
    .await?;
    Ok(result.remove(text).unwrap_or_else(|| text.to_string()))
}

/// Translate a batch of texts using the free Google Translate endpoint
/// (the chain Immersive Translate's free tier relies on). No API key needed.
pub async fn translate_texts_immersive(
    texts: Vec<String>,
    target_language: &str,
) -> Result<HashMap<String, String>, String> {
    if texts.is_empty() {
        return Ok(HashMap::new());
    }

    let mut cache = read_translation_cache();
    let mut result = HashMap::new();
    let mut texts_to_translate = Vec::new();

    for text in &texts {
        let text_trimmed = text.trim();
        if text_trimmed.is_empty() {
            continue;
        }
        let cache_key = format!("{}:{}", target_language, text_trimmed);
        if let Some(entry) = cache.get(&cache_key) {
            result.insert(text_trimmed.to_string(), entry.translated.clone());
        } else {
            texts_to_translate.push(text_trimmed.to_string());
        }
    }

    if texts_to_translate.is_empty() {
        return Ok(result);
    }

    let target = immersive_lang_code(target_language);
    let client = build_client();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    let mut tasks = tokio::task::JoinSet::new();

    for text in texts_to_translate.clone() {
        let client = client.clone();
        let semaphore = semaphore.clone();
        let target = target.clone();
        tasks.spawn(async move {
            let _permit = semaphore
                .acquire()
                .await
                .map_err(|_| "Immersive translation concurrency error".to_string())?;
            translate_one_immersive(&client, &text, &target).await
        });
    }

    let mut translated: Vec<(String, String)> = Vec::new();
    while let Some(task) = tasks.join_next().await {
        match task {
            Ok(Ok(pair)) => translated.push(pair),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(format!("Immersive translation task failed: {}", e)),
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    for (original, translated_text) in translated {
        if !translated_text.is_empty() {
            result.insert(original.clone(), translated_text.clone());
            let cache_key = format!("{}:{}", target_language, original);
            cache.insert(
                cache_key,
                TranslationEntry {
                    original: original.clone(),
                    translated: translated_text,
                    language: target_language.to_string(),
                    timestamp: now,
                },
            );
        }
    }

    let _ = write_translation_cache(&cache);
    Ok(result)
}

const IMMERSIVE_CHUNK_SIZE: usize = 2000;

async fn translate_one_immersive(
    client: &reqwest::Client,
    text: &str,
    target: &str,
) -> Result<(String, String), String> {
    // The whole document cannot go in the `q` query param: http::Uri rejects
    // URLs longer than 65534 bytes, so long READMEs fail with "builder error
    // for url". Translate in chunks and concatenate instead.
    let chunks = chunk_text(text, IMMERSIVE_CHUNK_SIZE);
    let mut translated_parts = Vec::with_capacity(chunks.len());
    for chunk in &chunks {
        let url = format!(
            "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl={}&q={}",
            target,
            urlencoding::encode(chunk)
        );
        let response = client
            .get(&url)
            .header("Referer", "https://translate.google.com/")
            .send()
            .await
            .map_err(|e| format!("Immersive translation request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Immersive translation error ({}): {}", status, body));
        }

        let parsed: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse immersive translation response: {}", e))?;
        let translated = parsed
            .first()
            .and_then(|v| v.get(0))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        translated_parts.push(translated);
    }
    Ok((text.to_string(), translated_parts.join("")))
}

/// Split text into chunks no larger than `max_len` bytes, breaking on newlines
/// so translations stay coherent. Never splits a multi-byte UTF-8 character.
fn chunk_text(text: &str, max_len: usize) -> Vec<String> {
    if text.len() <= max_len {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in text.split_inclusive('\n') {
        if !current.is_empty() && current.len() + line.len() > max_len {
            chunks.push(std::mem::take(&mut current));
        }
        if line.len() > max_len {
            if !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            let mut rest = line;
            while rest.len() > max_len {
                let (a, b) = safe_split_at(rest, max_len);
                chunks.push(a.to_string());
                rest = b;
            }
            if !rest.is_empty() {
                current.push_str(rest);
            }
        } else {
            current.push_str(line);
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn safe_split_at(s: &str, at: usize) -> (&str, &str) {
    let mut idx = at.min(s.len());
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    s.split_at(idx)
}

fn immersive_lang_code(code: &str) -> String {
    match code {
        "zh" | "zh-CN" | "zh-Hans" => "zh-CN".to_string(),
        "zh-TW" | "zh-Hant" => "zh-TW".to_string(),
        other => other.to_string(),
    }
}

/// Get cached translations for given texts.
#[allow(dead_code)]
pub fn get_cached_translations(
    texts: Vec<String>,
    target_language: &str,
) -> HashMap<String, String> {
    let cache = read_translation_cache();
    let mut result = HashMap::new();
    for text in texts {
        let cache_key = format!("{}:{}", target_language, text);
        if let Some(entry) = cache.get(&cache_key) {
            result.insert(text, entry.translated.clone());
        }
    }
    result
}

/// Clear all translation cache.
pub fn clear_translation_cache() -> Result<(), String> {
    let path = translation_cache_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove cache: {}", e))?;
    }
    Ok(())
}

fn language_name(code: &str) -> &str {
    match code {
        "zh" | "zh-CN" | "zh-Hans" => "简体中文",
        "zh-TW" | "zh-Hant" => "繁體中文",
        "en" => "English",
        "ja" => "日本語",
        "ko" => "한국어",
        "fr" => "Français",
        "de" => "Deutsch",
        "es" => "Español",
        "ru" => "Русский",
        "pt" => "Português",
        "it" => "Italiano",
        "ar" => "العربية",
        "hi" => "हिन्दी",
        "th" => "ไทย",
        "vi" => "Tiếng Việt",
        _ => code,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_text_short_returns_single_chunk() {
        let chunks = chunk_text("hello world", 2000);
        assert_eq!(chunks, vec!["hello world".to_string()]);
    }

    #[test]
    fn chunk_text_preserves_newlines() {
        let text = "line one\nline two\nline three\n";
        let chunks = chunk_text(text, 10);
        assert!(chunks.len() > 1);
        for c in &chunks {
            assert!(c.len() <= 10, "chunk too long: {:?}", c);
        }
        let joined: String = chunks.concat();
        assert_eq!(joined, text);
    }

    #[test]
    fn chunk_text_never_splits_utf8() {
        let text = "你好世界，这是一个测试。\n第二行内容。\n";
        let chunks = chunk_text(text, 7);
        for c in &chunks {
            assert!(c.is_char_boundary(0));
            assert!(c.len() <= 7, "chunk too long: {:?}", c);
        }
        assert_eq!(chunks.concat(), text);
    }

    #[test]
    fn chunk_text_hard_splits_long_line() {
        let text = "a".repeat(5000);
        let chunks = chunk_text(&text, 2000);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks.concat(), text);
        for c in &chunks {
            assert!(c.len() <= 2000);
        }
    }

    #[test]
    fn immersive_url_stays_under_uri_limit() {
        let text = "x".repeat(200_000);
        let chunks = chunk_text(&text, IMMERSIVE_CHUNK_SIZE);
        for chunk in &chunks {
            let url = format!(
                "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=zh-CN&q={}",
                urlencoding::encode(chunk)
            );
            assert!(url.len() < 65534, "URL too long: {}", url.len());
        }
    }
}
