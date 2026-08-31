import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { useMotionConfig } from '../lib/motionConfig';
import { Bot, Sparkles, MousePointer2, Terminal, ChevronDown, AlertTriangle } from 'lucide-react';
import type { ToolStatus } from '../types';

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

function StatusBadge({ tool }: { tool: ToolStatus }) {
  if (tool.running) {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-success/15 text-trae-success">
        <span className="w-1.5 h-1.5 rounded-full bg-trae-success animate-pulse" />
        运行中
      </span>
    );
  }
  if (tool.installed) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-accent/15 text-trae-accent">
        已安装
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-card/60 text-trae-text-secondary/60">
      未安装
    </span>
  );
}

export function ToolSelector() {
  const { toolsStatus, activeToolId, switchTool, getActiveTool } = useSkillStore();
  const { getTransition } = useMotionConfig();
  const [open_, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const springFast = getTransition('fast');

  const activeTool = getActiveTool();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (toolsStatus.length === 0) return null;

  const handleSwitch = (tool: ToolStatus) => {
    if (tool.id === activeToolId) {
      setOpen(false);
      return;
    }
    switchTool(tool.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen(!open_)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-trae-card/60 border border-trae-border hover:border-trae-accent/30 hover:bg-trae-card/80 transition-all text-sm"
        title={activeTool ? `当前目标工具：${activeTool.displayName}` : '选择目标工具'}
      >
        {activeTool ? (
          <ToolIcon id={activeTool.id} className="w-4 h-4 text-trae-accent" />
        ) : (
          <Bot className="w-4 h-4 text-trae-accent" />
        )}
        <span className="text-trae-text font-medium max-w-[120px] truncate">
          {activeTool?.displayName || 'Trae'}
        </span>
        <motion.span animate={{ rotate: open_ ? 180 : 0 }} transition={springFast}>
          <ChevronDown className="w-3.5 h-3.5 text-trae-text-secondary" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open_ && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={springFast}
            className="absolute top-full left-0 mt-1.5 w-64 bg-trae-sidebar border border-trae-border rounded-xl shadow-hard z-50 py-1.5 overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider">
              目标工具
            </div>
            {toolsStatus.map((tool) => {
              const isActive = tool.id === activeToolId;
              return (
                <motion.button
                  key={tool.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleSwitch(tool)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'text-trae-accent bg-trae-accent/10 font-medium'
                      : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
                  } ${!tool.installed && !isActive ? 'opacity-60' : ''}`}
                >
                  <ToolIcon id={tool.id} className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left truncate">{tool.displayName}</span>
                  <StatusBadge tool={tool} />
                </motion.button>
              );
            })}

            <div className="mx-2 my-1 h-px bg-trae-border/60" />
            <div className="px-3 py-2 flex items-start gap-1.5 text-[10px] text-trae-text-secondary/70">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>切换后，已安装页与安装目标将跟随所选工具。未安装的工具仅显示空列表。</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
