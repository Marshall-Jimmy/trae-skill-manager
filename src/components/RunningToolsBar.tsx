import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { Bot, Sparkles, MousePointer2, Terminal, X, ArrowRight } from 'lucide-react';
import type { RunningTool } from '../types';

const toolIconMap: Record<string, React.ElementType> = {
  trae: Bot,
  'claude-code': Sparkles,
  cursor: MousePointer2,
  codex: Terminal,
};

function ToolIcon({ id, className }: { id: string; className?: string }) {
  const Icon = toolIconMap[id] || Bot;
  return <Icon className={className} />;
}

function shortPath(p: string): string {
  // 只保留最后两段，避免工作区路径过长撑爆状态条
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

export function RunningToolsBar() {
  const { runningTools, toolsStatus, activeToolId, switchTool } = useSkillStore();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (runningTools.length === 0) return null;

  const displayName = (id: string) =>
    toolsStatus.find((t) => t.id === id)?.displayName || id;

  // 运行中但当前目标不是它的工具（用于非模态提示条）
  const otherRunning = runningTools.filter((t) => t.toolId !== activeToolId);
  const promptTool = otherRunning.find((t) => t.toolId !== dismissed);

  const renderTool = (t: RunningTool) => (
    <span key={t.toolId} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-trae-success/10 text-trae-success text-[11px]">
      <ToolIcon id={t.toolId} className="w-3 h-3" />
      <span className="font-medium">{displayName(t.toolId)}</span>
      {t.workspaceHint && (
        <span className="text-trae-success/70 font-mono max-w-[180px] truncate">
          {shortPath(t.workspaceHint)}
        </span>
      )}
    </span>
  );

  return (
    <>
      {/* 非模态提示条：检测到新工具运行且当前目标不是它 */}
      <AnimatePresence>
        {promptTool && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', mass: 1, stiffness: 260, damping: 26 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 px-6 py-2 bg-trae-accent/10 border-b border-trae-accent/20">
              <span className="flex items-center gap-1.5 text-xs text-trae-accent">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-trae-accent opacity-60 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-trae-accent" />
                </span>
                检测到 {displayName(promptTool.toolId)} 正在运行
                {promptTool.workspaceHint && (
                  <span className="text-trae-accent/70 font-mono">
                    {shortPath(promptTool.workspaceHint)}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => switchTool(promptTool.toolId)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-trae-accent text-[#0a0a0f] hover:bg-trae-accent/90 transition-colors"
              >
                切换目标
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setDismissed(promptTool.toolId)}
                aria-label="忽略"
                className="ml-auto p-1 rounded-md text-trae-accent/70 hover:text-trae-accent hover:bg-trae-accent/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶部状态条：展示所有运行中的工具 */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', mass: 1, stiffness: 220, damping: 24 }}
        className="flex items-center gap-2 px-6 py-1.5 border-b border-trae-border bg-trae-bg/70 backdrop-blur-sm shrink-0"
      >
        <span className="text-[10px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider shrink-0">
          运行中
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {runningTools.map(renderTool)}
        </div>
      </motion.div>
    </>
  );
}
