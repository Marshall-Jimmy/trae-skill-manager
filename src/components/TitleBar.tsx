import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
        unlisten = await appWindow.onResized(() => {
          appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        });
      } catch {
        // running in a plain browser (vite dev without tauri) — controls are inert
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [appWindow]);

  const handleMinimize = () => appWindow.minimize().catch(() => {});
  const handleMaximize = () => appWindow.toggleMaximize().catch(() => {});
  const handleClose = () => appWindow.close().catch(() => {});

  return (
    <div
      data-tauri-drag-region="deep"
      className="h-9 shrink-0 flex items-center justify-between bg-trae-sidebar border-b border-trae-border select-none"
    >
      <div className="flex items-center gap-2 px-3 h-full min-w-0">
        <div className="w-5 h-5 border border-trae-accent flex items-center justify-center bg-trae-bg shrink-0">
          <span className="text-trae-accent font-bold text-[10px]">TS</span>
        </div>
        <span className="text-xs text-trae-text-secondary truncate">TRAE Skill Manager</span>
      </div>
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          aria-label="最小化"
          title="最小化"
          className="w-11 h-full flex items-center justify-center text-trae-text-secondary hover:bg-trae-card/60 hover:text-trae-text transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleMaximize}
          aria-label={isMaximized ? '还原' : '最大化'}
          title={isMaximized ? '还原' : '最大化'}
          className="w-11 h-full flex items-center justify-center text-trae-text-secondary hover:bg-trae-card/60 hover:text-trae-text transition-colors"
        >
          {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleClose}
          aria-label="关闭"
          title="关闭"
          className="w-11 h-full flex items-center justify-center text-trae-text-secondary hover:bg-trae-danger hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
