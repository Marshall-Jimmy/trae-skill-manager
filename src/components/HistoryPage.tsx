'use client';

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, Clock } from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import type { InstallRecord } from '../types';

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
      <div className="flex items-center justify-between mb-6">
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

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto pr-1">
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