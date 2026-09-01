//! Phase 7.1 技能健康度诊断：本地扫描技能目录，输出 token 成本、冲突、
//! 僵尸技能与质量评分。全部本地计算，不依赖 LLM。

use crate::models::{
    DiagnosisConflict, DiagnosisQuality, DiagnosisQualityIssue, DiagnosisSummary,
    DiagnosisTokenCost, DiagnosisTopSkill, DiagnosisZombie, SkillDiagnosisResult, TelemetryConfig,
};
use crate::tools;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const SKILL_MD: &str = "SKILL.md";
const SKILL_MD_DISABLED: &str = "SKILL.md.disabled";
const MANIFEST_FILE: &str = "skill.manifest.json";

/// 扫描指定工具的全局技能目录，返回完整诊断结果。
/// 目录不存在时返回空结果（不报错）。
pub fn diagnose_skills(tool_id: Option<&str>) -> Result<SkillDiagnosisResult, String> {
    let tool = tools::get_tool(tool_id.unwrap_or("trae")).unwrap_or_else(tools::default_tool);
    let Some(root) = tool.global_dir() else {
        return Ok(empty_result());
    };
    if !root.exists() {
        return Ok(empty_result());
    }

    let mut conflicts: Vec<DiagnosisConflict> = Vec::new();
    let mut zombies: Vec<DiagnosisZombie> = Vec::new();
    let mut quality: Vec<DiagnosisQuality> = Vec::new();
    let mut top_skills: Vec<DiagnosisTopSkill> = Vec::new();
    let mut total_tokens: u64 = 0;
    let mut file_count: u32 = 0;
    let mut skill_count: u32 = 0;
    let mut name_to_paths: HashMap<String, Vec<String>> = HashMap::new();

    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return Ok(empty_result()),
    };

    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
        // 隐藏目录与备份目录不是技能
        if dir_name.starts_with('.') || dir_name.ends_with(".bak") {
            continue;
        }

        let skill_md = dir.join(SKILL_MD);
        let skill_md_disabled = dir.join(SKILL_MD_DISABLED);

        let content = if skill_md.exists() {
            fs::read_to_string(&skill_md).ok()
        } else if skill_md_disabled.exists() {
            fs::read_to_string(&skill_md_disabled).ok()
        } else {
            zombies.push(DiagnosisZombie {
                path: dir.to_string_lossy().to_string(),
                name: dir_name.to_string(),
                reason: "缺少 SKILL.md".to_string(),
            });
            continue;
        };

        let content = match content {
            Some(c) => c,
            None => {
                zombies.push(DiagnosisZombie {
                    path: dir.to_string_lossy().to_string(),
                    name: dir_name.to_string(),
                    reason: "无法读取 SKILL.md".to_string(),
                });
                continue;
            }
        };

        let (tokens, files) = count_dir_tokens(&dir);
        let parsed = tools::frontmatter::parse_skill(&content);

        if content.trim().is_empty() {
            zombies.push(DiagnosisZombie {
                path: dir.to_string_lossy().to_string(),
                name: dir_name.to_string(),
                reason: "SKILL.md 内容为空".to_string(),
            });
            continue;
        }
        if !parsed.has_frontmatter {
            zombies.push(DiagnosisZombie {
                path: dir.to_string_lossy().to_string(),
                name: dir_name.to_string(),
                reason: "SKILL.md 无 frontmatter".to_string(),
            });
            continue;
        }

        // 有效技能：计入 token 成本与质量评分
        skill_count += 1;
        total_tokens += tokens;
        file_count += files;
        let skill_name = parsed
            .frontmatter
            .name
            .clone()
            .unwrap_or_else(|| dir_name.to_string());
        top_skills.push(DiagnosisTopSkill {
            name: skill_name.clone(),
            tokens,
        });
        name_to_paths
            .entry(skill_name.clone())
            .or_default()
            .push(dir.to_string_lossy().to_string());
        quality.push(score_skill(&dir, &skill_name, &parsed, files));
    }

    // 同名冲突：同一技能名出现在多个路径
    for (name, paths) in name_to_paths {
        if paths.len() > 1 {
            conflicts.push(DiagnosisConflict { name, paths });
        }
    }

    // top_skills 取 token 最多的前 5 个
    top_skills.sort_by(|a, b| b.tokens.cmp(&a.tokens));
    top_skills.truncate(5);

    let avg_tokens_per_skill = if skill_count > 0 {
        total_tokens / skill_count as u64
    } else {
        0
    };

    let mut healthy = 0u32;
    let mut warnings = 0u32;
    let mut errors = 0u32;
    for q in &quality {
        if q.score >= 80 {
            healthy += 1;
        } else if q.score >= 60 {
            warnings += 1;
        } else {
            errors += 1;
        }
    }

    Ok(SkillDiagnosisResult {
        token_cost: DiagnosisTokenCost {
            total_tokens,
            skill_count,
            file_count,
            avg_tokens_per_skill,
            top_skills,
        },
        conflicts,
        zombies,
        quality,
        summary: DiagnosisSummary {
            total: skill_count,
            healthy,
            warnings,
            errors,
        },
    })
}

