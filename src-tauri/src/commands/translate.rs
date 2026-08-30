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
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
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

/// Translate a batch of texts using an OpenAI-compatible API.
/// Returns a map of original text -> translated text.
pub async fn translate_texts(
    texts: Vec<String>,
    target_language: &str,
    api_key: &str,
    api_base: &str,
    model: &str,
) -> Result<HashMap<String, String>, String> {
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
Keep technical terms accurate. Return ONLY the translations, one per line, in the same order, separated by '---'. \
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
    )
    .await?;
    Ok(result.remove(text).unwrap_or_else(|| text.to_string()))
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
