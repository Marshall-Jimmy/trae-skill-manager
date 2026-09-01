import { motion } from 'motion/react';
import {
  Play,
  Square,
  RotateCcw,
  Settings,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { McpIcon } from '../lib/iconMap';
import { ToolIcon, TOOL_DISPLAY_NAMES } from './ToolIcon';
import type { McpServer } from '../types';

interface McpServerCardProps {
  server: McpServer;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (server: McpServer) => void;
  onRemove: (id: string) => void;
  onShowDetail: (server: McpServer) => void;
  index?: number;
}

function getStatusInfo(status: McpServer['status']) {
  switch (status) {
    case 'running':
      return {
        label: '运行中',
        color: 'bg-trae-success',
        textColor: 'text-trae-success',
        bgColor: 'bg-trae-success/10',
        borderColor: 'border-trae-success/30',
      };
    case 'error':
      return {
        label: '错误',
        color: 'bg-trae-danger',
        textColor: 'text-trae-danger',
        bgColor: 'bg-trae-danger/10',
        borderColor: 'border-trae-danger/30',
      };
    default:
      return {
        label: '已停止',
        color: 'bg-trae-text-secondary',
        textColor: 'text-trae-text-secondary',
        bgColor: 'bg-trae-card/30',
        borderColor: 'border-trae-border',
      };
  }
}

export function McpServerCard({
  server,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onRemove,
  onShowDetail,
  index = 0,
}: McpServerCardProps) {
  const statusInfo = getStatusInfo(server.status);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button[data-action]') ||
      target.closest('button[data-config]') ||
      target.closest('button[data-remove]')
    ) {
      return;
    }
    onShowDetail(server);
  };

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStart(server.id);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStop(server.id);
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRestart(server.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(server);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(server.id);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`查看 ${server.name} 详情`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onShowDetail(server);
        }
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        mass: 1,
        stiffness: 200,
        damping: 24,
        delay: Math.min(index * 0.03, 0.3),
      }}
      whileHover={{ y: -1, transition: { type: 'spring', mass: 1, stiffness: 300, damping: 25 } }}
      whileTap={{ scale: 0.995, transition: { type: 'spring', mass: 1, stiffness: 500, damping: 30 } }}
      className={`bg-trae-card/40 border rounded-xl p-4 hover:bg-trae-card/60 transition-colors cursor-pointer group focus:outline-none focus:ring-2 focus:ring-trae-accent/40 shadow-hard-sm ${
        server.status === 'error'
          ? 'border-trae-danger/30 hover:border-trae-danger/50'
          : server.status === 'running'
          ? 'border-trae-success/20 hover:border-trae-success/30'
          : 'border-trae-border hover:border-trae-accent/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-trae-card/60 border border-trae-border flex items-center justify-center shrink-0">
          <McpIcon name={server.icon} className="w-5 h-5 text-trae-accent" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-trae-text font-medium text-sm truncate">{server.name}</h3>
            {/* Status indicator */}
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${statusInfo.bgColor} ${statusInfo.textColor} border ${statusInfo.borderColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.color} ${server.status === 'running' ? 'animate-pulse' : ''}`} />
              {statusInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-trae-text-secondary">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-accent/10 text-trae-accent">
                {server.configType.toUpperCase()}
              </span>
            </span>
            {server.source === 'marketplace' && (
              <span className="text-[11px] text-trae-text-secondary/70">
                来自市场
              </span>
            )}
            {server.source === 'user' && (
              <span className="text-[11px] text-trae-text-secondary/70">
                自定义
              </span>
            )}
            {server.targetTools && server.targetTools.length > 0 && (
              <span
                className="flex items-center gap-1 text-[11px] text-trae-text-secondary/70"
                title={`同步到：${server.targetTools
                  .map((id) => TOOL_DISPLAY_NAMES[id] || id)
                  .join('、')}`}
              >
                同步到
                {server.targetTools.slice(0, 3).map((id) => (
                  <ToolIcon key={id} id={id} className="w-3.5 h-3.5" />
                ))}
                {server.targetTools.length > 3 && (
                  <span className="text-trae-accent">+{server.targetTools.length - 3}</span>
                )}
              </span>
            )}
          </div>

          {server.description && (
            <p className="text-xs text-trae-text-secondary mt-2 line-clamp-2">
              {server.description}
            </p>
          )}

          {server.status === 'error' && server.errorMessage && (
            <div className="flex items-center gap-1 mt-2 text-xs text-trae-danger">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{server.errorMessage}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Primary action: start/stop */}
          {server.status === 'running' ? (
            <motion.button
              data-action
              onClick={handleStop}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all"
              title="停止"
            >
              <Square className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.button
              data-action
              onClick={handleStart}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-success hover:bg-trae-success/10 transition-all"
              title="启动"
            >
              <Play className="w-4 h-4" />
            </motion.button>
          )}

          {/* Restart */}
          <motion.button
            data-action
            onClick={handleRestart}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-accent hover:bg-trae-accent/10 transition-all"
            title="重启"
          >
            <RotateCcw className="w-4 h-4" />
          </motion.button>

          {/* Config */}
          <motion.button
            data-config
            onClick={handleEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
            title="配置"
          >
            <Settings className="w-4 h-4" />
          </motion.button>

          {/* Delete */}
          <motion.button
            data-remove
            onClick={handleRemove}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Marketplace Card (for discovery section) ─────────────────────────────

import type { McpMarketplaceServer } from '../types';
import { Star, Plus, Check } from 'lucide-react';

interface McpMarketplaceCardProps {
  server: McpMarketplaceServer;
  installed: boolean;
  onAdd: (server: McpMarketplaceServer) => void;
  index?: number;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function McpMarketplaceCard({
  server,
  installed,
  onAdd,
  index = 0,
}: McpMarketplaceCardProps) {
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!installed) {
      onAdd(server);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        mass: 1,
        stiffness: 200,
        damping: 24,
        delay: Math.min(index * 0.02, 0.2),
      }}
      whileHover={{ y: -2, transition: { type: 'spring', mass: 1, stiffness: 300, damping: 25 } }}
      className="bg-trae-card/30 border border-trae-border rounded-xl p-4 hover:bg-trae-card/50 hover:border-trae-accent/30 transition-all group shadow-hard-sm"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-trae-card/60 border border-trae-border flex items-center justify-center shrink-0">
          <McpIcon name={server.icon} className="w-5 h-5 text-trae-accent" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-trae-text font-medium text-sm truncate">{server.name}</h3>
            <span className="flex items-center gap-1 text-[11px] text-trae-text-secondary shrink-0">
              <Star className="w-3 h-3" />
              {formatStars(server.stars)}
            </span>
          </div>
          <p className="text-xs text-trae-text-secondary/70 mt-0.5">
            {server.publisher}
          </p>
          <p className="text-xs text-trae-text-secondary mt-2 line-clamp-2">
            {server.description}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-trae-border/50">
        <span className="text-[11px] text-trae-text-secondary/70 font-mono">
          {server.command}
        </span>
        <motion.button
          onClick={handleAdd}
          whileHover={{ scale: installed ? 1 : 1.05 }}
          whileTap={{ scale: installed ? 1 : 0.95 }}
          disabled={installed}
          className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            installed
              ? 'bg-trae-success/10 text-trae-success cursor-default'
              : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20'
          }`}
        >
          {installed ? (
            <>
              <Check className="w-3.5 h-3.5" />
              已添加
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              添加
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
