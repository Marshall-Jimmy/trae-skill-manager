import { motion } from 'motion/react';
import {
  Compass,
  Package,
  Settings,
  History,
  Plus,
  Server,
  Grid3X3,
  Code2,
  FileText,
  Database,
  Palette,
  Share2,
  Settings2,
  Sparkles,
  MoreHorizontal,
  Tag,
} from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import { CATEGORIES } from '../types';
import { useMotionConfig } from '../lib/motionConfig';

export type TabId = 'discover' | 'installed' | 'mcp' | 'history' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onCustomInstall: () => void;
  collapsed: boolean;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'discover', label: '发现', icon: Compass },
  { id: 'installed', label: '已安装', icon: Package },
  { id: 'mcp', label: 'MCP', icon: Server },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings },
];

const categoryIconMap: Record<string, React.ElementType> = {
  Grid3X3: Grid3X3,
  Code2: Code2,
  FileText: FileText,
  Database: Database,
  Palette: Palette,
  Share2: Share2,
  Settings2: Settings2,
  Sparkles: Sparkles,
  MoreHorizontal: MoreHorizontal,
};

function CategorySection() {
  const {
    remoteSkills,
    getSkillCategory,
    activeCategory,
    setCategory,
    selectedTags,
    toggleTag,
    clearTags,
    getPopularTags,
  } = useSkillStore();
  const { getTransition } = useMotionConfig();
  const springMedium = getTransition('medium');
  const springGentle = getTransition('gentle');

  const categoryCounts = (() => {
    const counts: Record<string, number> = { all: remoteSkills.length };
    for (const skill of remoteSkills) {
      const cat = getSkillCategory(skill);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  })();

  const popularTags = getPopularTags(12);

  return (
    <div className="mt-4 pt-4 border-t border-trae-border min-h-0 flex flex-col">
      {/* Categories */}
      <div className="text-[11px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider px-3 mb-2">
        分类
      </div>
      <div className="space-y-0.5 overflow-y-auto overflow-x-hidden pr-1">
        {CATEGORIES.map((cat, i) => {
          const Icon = categoryIconMap[cat.icon] || Grid3X3;
          const isActive = activeCategory === cat.id;
          const count = categoryCounts[cat.id] || 0;
          return (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springMedium, delay: 0.08 + i * 0.03 }}
              whileHover={{ x: 3, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCategory(cat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                isActive
                  ? 'bg-trae-accent/10 text-trae-accent font-medium border border-trae-accent/20'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 border border-transparent'
              }`}
              title={cat.description}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-trae-accent' : ''}`} />
              <span className="flex-1 text-left truncate">{cat.label}</span>
              {cat.id !== 'all' && count > 0 && (
                <span className={`text-[10px] shrink-0 ${isActive ? 'text-trae-accent/70' : 'text-trae-text-secondary/50'}`}>
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Hot tags */}
      {popularTags.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springGentle, delay: 0.3 }}
          className="mt-4 pt-4 border-t border-trae-border"
        >
          <div className="flex items-center justify-between px-3 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider">
              <Tag className="w-3 h-3" />
              热门标签
            </div>
            {selectedTags.length > 0 && (
              <button
                onClick={clearTags}
                className="text-[10px] text-trae-text-secondary hover:text-trae-accent transition-colors"
              >
                清除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {popularTags.map(({ tag, count }, i) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <motion.button
                  key={tag}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...springMedium, delay: 0.35 + i * 0.02 }}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                    isSelected
                      ? 'bg-trae-accent/20 text-trae-accent border border-trae-accent/30'
                      : 'bg-trae-card/50 text-trae-text-secondary border border-trae-border/50 hover:bg-trae-accent/10 hover:text-trae-accent hover:border-trae-accent/20'
                  }`}
                  title={`${count} 个技能`}
                >
                  {tag}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function Sidebar({ activeTab, onTabChange, onCustomInstall, collapsed }: SidebarProps) {
  const searchMode = useSkillStore((s) => s.searchMode);
  const showCategories = activeTab === 'discover' && searchMode === 'official';

  return (
    <aside
      className={`${
        collapsed ? 'w-14' : 'w-60'
      } h-full bg-trae-sidebar border-r border-trae-border flex flex-col overflow-x-hidden transition-[width] duration-200 ease-in-out`}
    >
      {/* Navigation tabs */}
      <nav className="flex flex-col gap-1 p-2 shrink-0" role="tablist" aria-label="主导航">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              title={collapsed ? tab.label : undefined}
              onClick={() => onTabChange(tab.id)}
              whileHover={{ x: collapsed ? 0 : 3, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } }}
              whileTap={{ scale: 0.97, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } }}
              className={`flex items-center gap-3 rounded-lg text-sm transition-colors duration-200 ${
                collapsed ? 'justify-center px-0 py-2.5 mx-auto w-9' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-trae-accent/10 text-trae-accent border border-trae-accent/20 shadow-hard-sm'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{tab.label}</span>}
            </motion.button>
          );
        })}
      </nav>

      {/* Categories (merged into the sidebar, only on discover page in official mode) */}
      {!collapsed && showCategories && (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 flex flex-col">
          <CategorySection />
        </div>
      )}

      {/* Bottom: Custom install button */}
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 22, delay: 0.2 }}
          className="mt-auto pt-4 border-t border-trae-border shrink-0 p-2"
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
      )}
    </aside>
  );
}
