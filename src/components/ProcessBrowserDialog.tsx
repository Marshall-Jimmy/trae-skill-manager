import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw } from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import { ToolIcon } from './ToolIcon';

interface ProcessBrowserDialogProps {
  open: boolean;
  onClose: () => void;
}

// 帮助菜单「进程浏览器」的真实内容：展示检测到的运行中 AI 应用进程。
export function ProcessBrowserDialog({ open, onClose }: ProcessBrowserDialogProps) {
  const { runningTools, toolsStatus, loadRunningTools } = useSkillStore();
  const [refreshing, setRefreshing] = useState(false);

  const displayName = (id: string) => toolsStatus.find((t) => t.id === id)?.displayName || id;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRunningTools();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/40"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24 }}
              className="pointer-events-auto w-[420px] max-w-[90vw] bg-trae-sidebar border border-trae-border shadow-hard-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                <h3 className="text-trae-text font-semibold text-base">进程浏览器</h3>
                <button
                  onClick={onClose}
                  className="p-1.5 text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 min-h-[120px]">
                {runningTools.length === 0 ? (
                  <div className="text-center py-8 text-sm text-trae-text-secondary">
                    未检测到运行中的 AI 应用
                  </div>
                ) : (
                  <div className="space-y-2">
                    {runningTools.map((t) => (
                      <div
                        key={t.toolId}
                        className="flex items-center gap-3 p-3 bg-trae-card/30 border border-trae-border"
                      >
                        <ToolIcon id={t.toolId} className="w-5 h-5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-trae-text">
                              {displayName(t.toolId)}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-trae-success">
                              <span className="w-1.5 h-1.5 rounded-full bg-trae-success animate-pulse" />
                              运行中
                            </span>
                          </div>
                          <div className="text-[11px] text-trae-text-secondary/70 font-mono truncate mt-0.5">
                            PID {t.pid}
                            {t.workspaceHint ? ` · ${t.workspaceHint}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 px-5 py-4 border-t border-trae-border bg-trae-card/30">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  刷新
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
