import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar, type TabId } from './components/Sidebar';
import { DiscoverPage } from './components/DiscoverPage';
import { InstalledPage } from './components/InstalledPage';
import { McpPage } from './components/McpPage';
import { HistoryPage } from './components/HistoryPage';
import { SettingsPage } from './components/SettingsPage';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { useSkillStore } from './store/skillStore';
import { useMcpStore } from './store/mcpStore';
import { windowEntry } from './lib/animations';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('discover');
  const [showCustomInstall, setShowCustomInstall] = useState(false);

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

  const applyTheme = (theme: string) => {
    // Always clean up an existing system theme listener first.
    const oldHandler = (window as any).__themeHandler;
    if (oldHandler) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', oldHandler);
      (window as any).__themeHandler = undefined;
    }

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent | MediaQueryList) => {
        if (e.matches) {
          document.body.classList.remove('theme-light');
        } else {
          document.body.classList.add('theme-light');
        }
      };
      handler(prefersDark);
      prefersDark.addEventListener('change', handler);
      (window as any).__themeHandler = handler;
    } else if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  };

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

      // Ctrl+1/2/3/4/5: Switch tabs
      if (e.ctrlKey || e.metaKey) {
        const tabMap: Record<string, TabId> = {
          '1': 'discover',
          '2': 'installed',
          '3': 'mcp',
          '4': 'history',
          '5': 'settings',
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

  return (
    <motion.div {...windowEntry} className="h-screen w-screen flex overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCustomInstall={handleCustomInstall}
      />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {/* Top bar with project switcher */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24, delay: 0.1 }}
          className="flex items-center justify-between px-6 py-3 border-b border-trae-border bg-trae-bg/80 backdrop-blur-sm shrink-0 z-10"
        >
          <ProjectSwitcher />
          <div className="flex items-center gap-2">
            {/* Additional top bar items can go here */}
          </div>
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
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 25 }}
              className="h-full"
            >
              <DiscoverPage
                showCustomInstall={showCustomInstall}
                onCustomInstallClose={handleCloseCustomInstall}
              />
            </motion.div>
          )}
          {activeTab === 'installed' && (
            <motion.div
              key="installed"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 25 }}
              className="h-full"
            >
              <InstalledPage />
            </motion.div>
          )}
          {activeTab === 'mcp' && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 25 }}
              className="h-full"
            >
              <McpPage />
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 25 }}
              className="h-full"
            >
              <HistoryPage />
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 25 }}
              className="h-full"
            >
              <SettingsPage />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
    </motion.div>
  );
}

export default App;