/// 对单个有效技能打分 0-100。
fn score_skill(
    dir: &Path,
    skill_name: &str,
    parsed: &tools::frontmatter::ParsedSkill,
    file_count: u32,
) -> DiagnosisQuality {
    let mut issues = Vec::new();
    let mut score = 100i32;
    let fm = &parsed.frontmatter;

    match &fm.description {
        None => {
            score -= 30;
            issues.push(DiagnosisQualityIssue {
                code: "no-description".to_string(),
                message: "缺少 description".to_string(),
            });
        }
        Some(d) if d.trim().chars().count() < 20 => {
            score -= 10;
            issues.push(DiagnosisQualityIssue {
                code: "short-description".to_string(),
                message: "description 过短（少于 20 字符）".to_string(),
            });
        }
        _ => {}
    }

    if !parsed.has_frontmatter {
        score -= 20;
        issues.push(DiagnosisQualityIssue {
            code: "no-frontmatter".to_string(),
            message: "缺少 frontmatter".to_string(),
        });
    }
    if fm.name.is_none() {
        score -= 15;
        issues.push(DiagnosisQualityIssue {
            code: "no-name".to_string(),
            message: "缺少 name".to_string(),
        });
    }
    if !dir.join(MANIFEST_FILE).exists() {
        score -= 10;
        issues.push(DiagnosisQualityIssue {
            code: "no-manifest".to_string(),
            message: "无 manifest".to_string(),
        });
    }
    if file_count <= 1 {
        score -= 5;
        issues.push(DiagnosisQualityIssue {
            code: "too-few-files".to_string(),
            message: "文件数过少（仅 SKILL.md 一个文件）".to_string(),
        });
    }

    DiagnosisQuality {
        name: skill_name.to_string(),
        path: dir.to_string_lossy().to_string(),
        score: score.max(0) as u32,
        issues,
    }
}

/// 递归统计目录下所有文件的 token 估算与文件数。
fn count_dir_tokens(dir: &Path) -> (u64, u32) {
    let mut tokens = 0u64;
    let mut files = 0u32;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(cur) = stack.pop() {
        let Ok(entries) = fs::read_dir(&cur) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                files += 1;
                if let Ok(content) = fs::read_to_string(&path) {
                    tokens += estimate_tokens(&content);
                }
            }
        }
    }
    (tokens, files)
}

/// 粗略 token 估算：ASCII 字符每 4 个算 1 token，非 ASCII 字符每个算 1。
fn estimate_tokens(content: &str) -> u64 {
    let ascii = content.bytes().filter(|b| b.is_ascii()).count() as u64;
    let non_ascii = content.chars().count() as u64 - ascii;
    ascii / 4 + non_ascii
}

fn empty_result() -> SkillDiagnosisResult {
    SkillDiagnosisResult {
        token_cost: DiagnosisTokenCost {
            total_tokens: 0,
            skill_count: 0,
            file_count: 0,
            avg_tokens_per_skill: 0,
            top_skills: Vec::new(),
        },
        conflicts: Vec::new(),
        zombies: Vec::new(),
        quality: Vec::new(),
        summary: DiagnosisSummary {
            total: 0,
            healthy: 0,
            warnings: 0,
            errors: 0,
        },
    }
}

fn telemetry_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_default()
        .join("trae-skill-manager")
        .join("telemetry.json")
}

/// 读取埋点配置，文件不存在时返回默认关闭。
pub fn get_telemetry_config() -> TelemetryConfig {
    if let Ok(content) = fs::read_to_string(telemetry_path()) {
        if let Ok(config) = serde_json::from_str::<TelemetryConfig>(&content) {
            return config;
        }
    }
    TelemetryConfig { enabled: false }
}

/// 写入埋点配置。
pub fn set_telemetry_config(config: TelemetryConfig) -> Result<(), String> {
    let path = telemetry_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("写入失败: {}", e))
}
