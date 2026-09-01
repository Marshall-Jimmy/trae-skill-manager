//! Phase 9.5 技能推荐：把「搜索」升级为「顾问」。
//!
//! 纯本地算法，不依赖 LLM：复用 fetch::relevance_score 的思路与关键词扩展，
//! 但采用加权评分——任务原文提取的关键词权重是别名扩展词的 2 倍，
//! 避免「搜 pdf 却推荐 docx」这类别名喧宾夺主的问题。
//! 输入是自然语言任务描述，输出带 reason + confidence 的排序列表。

use crate::fetch::{expand_query_aliases, fetch_skills};
use crate::models::{RecommendResult, RemoteSkill, SkillRecommendation};
use crate::scan;
use crate::tools;
use std::collections::HashSet;

/// 常见停用词（中英文），避免无意义 token 干扰匹配。
const STOPWORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
    "i", "my", "me", "you", "your", "we", "our", "it", "its", "this", "that", "from",
    "by", "at", "be", "do", "does", "did", "can", "could", "will", "would", "should",
    "want", "need", "help", "please", "using", "use", "used", "have", "has", "had",
    "about", "into", "over", "under", "some", "any", "all", "each", "every", "more",
    "most", "other", "such", "only", "own", "same", "so", "than", "too", "very",
    "just", "also", "how", "what", "when", "where", "which", "who", "whom", "why",
    "not", "no", "yes", "make", "making", "get", "got", "give", "take", "like",
    "there", "here", "then", "than", "them", "they", "their", "these", "those",
    "做", "要", "一个", "这个", "那个", "一些", "可以", "需要", "帮助", "请", "我",
    "你", "他", "她", "它", "我们", "你们", "他们", "的", "了", "着", "和", "与",
    "或", "在", "从", "对", "为", "把", "被", "让", "给", "用", "使用", "进行",
    "完成", "实现", "处理", "提取", "生成", "创建", "编写", "写", "做", "任务",
];

/// 从自然语言任务描述中提取匹配关键词。
/// 返回 (primary, aliases)：primary 是任务原文直接提取的词（高权重），
/// aliases 是别名扩展出的格式族词（低权重）。
fn extract_terms(task: &str) -> (Vec<String>, Vec<String>) {
    let lower = task.to_lowercase();
    let mut primary: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // ASCII 单词
    for tok in lower.split(|c: char| !c.is_ascii_alphanumeric()) {
        let t = tok.trim();
        if t.len() < 2 || STOPWORDS.contains(&t) {
            continue;
        }
        if seen.insert(t.to_string()) {
            primary.push(t.to_string());
        }
    }

    // 连续 CJK 的 2 字滑窗（如 "提取表格数据" → 提取/取表/表格/格数/数据）
    let cjk_run: Vec<char> = lower.chars().collect();
    let mut run_start: Option<usize> = None;
    for (i, c) in cjk_run.iter().enumerate() {
        let is_cjk = (*c as u32) >= 0x4E00 && (*c as u32) <= 0x9FFF;
        match (is_cjk, run_start) {
            (true, None) => run_start = Some(i),
            (false, Some(start)) => {
                push_cjk_bigrams(&cjk_run[start..i], &mut primary, &mut seen);
                run_start = None;
            }
            _ => {}
        }
    }
    if let Some(start) = run_start {
        push_cjk_bigrams(&cjk_run[start..], &mut primary, &mut seen);
    }

    // 别名扩展（pdf→docx/pptx 等格式族），只保留新增的别名词
    let mut aliases: Vec<String> = Vec::new();
    for t in &primary {
        for alias in expand_query_aliases(t) {
            if seen.insert(alias.clone()) {
                aliases.push(alias);
            }
        }
    }
    (primary, aliases)
}

fn push_cjk_bigrams(run: &[char], terms: &mut Vec<String>, seen: &mut HashSet<String>) {
    if run.len() < 2 {
        return;
    }
    for w in run.windows(2) {
        let s: String = w.iter().collect();
        if !STOPWORDS.contains(&s.as_str()) && seen.insert(s.clone()) {
            terms.push(s);
        }
    }
}

/// 单关键词对单个技能的匹配得分（与 fetch::relevance_score 同规则）。
fn term_score(skill: &RemoteSkill, term: &str) -> i64 {
    let name = skill.name.to_lowercase();
    let source = skill.source.to_lowercase();
    let desc = skill
        .repo_description
        .as_deref()
        .unwrap_or("")
        .to_lowercase();
    let mut score = 0i64;
    if name == *term {
        score += 100;
    } else if name.starts_with(term) {
        score += 60;
    } else if name.contains(term) {
        score += 40;
    }
    if source == *term {
        score += 30;
    } else if source.contains(term) {
        score += 15;
    }
    if desc.contains(term) {
        score += 8;
    }
    score
}

