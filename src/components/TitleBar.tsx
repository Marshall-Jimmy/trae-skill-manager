import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { message } from '@tauri-apps/plugin-dialog';
import {
  Minus,
  Square,
  Copy,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  BookOpen,
  Terminal,
  Bug,
  Cpu,
  Book,
  Mail,
  FolderOpen,
  RefreshCw,
  Info,
} from 'lucide-react';
import { HelpMenu, type HelpMenuItem } from './HelpMenu';

interface TitleBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onShowAbout: () => void;
}

const GITHUB_REPO = 'https://github.com/Marshall-Jimmy/trae-skill-manager';

export function TitleBar({ sidebarCollapsed, onToggleSidebar, onShowAbout }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  // In a plain browser (vite dev without tauri) the window API is unavailable.
  const appWindow = '__TAURI_INTERNALS__' in window ? getCurrentWindow() : null;

  useEffect(() => {
    if (!appWindow) return;
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

  // Alt+H toggles the help menu
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleMinimize = () => appWindow?.minimize().catch(() => {});
  const handleMaximize = () => appWindow?.toggleMaximize().catch(() => {});
  const handleClose = () => appWindow?.close().catch(() => {});

  const handleOpenLogs = async () => {
    try {
      const dir = await invoke<string>('get_app_data_dir');
      await invoke('open_folder', { path: dir });
    } catch {
      // ignore
    }
  };

  const helpItems: HelpMenuItem[] = [
    {
      id: 'changelog',
      label: '显示更新日志',
      icon: BookOpen,
      onClick: () => openUrl(`${GITHUB_REPO}/releases`),
    },
    {
      id: 'devtools',
      label: '切换开发人员工具',
      icon: Terminal,
      shortcut: 'Ctrl+Shift+I',
      onClick: () => invoke('toggle_devtools').catch(() => {}),
    },
    {
      id: 'report',
      label: '报告问题',
      icon: Bug,
      shortcut: 'Ctrl+K Ctrl+R',
      onClick: () => openUrl(`${GITHUB_REPO}/issues`),
    },
    {
      id: 'process',
      label: '进程浏览器',
      icon: Cpu,
      onClick: () => message('进程浏览器功能开发中'),
    },
    { id: 'sep-1', label: '', icon: Book, separator: true, onClick: () => {} },
    {
      id: 'docs',
      label: '帮助文档',
      icon: Book,
      onClick: () => openUrl(GITHUB_REPO),
    },
    {
      id: 'contact',
      label: '联系我们',
      icon: Mail,
      onClick: () => openUrl(`${GITHUB_REPO}/issues`),
    },
    {
      id: 'logs',
      label: '在文件夹中打开日志',
      icon: FolderOpen,
      onClick: handleOpenLogs,
    },
    { id: 'sep-2', label: '', icon: Book, separator: true, onClick: () => {} },
    {
      id: 'update',
      label: '检查更新...',
      icon: RefreshCw,
      onClick: () => openUrl(`${GITHUB_REPO}/releases`),
    },
    {
      id: 'about',
      label: '关于...',
      icon: Info,
      onClick: onShowAbout,
    },
  ];

  return (
    <div
      data-tauri-drag-region="deep"
      className="h-9 shrink-0 flex items-center bg-trae-sidebar select-none"
    >
      {/* Left group: sidebar toggle | separator | help */}
      <div className="flex items-center h-full">
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? '展开边栏' : '收缩边栏'}
          title={sidebarCollapsed ? '展开边栏' : '收缩边栏'}
          className="w-11 h-full flex items-center justify-center text-trae-text-secondary hover:bg-trae-card/60 hover:text-trae-text transition-colors"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
        <div className="h-4 w-px bg-gray-600 mx-1" />
        <div className="relative h-full">
          <button
            ref={helpButtonRef}
            onClick={() => setHelpOpen((v) => !v)}
            aria-label="帮助"
            title="帮助"
            className={`h-full px-3 flex items-center gap-1.5 text-xs transition-colors ${
              helpOpen
                ? 'text-trae-accent bg-trae-card/60'
                : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            帮助 (H)
          </button>
          <HelpMenu
            open={helpOpen}
            items={helpItems}
            onClose={() => setHelpOpen(false)}
            anchorRef={helpButtonRef}
          />
        </div>
      </div>
      {/* Spacer pushes window controls to the far right */}
      <div className="flex-1" />
      {/* Right group: window controls */}
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
