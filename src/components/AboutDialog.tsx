import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
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
              className="pointer-events-auto w-80 max-w-[90vw] bg-trae-sidebar border border-trae-border rounded-xl shadow-hard-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                <h3 className="text-trae-text font-semibold text-base">关于</h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 border border-trae-accent flex items-center justify-center bg-trae-bg shadow-hard-sm">
                  <span className="text-trae-accent font-bold text-xl">TS</span>
                </div>
                <h4 className="text-trae-text font-semibold text-lg">TRAE Skill Manager</h4>
                <p className="text-sm text-trae-text-secondary mt-1">v1.0.0</p>
                <p className="text-xs text-trae-text-secondary/70 mt-3 leading-relaxed">
                  搜索、浏览并一键安装 Agent Skills 与 MCP Server 的桌面管理器。
                </p>
              </div>
              <div className="flex justify-end px-5 py-4 border-t border-trae-border bg-trae-card/30">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
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
