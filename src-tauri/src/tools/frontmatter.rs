//! SKILL.md frontmatter 解析与校验。
//!
//! frontmatter 很规整（`key: value` / 简单数组），手写解析足够，不引入
//! serde_yaml 依赖。解析失败时降级为「无 frontmatter 技能」，绝不报错崩溃。
//! 这个解析器同时服务：安装前验证、跨工具格式转换、健康度诊断（Phase 7）。

use serde_json::{Map, Value};

#[derive(Debug, Clone, Default)]
pub struct SkillFrontmatter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
    pub version: Option<String>,
    pub tags: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub metadata: Option<Value>,
    /// 厂商特有字段原样保留（如 Cursor 的 paths / disable-model-invocation）
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone)]
pub struct ParsedSkill {
    pub frontmatter: SkillFrontmatter,
    /// 正文内容：供 Phase 7 健康度诊断等消费，当前仅在测试中断言。
    #[allow(dead_code)]
    pub body: String,
    pub has_frontmatter: bool,
}

/// 解析 SKILL.md 内容，返回 frontmatter 与正文。
pub fn parse_skill(content: &str) -> ParsedSkill {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return ParsedSkill {
            frontmatter: SkillFrontmatter::default(),
            body: content.to_string(),
            has_frontmatter: false,
        };
    }

    let rest = &trimmed[3..];
    // 找闭合的 --- 行；找不到则整个视为 frontmatter
    let end = rest.find("\n---").map(|p| p + 1).unwrap_or(rest.len());
    let frontmatter_str = &rest[..end];
    let body = if end < rest.len() { &rest[end + 4..] } else { "" };

    let mut fm = SkillFrontmatter::default();
    let mut lines = frontmatter_str.lines().peekable();

    while let Some(raw) = lines.next() {
        let line = raw.trim_end();
        if line.trim().is_empty() {
            continue;
        }

        let Some((key, val)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let val = val.trim();

        match key {
            "name" => fm.name = Some(clean_value(val)),
            "description" => {
                // 支持多行折叠/块描述：`>` 折叠为空格、`|` 保留换行
                let mut block_lines: Vec<String> = Vec::new();
                while let Some(next) = lines.peek() {
                    if next.starts_with(' ') && !next.trim_start().starts_with('-') {
                        block_lines.push(next.trim().to_string());
                        lines.next();
                    } else {
                        break;
                    }
                }
                let desc = if val == ">" || val == "|" {
                    block_lines.join(if val == ">" { " " } else { "\n" })
                } else if !block_lines.is_empty() {
                    let mut d = clean_value(val);
                    d.push(' ');
                    d.push_str(&block_lines.join(" "));
                    d
                } else {
                    clean_value(val)
                };
                fm.description = Some(desc);
            }
            "license" => fm.license = Some(clean_value(val)),
            "version" => fm.version = Some(clean_value(val)),
            "tags" => {
                if val.is_empty() {
                    fm.tags = parse_block_list(&mut lines);
                } else {
                    fm.tags = parse_inline_list(val);
                }
            }
            "allowed-tools" | "allowedTools" => {
                if val.is_empty() {
                    fm.allowed_tools = parse_block_list(&mut lines);
                } else {
                    fm.allowed_tools = parse_inline_list(val);
                }
            }
            "metadata" => fm.metadata = parse_metadata(val),
            _ => {
                fm.extra.insert(key.to_string(), parse_scalar(val));
            }
        }
    }

    ParsedSkill {
        frontmatter: fm,
        body: body.to_string(),
        has_frontmatter: true,
    }
}

/// 校验 frontmatter 是否符合 agentskills.io 规范，返回错误列表（空 = 通过）。
pub fn validate_frontmatter(fm: &SkillFrontmatter) -> Vec<String> {
    let mut errors = Vec::new();

    match &fm.name {
        Some(name) => {
            if name.is_empty() {
                errors.push("name 不能为空".to_string());
            } else if name.len() > 64 {
                errors.push(format!("name 长度超过 64 字符（当前 {}）", name.len()));
            } else if !is_valid_name(name) {
                errors.push(format!(
                    "name '{}' 不合规：仅允许小写字母、数字、连字符，且不能以连字符开头/结尾",
                    name
                ));
            }
        }
        None => errors.push("缺少 name 字段".to_string()),
    }

    match &fm.description {
        Some(desc) => {
            if desc.trim().is_empty() {
                errors.push("description 不能为空".to_string());
            } else if desc.len() > 1024 {
                errors.push(format!("description 超过 1024 字符（当前 {}）", desc.len()));
            }
        }
        None => errors.push("缺少 description 字段".to_string()),
    }

    errors
}

