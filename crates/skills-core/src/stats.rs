//! 本地使用统计：基于 history.json 汇总操作记录，供「操作历史」页展示趋势图。
//!
//! 纯本地计算，不依赖网络/LLM（Phase 10 产品化）。

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 单个技能的聚合统计。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUsage {
    pub name: String,
    pub operations: u64,
    pub installs: u64,
    pub removes: u64,
    pub last_action: String,
    pub last_time: i64,
}

/// 单日趋势（按本地日期聚合）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTrend {
    pub day: String, // "MM-dd"
    pub installs: u64,
    pub removes: u64,
    pub other: u64,
}

/// 汇总统计。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub total_operations: u64,
    pub total_installs: u64,
    pub total_removes: u64,
    pub total_toggles: u64,
    /// 曾成功安装过的不同技能数
    pub active_skills: u64,
    /// 近 7 天操作数（活跃度）
    pub weekly_activity: u64,
    /// 操作次数最多的前 10 个技能
    pub top_skills: Vec<SkillUsage>,
    /// 最近 14 天趋势
    pub daily_trend: Vec<DailyTrend>,
}

fn is_install(action: &str) -> bool {
    action == "install"
}

fn is_remove(action: &str) -> bool {
    action == "remove"
}

/// 基于历史记录计算使用统计。
pub fn get_usage_stats() -> UsageStats {
    let records = crate::history::get_history().unwrap_or_default();

    let mut by_skill: BTreeMap<String, (u64, u64, u64, String, i64)> = BTreeMap::new();
    let mut trend: BTreeMap<NaiveDate, (u64, u64, u64)> = BTreeMap::new();

    let mut total_installs = 0u64;
    let mut total_removes = 0u64;
    let mut total_toggles = 0u64;
    let mut weekly_activity = 0u64;
    let now = Local::now();
    let seven_days_ago = now.date_naive() - chrono::Duration::days(7);

    for r in &records {
        let is_success = r.success;
        let action = r.action.as_str();

        if is_install(action) && is_success {
            total_installs += 1;
        } else if is_remove(action) {
            total_removes += 1;
        } else if !is_install(action) && !is_remove(action) {
            total_toggles += 1;
        }

        // 技能聚合
        let entry = by_skill
            .entry(r.skill_name.clone())
            .or_insert_with(|| (0, 0, 0, String::new(), 0));
        entry.0 += 1;
        if is_install(action) && is_success {
            entry.1 += 1;
        }
        if is_remove(action) {
            entry.2 += 1;
        }
        if r.timestamp > entry.4 {
            entry.3 = action.to_string();
            entry.4 = r.timestamp;
        }

        // 日趋势（只统计成功操作）
        if is_success {
            if let Some(dt) = chrono::DateTime::from_timestamp_millis(r.timestamp) {
                let day = dt.with_timezone(&Local).date_naive();
                let slot = trend.entry(day).or_insert((0, 0, 0));
                if is_install(action) {
                    slot.0 += 1;
                } else if is_remove(action) {
                    slot.1 += 1;
                } else {
                    slot.2 += 1;
                }
                if day >= seven_days_ago {
                    weekly_activity += 1;
                }
            }
        }
    }

    let total_operations = records.len() as u64;
    let active_skills = by_skill
        .values()
        .filter(|(_, installs, _, _, _)| *installs > 0)
        .count() as u64;

    let mut top_skills: Vec<SkillUsage> = by_skill
        .into_iter()
        .map(|(name, (ops, ins, rem, last_action, last_time))| SkillUsage {
            name,
            operations: ops,
            installs: ins,
            removes: rem,
            last_action,
            last_time,
        })
        .collect();
    top_skills.sort_by(|a, b| b.operations.cmp(&a.operations));
    top_skills.truncate(10);

    // 生成最近 14 天趋势（缺失日期补零，保证图表连续）
    let mut daily_trend = Vec::with_capacity(14);
    for offset in (0..14).rev() {
        let day = now.date_naive() - chrono::Duration::days(offset as i64);
        let (ins, rem, other) = trend.get(&day).copied().unwrap_or((0, 0, 0));
        daily_trend.push(DailyTrend {
            day: day.format("%m-%d").to_string(),
            installs: ins,
            removes: rem,
            other,
        });
    }

    UsageStats {
        total_operations,
        total_installs,
        total_removes,
        total_toggles,
        active_skills,
        weekly_activity,
        top_skills,
        daily_trend,
    }
}
