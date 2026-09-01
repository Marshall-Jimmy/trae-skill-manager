'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Trash2, Clock, Activity, Download, Trash, ToggleLeft, Boxes, TrendingUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSkillStore } from '../store/skillStore';
import type { InstallRecord, UsageStats } from '../types';

const typeConfig: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  install: {
    label: '安装',
    color: 'text-trae-success',
    bgColor: 'bg-trae-success/10 border-trae-success/20',
  },
  remove: {
    label: '卸载',
    color: 'text-trae-danger',
    bgColor: 'bg-trae-danger/10 border-trae-danger/20',
  },
  enable: {
    label: '启用',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border-blue-400/20',
  },
  disable: {
    label: '禁用',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border-amber-400/20',
  },
  toggle: {
    label: '切换',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border-blue-400/20',
  },
};

function formatTime(ts: string | number): string {
  try {
    const ms = typeof ts === 'string' ? parseInt(ts, 10) : ts;
    const date = new Date(ms);
    if (isNaN(date.getTime())) {
      return String(ts);
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 7) return `${diffDay} 天前`;

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function getActionDisplay(action: string): string {
  const config = typeConfig[action];
  return config?.label ?? action;
}

function getActionColor(action: string): { color: string; bgColor: string } {
  const config = typeConfig[action];
  return (
    config ?? {
      color: 'text-trae-text-secondary',
      bgColor: 'bg-trae-text-secondary/10 border-trae-text-secondary/20',
    }
  );
}

function getDotColor(action: string): string {
  switch (action) {
    case 'install':
      return 'border-trae-success bg-trae-success/20';
    case 'remove':
      return 'border-trae-danger bg-trae-danger/20';
    case 'enable':
      return 'border-blue-400 bg-blue-400/20';
    case 'disable':
      return 'border-amber-400 bg-amber-400/20';
    case 'toggle':
      return 'border-blue-400 bg-blue-400/20';
    default:
      return 'border-trae-text-secondary bg-trae-text-secondary/20';
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-trae-card/30 border border-trae-border rounded-lg px-3.5 py-2.5 shadow-hard-sm">
      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${accent}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-trae-text leading-none">{value}</div>
        <div className="text-[11px] text-trae-text-secondary mt-0.5 truncate">
          {label}
          {hint ? ` · ${hint}` : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Trend Chart (pure SVG, no chart lib) ────────────────────────────────

function TrendChart({ trend }: { trend: UsageStats['dailyTrend'] }) {
  const W = 640;
  const H = 120;
  const PAD_B = 18;
  const PAD_T = 8;
  const barW = 22;
  const gap = (W - barW * trend.length) / Math.max(trend.length - 1, 1);

  const maxVal = useMemo(() => {
    const m = Math.max(1, ...trend.map((d) => d.installs + d.removes + d.other));
    // round up to a "nice" ceiling: next power-friendly step
    return m <= 5 ? 5 : Math.ceil(m / 5) * 5;
  }, [trend]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="近 14 天操作趋势"
    >
      {/* horizontal gridlines */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={W}
          y1={PAD_T + (H - PAD_T - PAD_B) * (1 - f)}
          y2={PAD_T + (H - PAD_T - PAD_B) * (1 - f)}
          stroke="var(--trae-border, #2a2f3a)"
          strokeWidth={0.5}
          strokeDasharray="3 3"
        />
      ))}

      {trend.map((d, i) => {
        const x = i * (barW + gap);
        const scaleH = (v: number) => (v / maxVal) * (H - PAD_T - PAD_B);
        const hOther = scaleH(d.other);
        const hRem = scaleH(d.removes);
        const hIns = scaleH(d.installs);
        const yBottom = H - PAD_B;
        const yOther = yBottom - hOther;
        const yRem = yOther - hRem;
        const yIns = yRem - hIns;

        return (
          <g key={d.day}>
            <rect
              x={x}
              y={yIns}
              width={barW}
              height={Math.max(hIns, 0)}
              rx={2}
              fill="#34d399"
              opacity={0.85}
            />
            <rect
              x={x}
              y={yRem}
              width={barW}
              height={Math.max(hRem, 0)}
              rx={2}
              fill="#f87171"
              opacity={0.85}
            />
            <rect
              x={x}
              y={yOther}
              width={barW}
              height={Math.max(hOther, 0)}
              rx={2}
              fill="#60a5fa"
              opacity={0.6}
            />
            {i % 2 === 0 || i === trend.length - 1 ? (
              <text
                x={x + barW / 2}
                y={H - 5}
                textAnchor="middle"
                fontSize={9}
                fill="var(--trae-text-secondary, #8b93a7)"
              >
                {d.day}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Stats Section ───────────────────────────────────────────────────────

function StatsSection() {
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<UsageStats>('get_usage_stats')
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!stats || stats.totalOperations === 0) {
    return null;
  }

  const maxOps = Math.max(1, ...stats.topSkills.map((s) => s.operations));

  return (
    <div className="mb-6 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard
          icon={Activity}
          label="总操作"
          value={stats.totalOperations}
          hint={`近 7 天 ${stats.weeklyActivity}`}
          accent="bg-blue-400/10 text-blue-400"
        />
        <StatCard
          icon={Download}
          label="安装"
          value={stats.totalInstalls}
          accent="bg-trae-success/10 text-trae-success"
        />
        <StatCard
          icon={Trash}
          label="卸载"
          value={stats.totalRemoves}
          accent="bg-trae-danger/10 text-trae-danger"
        />
        <StatCard
          icon={ToggleLeft}
          label="启用/禁用"
          value={stats.totalToggles}
          accent="bg-amber-400/10 text-amber-400"
        />
        <StatCard
          icon={Boxes}
          label="活跃技能"
          value={stats.activeSkills}
          accent="bg-purple-400/10 text-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* Trend chart */}
        <div className="xl:col-span-2 bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-trae-text flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-trae-text-secondary" aria-hidden="true" />
              近 14 天操作趋势
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-trae-text-secondary">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-trae-success inline-block" />
                安装
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-trae-danger inline-block" />
                卸载
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />
                其他
              </span>
            </div>
          </div>
          <TrendChart trend={stats.dailyTrend} />
        </div>

        {/* Top skills */}
        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
          <h3 className="text-sm font-medium text-trae-text mb-3">操作最多的技能</h3>
          <div className="space-y-2.5">
            {stats.topSkills.slice(0, 6).map((s, i) => (
              <div key={s.name} className="flex items-center gap-2.5">
                <span className="w-4 text-[11px] text-trae-text-secondary text-right shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs text-trae-text truncate min-w-0 flex-1">
                  {s.name}
                </span>
                <div className="flex-1 h-1.5 bg-trae-card rounded-full overflow-hidden max-w-[90px]">
                  <div
                    className="h-full bg-blue-400/70 rounded-full"
                    style={{ width: `${Math.max(8, (s.operations / maxOps) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-trae-text-secondary shrink-0">
                  {s.operations}
                </span>
              </div>
            ))}
            {stats.topSkills.length === 0 && (
              <p className="text-xs text-trae-text-secondary">暂无数据</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────

export function HistoryPage() {
  const { history, getHistory, clearHistory } = useSkillStore();

  useEffect(() => {
    getHistory();
  }, [getHistory]);

  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有操作记录吗？')) return;
    await clearHistory();
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-trae-text mb-1">操作历史</h1>
          <p className="text-sm text-trae-text-secondary">
            查看 Skill 安装、卸载等操作记录
          </p>
        </div>
        {history.length > 0 && (
          <motion.button
            onClick={handleClearHistory}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空历史
          </motion.button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {/* Stats (only when records exist) */}
        <StatsSection />

        {/* Timeline */}
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-trae-text-secondary">
            <Clock className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">暂无操作记录</p>
            <p className="text-xs mt-1">安装或管理 Skill 后，操作记录将显示在这里</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-trae-border" />

            {/* Entries */}
            <div className="space-y-4">
              {history.map((entry: InstallRecord, index) => {
                const actionConfig = getActionColor(entry.action);
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: Math.min(index * 0.04, 0.4) }}
                    className="relative flex gap-4 pl-0"
                  >
                    {/* Dot */}
                    <div className="relative z-10 mt-4 shrink-0">
                      <div
                        className={`w-[15px] h-[15px] rounded-full border-2 ${getDotColor(entry.action)}`}
                      />
                    </div>

                    {/* Card */}
                    <motion.div
                      whileHover={{ scale: 1.005, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }}
                      className="flex-1 bg-trae-card/30 border border-trae-border rounded-lg p-4 hover:border-trae-border-hover transition-colors min-w-0 shadow-hard-sm"
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border ${actionConfig.bgColor} ${actionConfig.color}`}
                        >
                          {getActionDisplay(entry.action)}
                        </span>
                        <span className="text-sm text-trae-text font-medium truncate">
                          {entry.skill_name}
                        </span>
                        <span className="text-[11px] text-trae-text-secondary ml-auto shrink-0">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                      <p
                        className={`text-xs ${
                          entry.success
                            ? 'text-trae-text-secondary'
                            : 'text-trae-danger'
                        }`}
                      >
                        {entry.message}
                      </p>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