/// 加权评分：原文关键词权重是别名扩展词的 2 倍。
fn weighted_score(skill: &RemoteSkill, primary: &[String], aliases: &[String]) -> i64 {
    let mut score = 0i64;
    for t in primary {
        score += term_score(skill, t) * 2;
    }
    for t in aliases {
        score += term_score(skill, t);
    }
    score
}

/// 生成人类可读的推荐理由。
fn build_reason(skill: &RemoteSkill, primary: &[String], aliases: &[String]) -> String {
    let name = skill.name.to_lowercase();
    let source = skill.source.to_lowercase();
    let desc = skill
        .repo_description
        .as_deref()
        .unwrap_or("")
        .to_lowercase();

    // 优先用原文关键词生成理由，其次别名
    let terms: Vec<&str> = primary.iter().map(|s| s.as_str()).chain(aliases.iter().map(|s| s.as_str())).collect();
    for term in terms {
        if name == term {
            return format!("你的任务涉及「{}」，该技能名称与其直接匹配", term);
        }
        if name.starts_with(term) {
            return format!("你的任务涉及「{}」，该技能名称以其开头", term);
        }
        if name.contains(term) {
            return format!("你的任务涉及「{}」，该技能名称包含该关键词", term);
        }
        if source == term || source.contains(term) {
            return format!("该技能来自与「{}」相关的官方/知名仓库", term);
        }
        if desc.contains(term) {
            return format!("该技能描述涵盖「{}」相关能力", term);
        }
    }
    // 兜底：安装量
    if skill.installs >= 1000 {
        format!(
            "社区验证充分（{} 次安装），覆盖该领域常见需求",
            skill.installs
        )
    } else {
        "与你的任务领域相关，可作为参考".to_string()
    }
}

/// 推荐技能：描述任务 → 返回带理由的排序列表。
pub async fn recommend_skills(
    task: &str,
    limit: Option<u32>,
    token: Option<&str>,
) -> Result<RecommendResult, String> {
    let query = task.trim().to_string();
    if query.is_empty() {
        return Err("任务描述不能为空".to_string());
    }

    let (primary, aliases) = extract_terms(&query);
    if primary.is_empty() && aliases.is_empty() {
        return Err("无法从任务描述中提取有效关键词，请描述得更具体一些".to_string());
    }

    let all = fetch_skills(None, None, None, token)
        .await
        .map_err(|e| format!("获取技能目录失败: {}", e))?;

    // 已安装技能集合（用于标记 installed）
    let installed = scan_installed_names();

    let mut scored: Vec<(i64, &RemoteSkill)> = all
        .data
        .iter()
        .filter_map(|s| {
            let score = weighted_score(s, &primary, &aliases);
            if score > 0 {
                Some((score, s))
            } else {
                None
            }
        })
        .collect();

    // 按分数降序，安装量兜底
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.installs.cmp(&a.1.installs))
            .then_with(|| a.1.name.cmp(&b.1.name))
    });

    let limit = limit.unwrap_or(5).max(1) as usize;
    let max_score = scored.first().map(|(s, _)| *s).unwrap_or(1).max(1) as f64;

    let mut recommendations: Vec<SkillRecommendation> = scored
        .into_iter()
        .take(limit)
        .map(|(score, s)| {
            let installed_in = installed
                .get(&s.id)
                .cloned()
                .unwrap_or_default();
            let is_installed = !installed_in.is_empty();
            SkillRecommendation {
                id: s.id.clone(),
                name: s.name.clone(),
                source: s.source.clone(),
                description: s.repo_description.clone(),
                stars: s.stars,
                installs: s.installs,
                confidence: (score as f64 / max_score).clamp(0.0, 1.0),
                reason: build_reason(s, &primary, &aliases),
                installed: is_installed,
                installed_in,
            }
        })
        .collect();

    // 建议动作：第一个未安装的推荐
    let suggested_action = recommendations
        .iter()
        .find(|r| !r.installed)
        .map(|r| format!("install {}/{}", r.source, r.name));

    // 若全部已安装，提示无需安装
    if suggested_action.is_none() && !recommendations.is_empty() {
        recommendations.truncate(1);
    }

    Ok(RecommendResult {
        query,
        recommendations,
        suggested_action,
    })
}

/// 扫描各工具已安装技能，返回 id → 工具列表。
fn scan_installed_names() -> std::collections::HashMap<String, Vec<String>> {
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for tool in tools::all_tools() {
        let Some(dir) = tool.global_dir() else {
            continue;
        };
        for skill in scan::scan_directory(&dir) {
            if let Some(id) = &skill.manifest_id {
                let entry = map.entry(id.clone()).or_default();
                if !entry.contains(&tool.id().to_string()) {
                    entry.push(tool.id().to_string());
                }
            }
        }
    }
    map
}
