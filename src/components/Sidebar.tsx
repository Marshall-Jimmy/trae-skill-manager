import { motion } from 'motion/react';
import { Compass, Package, Settings, History, Plus, Server } from 'lucide-react';

export type TabId = 'discover' | 'installed' | 'mcp' | 'history' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onCustomInstall: () => void;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'discover', label: '发现', icon: Compass },
  { id: 'installed', label: '已安装', icon: Package },
  { id: 'mcp', label: 'MCP', icon: Server },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange, onCustomInstall }: SidebarProps) {
  return (
    <aside className="w-56 h-screen bg-trae-sidebar border-r border-trae-border flex flex-col p-4">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 22 }}
        className="flex items-center gap-2 mb-8 px-2"
        aria-label="TRAE Skill Manager"
      >
        <div className="w-8 h-8 border border-trae-accent rounded-lg flex items-center justify-center">
          <span className="text-trae-accent font-bold text-xs">TS</span>
        </div>
        <span className="text-trae-text font-semibold text-sm">Skill Manager</span>
      </motion.div>

      {/* Navigation tabs */}
      <nav className="flex flex-col gap-1 flex-1" role="tablist" aria-label="主导航">
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 22, delay: index * 0.05 }}
              whileHover={{ x: 3, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }}
              whileTap={{ scale: 0.97, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 ${
                isActive
                  ? 'bg-trae-accent/10 text-trae-accent border border-trae-accent/20'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom: Custom install button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 22, delay: 0.2 }}
        className="mt-auto pt-4 border-t border-trae-border"
      >
        <motion.button
          onClick={onCustomInstall}
          whileHover={{ scale: 1.02, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }}
          whileTap={{ scale: 0.97, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } }}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-trae-text-secondary hover:text-trae-accent hover:bg-trae-accent/5 transition-colors duration-200"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>自定义安装</span>
        </motion.button>
      </motion.div>
    </aside>
  );
}