fn is_valid_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    let bytes = name.as_bytes();
    if bytes[0] == b'-' || bytes[bytes.len() - 1] == b'-' {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// 解析块列表：
/// ```yaml
/// tags:
///   - a
///   - b
/// ```
fn parse_block_list(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Vec<String> {
    let mut items = Vec::new();
    while let Some(next) = lines.peek() {
        let trimmed = next.trim_start();
        if let Some(item) = trimmed.strip_prefix("- ") {
            items.push(clean_value(item));
            lines.next();
        } else {
            break;
        }
    }
    items
}

/// 解析内联数组：`[a, b, c]`
fn parse_inline_list(val: &str) -> Vec<String> {
    let trimmed = val.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        let inner = &trimmed[1..trimmed.len() - 1];
        inner
            .split(',')
            .map(|t| clean_value(t))
            .filter(|t| !t.is_empty())
            .collect()
    } else if !trimmed.is_empty() {
        vec![clean_value(trimmed)]
    } else {
        Vec::new()
    }
}

/// 解析 metadata 字段：尝试 JSON 对象，失败则保留原始字符串。
fn parse_metadata(val: &str) -> Option<Value> {
    let trimmed = val.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
            return Some(v);
        }
    }
    Some(Value::String(clean_value(trimmed)))
}

/// 解析标量值：布尔 / 数字 / 字符串。
fn parse_scalar(val: &str) -> Value {
    let trimmed = val.trim();
    match trimmed {
        "true" => Value::Bool(true),
        "false" => Value::Bool(false),
        _ if trimmed.parse::<i64>().is_ok() => Value::Number(trimmed.parse::<i64>().unwrap().into()),
        _ => Value::String(clean_value(trimmed)),
    }
}

/// 清理 YAML 值：去引号、去空白。
fn clean_value(val: &str) -> String {
    val.trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_frontmatter() {
        let content = "---\nname: web-search\ndescription: Search the web for up-to-date information\nlicense: MIT\n---\n# Body\n";
        let parsed = parse_skill(content);
        assert!(parsed.has_frontmatter);
        assert_eq!(parsed.frontmatter.name.as_deref(), Some("web-search"));
        assert_eq!(
            parsed.frontmatter.description.as_deref(),
            Some("Search the web for up-to-date information")
        );
        assert_eq!(parsed.frontmatter.license.as_deref(), Some("MIT"));
        assert_eq!(parsed.body.trim(), "# Body");
    }

    #[test]
    fn parses_inline_and_block_lists() {
        let content = "---\nname: foo\ndescription: d\ntags: [a, b, c]\nallowed-tools:\n  - bash\n  - python\n---\n";
        let parsed = parse_skill(content);
        assert_eq!(parsed.frontmatter.tags, vec!["a", "b", "c"]);
        assert_eq!(parsed.frontmatter.allowed_tools, vec!["bash", "python"]);
    }

    #[test]
    fn parses_multiline_description() {
        let content = "---\nname: foo\ndescription: >\n  First line\n  Second line\n---\n";
        let parsed = parse_skill(content);
        assert_eq!(
            parsed.frontmatter.description.as_deref(),
            Some("First line Second line")
        );
    }

    #[test]
    fn keeps_vendor_extra_fields() {
        let content = "---\nname: foo\ndescription: d\npaths:\n  - src/**\ndisable-model-invocation: true\n---\n";
        let parsed = parse_skill(content);
        assert_eq!(parsed.frontmatter.extra["disable-model-invocation"], Value::Bool(true));
        assert!(parsed.frontmatter.extra.contains_key("paths"));
    }

    #[test]
    fn no_frontmatter_falls_back() {
        let parsed = parse_skill("# Just a heading\n\nSome body");
        assert!(!parsed.has_frontmatter);
        assert!(parsed.frontmatter.name.is_none());
    }

    #[test]
    fn validates_name_rules() {
        let fm = SkillFrontmatter {
            name: Some("Web-Search".to_string()),
            description: Some("d".to_string()),
            ..Default::default()
        };
        let errors = validate_frontmatter(&fm);
        assert!(errors.iter().any(|e| e.contains("不合规")));

        let fm2 = SkillFrontmatter {
            name: Some("web-search".to_string()),
            description: Some("d".to_string()),
            ..Default::default()
        };
        assert!(validate_frontmatter(&fm2).is_empty());
    }

    #[test]
    fn validates_description_length() {
        let long_desc = "x".repeat(1025);
        let fm = SkillFrontmatter {
            name: Some("foo".to_string()),
            description: Some(long_desc),
            ..Default::default()
        };
        let errors = validate_frontmatter(&fm);
        assert!(errors.iter().any(|e| e.contains("1024")));
    }
}
