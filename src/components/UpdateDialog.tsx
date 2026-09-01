import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { X, RefreshCw, Download, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import type { AppUpdateInfo } from '../types';

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UpdateDialog({ open, onClose }: UpdateDialogProps) {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const check = async () => {
    setLoading(true);
    setError(null);
    setInstalled(false);
    try {
      const result = await invoke<AppUpdateInfo>('check_app_update');
      setInfo(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setInfo(null);
      setError(null);
      setInstalled(false);
      check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await invoke('install_app_update');
      setInstalled(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 26 }}
            className="w-[440px] max-w-[90vw] bg-trae-sidebar border border-trae-border rounded-lg shadow-hard-lg"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
              <div className="flex items-center gap-2.5">
                <Rocket className="w-4 h-4 text-trae-accent" />
                <h2 className="text-sm font-semibold text-trae-text">检查更新</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="w-7 h-7 flex items-center justify-center text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-trae-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin text-trae-accent" />
                  正在检查更新...
                </div>
              )}

              {error && !loading && (
                <div className="flex items-start gap-2 text-sm text-trae-danger bg-trae-danger/10 border border-trae-danger/20 rounded-lg p-3">
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {!loading && !error && info && !info.available && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="w-10 h-10 text-trae-accent" />
                  <p className="text-sm text-trae-text">已是最新版本</p>
                  <p className="text-xs text-trae-text-secondary">
                    当前版本 v{info.currentVersion || '1.0.0'}
                  </p>
                </div>
              )}

              {!loading && !error && info?.available && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-trae-text-secondary">当前版本</span>
                    <span className="text-trae-text font-mono">v{info.currentVersion}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-trae-text-secondary">最新版本</span>
                    <span className="text-trae-accent font-mono font-semibold">v{info.version}</span>
                  </div>
                  {info.pubDate && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-trae-text-secondary">发布日期</span>
                      <span className="text-trae-text">
                        {new Date(info.pubDate).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  )}
                  {info.notes && (
                    <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-trae-text-secondary/70 uppercase tracking-wider mb-2">
                        更新日志
                      </div>
                      <pre className="text-xs text-trae-text whitespace-pre-wrap font-sans max-h-40 overflow-y-auto leading-relaxed">
                        {info.notes}
                      </pre>
                    </div>
                  )}

                  {installed ? (
                    <div className="flex items-center gap-2 text-sm text-trae-accent justify-center py-2">
                      <CheckCircle2 className="w-4 h-4" />
                      更新已安装，应用将自动重启
                    </div>
                  ) : (
                    <button
                      onClick={handleInstall}
                      disabled={installing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-trae-accent text-trae-bg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {installing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          正在下载安装...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          一键升级到 v{info.version}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {!loading && !error && !info && (
                <div className="flex items-center justify-center py-8">
                  <button
                    onClick={check}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-trae-border text-sm text-trae-text hover:border-trae-accent/40 hover:text-trae-accent transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新检查
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
