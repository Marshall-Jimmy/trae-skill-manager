import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Sidebar, type TabId } from './components/Sidebar';
import { AppSwitcher } from './components/AppSwitcher';
import { TitleBar } from './components/TitleBar';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { AboutDialog } from './components/AboutDialog';
import { useSkillStore } from './store/skillStore';
import { useMcpStore } from './store/mcpStore';
import { useMotionConfig } from './lib/motionConfig';
import { windowEntry } from './lib/animations';
import { applyTheme, applyAccent } from './lib/theme';
import type { RemoteSkill } from './types';
import { RefreshCw, Copy, ClipboardPaste, ScanText, Settings, Info, LogOut } from 'lucide-react';

// Route-level code splitting: each page loads on first visit, shrinking the
// initial bundle so cold start reaches interactive faster.
const DiscoverPage = lazy(() => import('./components/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const InstalledPage = lazy(() => import('./components/InstalledPage').then((m) => ({ default: m.InstalledPage })));
const SyncPage = lazy(() => import('./components/SyncPage').then((m) => ({ default: m.SyncPage })));
const McpPage = lazy(() => import('./components/McpPage').then((m) => ({ default: m.McpPage })));
const HistoryPage = lazy(() => import('./components/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DiagnosisPage = lazy(() => import('./components/DiagnosisPage').then((m) => ({ default: m.DiagnosisPage })));
const GraphPage = lazy(() => import('./components/GraphPage').then((m) => ({ default: m.GraphPage })));
const PresetPage = lazy(() => import('./components/PresetPage').then((m) => ({ default: m.PresetPage })));

const SESSION_KEY = 'trae-skill-manager-session';
const VALID_TABS: TabId[] = ['discover', 'installed', 'sync', 'mcp', 'history', 'settings', 'diagnosis', 'graph', 'preset'];

function loadActiveTab(): TabId {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (VALID_TABS.includes(saved.activeTab)) return saved.activeTab;
    }
  } catch {
    // ignore
  }
  return 'discover';
}

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-trae-text-secondary">
      加载中...
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>(loadActiveTab);
  const [showCustomInstall, setShowCustomInstall] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuState, setMenuState] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const { getTransition } = useMotionConfig();
  const pageTransition = getTransition('medium');

  const closeContextMenu = useCallback(() => setMenuState(null), []);

  const buildContextMenu = useCallback(
    (): ContextMenuItem[] => [
      {
        id: 'reload',
        label: '刷新',
        icon: RefreshCw,
        onClick: () => window.location.reload(),
      },
      {
        id: 'copy',
        label: '复制',
        icon: Copy,
        onClick: () => {
          const sel = window.getSelection()?.toString();
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => {});
          } else {
            const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
            if (el && typeof el.value === 'string') {
              navigator.clipboard.writeText(el.value).catch(() => {});
            }
          }
        },
      },
      {
        id: 'paste',
        label: '粘贴',
        icon: ClipboardPaste,
        onClick: () => {
          const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
          if (!el || typeof el.value !== 'string') return;
          navigator.clipboard
            .readText()
            .then((text) => {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              el.value = el.value.slice(0, start) + text + el.value.slice(end);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            })
            .catch(() => {});
        },
      },
      {
        id: 'select-all',
        label: '全选',
        icon: ScanText,
        onClick: () => {
          const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
          if (el && typeof el.select === 'function') el.select();
          else document.execCommand('selectAll');
        },
      },
      { id: 'sep-1', label: '', separator: true, onClick: () => {} },
      {
        id: 'settings',
        label: '设置',
        icon: Settings,
        onClick: () => setActiveTab('settings'),
      },
      {
        id: 'about',
        label: '关于',
        icon: Info,
        onClick: () => setShowAbout(true),
      },
      { id: 'sep-2', label: '', separator: true, onClick: () => {} },
      {
        id: 'exit',
        label: '退出',
        icon: LogOut,
        danger: true,
        onClick: () => {
          import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => getCurrentWindow().close())
            .catch(() => {});
        },
      },
    ],
    [],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuState({ x: e.clientX, y: e.clientY, items: buildContextMenu() });
    },
    [buildContextMenu],
  );

  // Persist the active page so the app reopens on the same tab.
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ activeTab }));
    } catch {
      // ignore
    }
  }, [activeTab]);

  const handleCustomInstall = useCallback(() => {
    setShowCustomInstall(true);
  }, []);

  const handleCloseCustomInstall = useCallback(() => {
    setShowCustomInstall(false);
  }, []);

  // Apply saved theme on startup
  useEffect(() => {
    const initApp = async () => {
      await useSkillStore.getState().loadConfig();
      const config = useSkillStore.getState().config;
      applyTheme(config.theme);
      applyAccent(config.accentColor);

      // Load tool adapters status (installed / running)
      await useSkillStore.getState().loadToolsStatus();
      await useSkillStore.getState().loadRunningTools();

      // Load local skills
      await useSkillStore.getState().loadLocalSkills();

      // Load MCP servers
      useMcpStore.getState().loadServers();

      // Auto-check for updates if last check was more than 24 hours ago
      const state = useSkillStore.getState();
      const localSkills = state.localSkills;
      
      if (localSkills.length > 0) {
        // Find the oldest lastCheckedAt from local skills (from manifest)
        let oldestCheck = Infinity;
        for (const skill of localSkills) {
          if (skill.lastCheckedAt && skill.lastCheckedAt < oldestCheck) {
            oldestCheck = skill.lastCheckedAt;
          }
        }

        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const shouldCheck = oldestCheck === Infinity || oldestCheck < twentyFourHoursAgo;

        if (shouldCheck) {
          // Check updates in background, don't block UI
          useSkillStore.getState().checkUpdates().catch(console.error);
        }
      }
    };
    initApp();
  }, []);

  // Phase 4: 每 30 秒轮询运行中的工具，用户切回窗口时立即刷新一次。
  useEffect(() => {
    const refresh = () => {
      useSkillStore.getState().loadRunningTools();
      useSkillStore.getState().loadToolsStatus();
    };
    const timer = setInterval(refresh, 30_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: Focus search box
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[type="text"][placeholder*="搜索"]',
        ) as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
        }
      }

      // Ctrl+1/2/3/4/5/6/7/8/9: Switch tabs
      if (e.ctrlKey || e.metaKey) {
        const tabMap: Record<string, TabId> = {
          '1': 'discover',
          '2': 'installed',
          '3': 'sync',
          '4': 'mcp',
          '5': 'diagnosis',
          '6': 'graph',
          '7': 'preset',
          '8': 'history',
          '9': 'settings',
        };
        const targetTab = tabMap[e.key];
        if (targetTab) {
          e.preventDefault();
          setActiveTab(targetTab);
        }
      }

      // Escape: Close detail panels and dialogs
      if (e.key === 'Escape') {
        // Close skill detail panel
        const { detailSkill } = useSkillStore.getState();
        if (detailSkill) {
          useSkillStore.setState({ detailSkill: null });
        }
        // Close MCP detail panel
        const mcpState = useMcpStore.getState();
        if (mcpState.detailServer) {
          mcpState.setDetailServer(null);
        }
        // Close MCP config dialog
        if (mcpState.configDialogOpen) {
          mcpState.closeConfigDialog();
        }
        // Close custom install dialog
        if (showCustomInstall) {
          setShowCustomInstall(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCustomInstall]);

  // Listen for custom install events from child components
  useEffect(() => {
    const handleOpenCustomInstall = () => {
      setShowCustomInstall(true);
    };
    window.addEventListener('open-custom-install', handleOpenCustomInstall);
    return () => {
      window.removeEventListener('open-custom-install', handleOpenCustomInstall);
    };
  }, []);

  // stale-while-revalidate: the backend serves cached skills instantly and
  // refreshes in the background, then pushes the fresh list here. Replace the
  // arrays in place so the user's scroll position is preserved.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    listen<{ skills: RemoteSkill[] }>('skills-refreshed', (event) => {
      const { activeView, discoverTab } = useSkillStore.getState();
      useSkillStore.setState({
        remoteSkills: event.payload.skills,
        trendingSkills:
          discoverTab === 'trending' || activeView === 'trending'
            ? event.payload.skills
            : useSkillStore.getState().trendingSkills,
      });
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <motion.div
      {...windowEntry}
      className="h-screen w-screen flex flex-col overflow-hidden"
      onContextMenu={handleContextMenu}
    >
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        onShowAbout={() => setShowAbout(true)}
      />
      <div className="flex flex-1 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCustomInstall={handleCustomInstall}
        collapsed={sidebarCollapsed}
      />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {/* Top bar: 地址栏简化为应用名 */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24, delay: 0.1 }}
          className="flex items-center px-6 py-3 border-b border-trae-border bg-trae-bg/80 backdrop-blur-sm shrink-0 z-10 shadow-hard-sm"
        >
          <AppSwitcher />
        </motion.div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'discover' && (
            <motion.div
              key="discover"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <DiscoverPage
                  showCustomInstall={showCustomInstall}
                  onCustomInstallClose={handleCloseCustomInstall}
                />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'installed' && (
            <motion.div
              key="installed"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <InstalledPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'sync' && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <SyncPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'mcp' && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <McpPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'diagnosis' && (
            <motion.div
              key="diagnosis"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <DiagnosisPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'graph' && (
            <motion.div
              key="graph"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <GraphPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'preset' && (
            <motion.div
              key="preset"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <PresetPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <HistoryPage />
              </Suspense>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className="h-full"
            >
              <Suspense fallback={<PageFallback />}>
                <SettingsPage />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
      </div>

      <AnimatePresence>
        {menuState && (
          <ContextMenu
            x={menuState.x}
            y={menuState.y}
            items={menuState.items}
            onClose={closeContextMenu}
          />
        )}
      </AnimatePresence>
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </motion.div>
  );
}

export default App;
