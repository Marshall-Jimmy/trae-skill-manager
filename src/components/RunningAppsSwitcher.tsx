import { motion } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { ToolIcon } from './ToolIcon';

// TitleBar 正中央的运行中应用状态栏：展示检测到的运行中工具 + 当前目标，
// 点击即可切换目标工具，为多 AI 应用同时打开提供优雅的切换方案。
export function RunningAppsSwitcher() {
  const { toolsStatus, runningTools, activeToolId, switchTool } = useSkillStore();

  if (toolsStatus.length === 0) return null;

  const runningIds = new Set(runningTools.map((t) => t.toolId));
  // 只展示运行中的工具 + 当前目标（未运行时置灰，保证当前目标始终可见）
  const shown = toolsStatus.filter((t) => runningIds.has(t.id) || t.id === activeToolId);

  if (shown.length === 0) return null;

  return (
    <div className="flex items-center gap-1 h-full" data-tauri-drag-region="false">
      {shown.map((tool) => {
        const isActive = tool.id === activeToolId;
        const isRunning = runningIds.has(tool.id);
        return (
          <motion.button
            key={tool.id}
            onClick={() => switchTool(tool.id)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            title={`${tool.displayName}${isRunning ? '（运行中）' : '（未运行）'}${isActive ? ' · 当前目标' : ''}`}
            className={`flex items-center gap-1.5 h-6 px-2 text-[11px] transition-colors border ${
              isActive
                ? 'bg-trae-accent/15 text-trae-accent border-trae-accent/30'
                : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 border-transparent'
            } ${!isRunning && !isActive ? 'opacity-60' : ''}`}
          >
            <ToolIcon id={tool.id} className="w-3.5 h-3.5" />
            <span className="font-medium">{tool.displayName}</span>
            {isRunning && (
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-trae-success opacity-60 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-trae-success" />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
