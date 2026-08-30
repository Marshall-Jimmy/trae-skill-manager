import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SearchBar } from './SearchBar';
import { SkillCard } from './SkillCard';
import { SkillDetailPanel } from './SkillDetailPanel';
import { CustomInstallDialog } from './CustomInstallDialog';
import { useSkillStore } from '../store/skillStore';
import type { SortBy } from '../store/skillStore';
import type { RemoteSkill, SkillCategory, DiscoverTab } from '../types';
import { CATEGORIES } from '../types';
import { useMotionConfig } from '../lib/motionConfig';
import {
  Loader2,
  AlertCircle,
  Plus,
  ChevronDown,
  Download,
  X,
  Languages,
  Github,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
  TrendingUp,
  Heart,
  Grid3X3,
  List,
  Tag,
  Star,
  Code2,
  FileText,
  Database,
  Palette,
  Share2,
  Settings2,
  MoreHorizontal,
  RotateCcw,
  Check,
  Filter,
  Flame,
  Globe,
  Folder,
} from 'lucide-react';

interface DiscoverPageProps {
  showCustomInstall: boolean;
  onCustomInstallClose: () => void;
}

type SearchMode = 'official' | 'github';

const searchModes: { id: SearchMode; label: string; icon: typeof Github }[] = [
  { id: 'official', label: '官方', icon: Search },
  { id: 'github', label: 'GitHub 社区', icon: Github },
];

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'installs', label: '按安装量' },
  { value: 'stars', label: '按 Stars' },
  { value: 'name', label: '按名称' },
  { value: 'updated', label: '按更新时间' },
];

const discoverTabs: { id: DiscoverTab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'all', label: '全部', icon: Sparkles },
  { id: 'trending', label: '趋势', icon: TrendingUp },
  { id: 'popular', label: '热门', icon: Flame },
  { id: 'favorites', label: '收藏', icon: Heart },
];

// ─── Category icon map ───────────────────────────────────────────────────

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

// ─── Category Sidebar ────────────────────────────────────────────────────

function CategorySidebar({
  activeCategory,
  onCategoryChange,
  popularTags,
  selectedTags,
  onTagToggle,
  onClearTags,
}: {
  activeCategory: SkillCategory;
  onCategoryChange: (cat: SkillCategory) => void;
  popularTags: { tag: string; count: number }[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearTags: () => void;
}) {
  const { getTransition } = useMotionConfig();
  const springMedium = getTransition('medium');
  const springGentle = getTransition('gentle');

  // Count skills per category (for display)
  const { remoteSkills, getSkillCategory } = useSkillStore();
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: remoteSkills.length };
    for (const skill of remoteSkills) {
      const cat = getSkillCategory(skill);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [remoteSkills, getSkillCategory]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springGentle, delay: 0.05 }}
      className="w-[180px] shrink-0 flex flex-col h-full overflow-hidden"
    >
      {/* Categories */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-0.5">
        <div className="text-[11px] font-semibold text-trae-text-secondary/60 uppercase tracking-wider px-3 mb-2 mt-1">
          分类
        </div>
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
              onClick={() => onCategoryChange(cat.id)}
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
                onClick={onClearTags}
                className="text-[10px] text-trae-text-secondary hover:text-trae-accent transition-colors"
              >
                清除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {popularTags.slice(0, 12).map(({ tag, count }, i) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <motion.button
                  key={tag}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...springMedium, delay: 0.35 + i * 0.02 }}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onTagToggle(tag)}
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
    </motion.aside>
  );
}

// ─── Sort Dropdown ───────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: SortBy;
  onChange: (value: SortBy) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { getTransition } = useMotionConfig();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = sortOptions.find((o) => o.value === value)?.label || '排序';
  const springFast = getTransition('fast');

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-card/60 border border-trae-border text-trae-text-secondary hover:text-trae-text hover:border-trae-border-hover hover:bg-trae-card/80 transition-colors"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span>{selectedLabel}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={springFast}
        >
          <ChevronDown className="w-3 h-3" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96, pointerEvents: 'none' as const }}
            animate={{ opacity: 1, y: 0, scale: 1, pointerEvents: 'auto' as const }}
            exit={{ opacity: 0, y: -6, scale: 0.96, pointerEvents: 'none' as const }}
            transition={springFast}
            className="absolute top-full right-0 mt-1.5 min-w-[140px] bg-trae-sidebar border border-trae-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden"
          >
            {sortOptions.map((opt, i) => (
              <motion.button
                key={opt.value}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, ...springFast }}
                whileHover={{ x: 3, backgroundColor: 'rgba(255,255,255,0.03)' }}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  value === opt.value
                    ? 'text-trae-accent bg-trae-accent/10 font-medium'
                    : 'text-trae-text-secondary hover:text-trae-text'
                }`}
              >
                {opt.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Advanced Filter Panel ───────────────────────────────────────────────

function FilterPanel({
  isOpen,
  onClose,
  sourceOptions,
  sourceFilters,
  onToggleSource,
  qualityFilter,
  onQualityChange,
  onReset,
}: {
  isOpen: boolean;
  onClose: () => void;
  sourceOptions: { value: string; label: string }[];
  sourceFilters: string[];
  onToggleSource: (source: string) => void;
  qualityFilter: 'all' | 'with-stars';
  onQualityChange: (filter: 'all' | 'with-stars') => void;
  onReset: () => void;
}) {
  const { getTransition } = useMotionConfig();
  const springFast = getTransition('fast');
  const springMedium = getTransition('medium');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -8 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -8 }}
          transition={springMedium}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, ...springFast }}
            className="bg-trae-card/30 border border-trae-border rounded-xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-medium text-trae-text">
                <Filter className="w-4 h-4 text-trae-accent" />
                高级筛选
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onReset}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  重置
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-1 rounded-md text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source filter (multi-select) */}
              <div>
                <div className="text-xs font-medium text-trae-text-secondary mb-2 flex items-center gap-1.5">
                  <Github className="w-3 h-3" />
                  按来源筛选
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sourceOptions.length === 0 ? (
                    <span className="text-[11px] text-trae-text-secondary/60">暂无数据</span>
                  ) : (
                    sourceOptions.map((opt) => {
                      const isChecked = sourceFilters.includes(opt.value);
                      return (
                        <motion.button
                          key={opt.value}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => onToggleSource(opt.value)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all ${
                            isChecked
                              ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/30'
                              : 'bg-trae-card/50 text-trae-text-secondary border border-trae-border/50 hover:text-trae-text hover:border-trae-border'
                          }`}
                        >
                          <span className={`w-3 h-3 rounded border flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-trae-accent border-trae-accent'
                              : 'border-trae-border/50'
                          }`}>
                            {isChecked && <Check className="w-2.5 h-2.5 text-trae-bg" />}
                          </span>
                          {opt.label}
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quality filter */}
              <div>
                <div className="text-xs font-medium text-trae-text-secondary mb-2 flex items-center gap-1.5">
                  <Star className="w-3 h-3" />
                  数据质量
                </div>
                <div className="flex gap-1.5">
                  {[
                    { value: 'all', label: '全部' },
                    { value: 'with-stars', label: '有 Stars 数据' },
                  ].map((opt) => {
                    const isActive = qualityFilter === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onQualityChange(opt.value as 'all' | 'with-stars')}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                          isActive
                            ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/30'
                            : 'bg-trae-card/50 text-trae-text-secondary border border-trae-border/50 hover:text-trae-text hover:border-trae-border'
                        }`}
                      >
                        {opt.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Install Target Selector ──────────────────────────────────────────────

function InstallTargetSelector({
  target,
  onChange,
  projectName,
}: {
  target: 'global' | 'project';
  onChange: (target: 'global' | 'project') => void;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { getTransition } = useMotionConfig();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const springFast = getTransition('fast');

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-trae-card/60 border border-trae-border text-trae-text-secondary hover:text-trae-text hover:border-trae-border-hover hover:bg-trae-card/80 transition-colors"
      >
        {target === 'global' ? (
          <Globe className="w-3.5 h-3.5 text-trae-accent" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-trae-accent" />
        )}
        <span className="max-w-[120px] truncate">
          {target === 'global' ? '安装到全局' : `安装到 ${projectName}`}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={springFast}
        >
          <ChevronDown className="w-3 h-3" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={springFast}
            className="absolute top-full right-0 mt-1.5 min-w-[180px] bg-trae-sidebar border border-trae-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden"
          >
            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => { onChange('global'); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                target === 'global'
                  ? 'text-trae-accent bg-trae-accent/10 font-medium'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">安装到全局</span>
              {target === 'global' && <Check className="w-3.5 h-3.5" />}
            </motion.button>
            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => { onChange('project'); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                target === 'project'
                  ? 'text-trae-accent bg-trae-accent/10 font-medium'
                  : 'text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40'
              }`}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left truncate">
                安装到 {projectName}
              </span>
              {target === 'project' && <Check className="w-3.5 h-3.5" />}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function DiscoverPage({
  showCustomInstall,
  onCustomInstallClose,
}: DiscoverPageProps) {
  const {
    remoteSkills,
    remoteLoading,
    remoteError,
    activeView,
    selectedSkills,
    selectedRemoteSkill,
    hasMore,
    sortBy,
    batchProgress,
    config,
    translations,
    translating,
    githubSearchResults,
    githubSearchLoading,
    githubSearchError,
    favorites,
    activeCategory,
    selectedTags,
    sourceFilters,
    qualityFilter,
    viewMode,
    discoverTab,
    loadRemoteSkills,
    searchSkills,
    loadConfig,
    loadMore,
    toggleSelectSkill,
    clearSelection,
    setSortBy,
    clearFilters,
    loadLocalSkills,
    batchInstall,
    translateSkills,
    searchGithubSkills,
    clearGithubSearch,
    setSelectedRemoteSkill,
    getHotSearches,
    addSearchHistory,
    setCategory,
    toggleTag,
    clearTags,
    getPopularTags,
    toggleSourceFilter,
    setSourceFilters,
    setQualityFilter,
    setViewMode,
    setDiscoverTab,
    getEnhancedFilteredSkills,
    // Project-related
    currentProjectId,
    getCurrentProject,
    installSkillStreamedToTarget,
    loadProjectSkills,
  } = useSkillStore();

  const { getTransition } = useMotionConfig();

  const searchRef = useRef<HTMLInputElement>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installTarget, setInstallTarget] = useState<'global' | 'project'>('global');
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('official');
  const [githubQuery, setGithubQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Dynamically compute available source options from loaded skills
  const sourceOptions = useMemo(() => {
    const owners = new Set<string>();
    for (const skill of remoteSkills) {
      const owner = skill.source.split('/')[0];
      if (owner) owners.add(owner);
    }
    return Array.from(owners).sort().map((owner) => ({
      value: owner,
      label: owner,
    }));
  }, [remoteSkills]);

  // Popular tags
  const popularTags = useMemo(() => {
    return getPopularTags(12);
  }, [getPopularTags, remoteSkills.length]);

  // Dynamic spring configs
  const springMedium = getTransition('medium');
  const springGentle = getTransition('gentle');

  // Initialize
  useEffect(() => {
    loadRemoteSkills('all-time');
    loadConfig();
  }, []);

  // Auto-translate when skills load and translation is enabled
  useEffect(() => {
    if (config.translation.enabled && remoteSkills.length > 0 && searchMode === 'official') {
      translateSkills(remoteSkills);
    }
  }, [config.translation.enabled, remoteSkills.length, searchMode]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchMode === 'github') {
        setGithubQuery(query);
        if (query.trim()) {
          searchGithubSkills(query);
        } else {
          clearGithubSearch();
        }
        return;
      }
      if (query.trim()) {
        searchSkills(query);
      } else {
        loadRemoteSkills(activeView);
      }
    },
    [searchMode, activeView, searchGithubSkills, clearGithubSearch, searchSkills, loadRemoteSkills]
  );

  const handleSearchModeChange = useCallback(
    (mode: SearchMode) => {
      setSearchMode(mode);
      if (mode === 'official') {
        clearGithubSearch();
        loadRemoteSkills(activeView);
      } else {
        if (githubQuery.trim()) {
          searchGithubSkills(githubQuery);
        }
      }
    },
    [activeView, clearGithubSearch, loadRemoteSkills, searchGithubSkills, githubQuery]
  );

  const handleDiscoverTabChange = useCallback(
    (tab: DiscoverTab) => {
      setDiscoverTab(tab);
    },
    [setDiscoverTab]
  );

  const handleInstall = useCallback(
    async (skill: RemoteSkill) => {
      setInstallingId(skill.id);
      try {
        const currentProject = getCurrentProject();
        const targetPath = installTarget === 'project' && currentProject
          ? currentProject.skillsPath
          : config.globalSkillsPath || '';

        await installSkillStreamedToTarget(skill.source, skill.name, targetPath);
        setToast({ type: 'success', message: `已安装 ${skill.name}` });

        // Refresh the appropriate skills list
        if (installTarget === 'project' && currentProject) {
          await loadProjectSkills(currentProject.path);
        } else {
          await loadLocalSkills();
        }
      } catch {
        setToast({ type: 'error', message: `安装 ${skill.name} 失败` });
      }
      setInstallingId(null);
      setTimeout(() => setToast(null), 3000);
    },
    [installSkillStreamedToTarget, loadLocalSkills, loadProjectSkills, installTarget, getCurrentProject, config.globalSkillsPath]
  );

  const handleBatchInstall = useCallback(async () => {
    const skillsToInstall = getEnhancedFilteredSkills()
      .filter((s) => selectedSkills.has(s.id))
      .map((s) => ({ source: s.source, skillName: s.name }));
    const result = await batchInstall(skillsToInstall);
    clearSelection();
    setToast({
      type: result.failed === 0 ? 'success' : 'error',
      message: `批量安装完成: ${result.succeeded} 成功, ${result.failed} 失败`,
    });
    setTimeout(() => setToast(null), 5000);
  }, [getEnhancedFilteredSkills, selectedSkills, batchInstall, clearSelection]);

  const handleShowDetail = useCallback((skill: RemoteSkill) => {
    setSelectedRemoteSkill(skill);
  }, [setSelectedRemoteSkill]);

  const handleCloseDetail = useCallback(() => {
    setSelectedRemoteSkill(null);
  }, [setSelectedRemoteSkill]);

  const handleResetFilters = useCallback(() => {
    setSourceFilters([]);
    setQualityFilter('all');
    clearTags();
    setCategory('all');
    clearFilters();
  }, [setSourceFilters, setQualityFilter, clearTags, setCategory, clearFilters]);

  // Filter and sort skills
  const sortedSkills = useMemo(() => {
    if (searchMode === 'github') {
      return githubSearchResults;
    }
    return getEnhancedFilteredSkills();
  }, [searchMode, githubSearchResults, getEnhancedFilteredSkills]);

  // Empty state message
  const emptyMessage = useMemo(() => {
    if (searchMode === 'github') {
      return githubQuery.trim() ? '未找到匹配的社区 Skill' : '输入关键词搜索 GitHub 社区 Skill';
    }
    if (discoverTab === 'favorites') {
      return '还没有收藏任何 Skill，点击心形图标收藏喜欢的技能';
    }
    if (activeCategory !== 'all') {
      const cat = CATEGORIES.find((c) => c.id === activeCategory);
      return `「${cat?.label || ''}」分类暂无 Skill`;
    }
    if (selectedTags.length > 0) {
      return `没有匹配标签的 Skill，试试其他标签`;
    }
    if (remoteError) {
      return '';
    }
    return '没有找到匹配的 Skill';
  }, [searchMode, githubQuery, discoverTab, activeCategory, selectedTags, remoteError]);

  const hasActiveFilters = useMemo(() => {
    return (
      activeCategory !== 'all' ||
      selectedTags.length > 0 ||
      sourceFilters.length > 0 ||
      qualityFilter !== 'all'
    );
  }, [activeCategory, selectedTags, sourceFilters, qualityFilter]);

  return (
    <div className="h-full flex p-6 gap-6">
      {/* Left Sidebar - only in official mode */}
      {searchMode === 'official' && (
        <CategorySidebar
          activeCategory={activeCategory}
          onCategoryChange={setCategory}
          popularTags={popularTags}
          selectedTags={selectedTags}
          onTagToggle={toggleTag}
          onClearTags={clearTags}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springGentle }}
          className="flex items-start justify-between mb-6"
        >
          <div>
            <motion.h1
              className="text-2xl font-semibold text-trae-text mb-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springMedium, delay: 0.05 }}
            >
              发现 Skill
            </motion.h1>
            <motion.p
              className="text-sm text-trae-text-secondary"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springMedium, delay: 0.1 }}
            >
              搜索、浏览并一键安装 Agent Skill 到 TRAE
            </motion.p>
          </div>
          <div className="flex items-center gap-2">
            {/* Install target selector (only when a project is selected) */}
            {currentProjectId && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...springMedium, delay: 0.1 }}
                className="relative"
              >
                <InstallTargetSelector
                  target={installTarget}
                  onChange={setInstallTarget}
                  projectName={getCurrentProject()?.name || ''}
                />
              </motion.div>
            )}
            <motion.button
              onClick={() => {
                const event = new CustomEvent('open-custom-install');
                window.dispatchEvent(event);
              }}
              whileHover={{ scale: 1.06, y: -1 }}
              whileTap={{ scale: 0.94 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springMedium, delay: 0.12 }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 transition-all border border-trae-accent/20"
            >
              <Plus className="w-3.5 h-3.5" />
              自定义安装
            </motion.button>
          </div>
        </motion.div>

        {/* Search mode toggle */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springGentle, delay: 0.06 }}
          className="flex gap-2 mb-3"
        >
          {searchModes.map((mode, i) => {
            const Icon = mode.icon;
            return (
              <motion.button
                key={mode.id}
                onClick={() => handleSearchModeChange(mode.id)}
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springMedium, delay: 0.08 + i * 0.04 }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  searchMode === mode.id
                    ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/25 shadow-sm shadow-trae-accent/5'
                    : 'bg-trae-card/40 text-trae-text-secondary border border-trae-border hover:bg-trae-card/60 hover:text-trae-text'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {mode.label}
              </motion.button>
            );
          })}
          {config.translation.enabled && (
            <motion.div
              className="flex items-center gap-1.5 text-xs text-trae-accent ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Languages className="w-3.5 h-3.5" />
              {translating ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  翻译中...
                </span>
              ) : translations.size > 0 ? (
                `已翻译 ${translations.size} 条`
              ) : (
                '翻译就绪'
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springGentle, delay: 0.08 }}
          className="mb-4"
        >
          <SearchBar
            ref={searchRef}
            onSearch={handleSearch}
            placeholder={searchMode === 'github' ? '搜索 GitHub 社区 Skill...' : '搜索 Skill...'}
          />
        </motion.div>

        {/* Filter tabs + Sort + View toggle */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springGentle, delay: 0.1 }}
          className="flex items-center justify-between mb-3"
        >
          <div className="flex gap-2">
            {searchMode === 'official' &&
              discoverTabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = discoverTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => handleDiscoverTabChange(tab.id)}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springMedium, delay: 0.12 + i * 0.03 }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/25 shadow-sm shadow-trae-accent/5'
                        : 'bg-trae-card/40 text-trae-text-secondary border border-trae-border hover:bg-trae-card/60 hover:text-trae-text'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.id === 'favorites' && favorites.length > 0 && (
                      <span className="ml-0.5 text-[10px] bg-trae-accent/20 px-1.5 rounded-full">
                        {favorites.length}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            {searchMode === 'github' && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springMedium, delay: 0.12 }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-trae-card/40 text-trae-text-secondary border border-trae-border flex items-center gap-1.5"
              >
                <Github className="w-3.5 h-3.5" />
                GitHub 社区搜索结果
              </motion.span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle (only in official mode) */}
            {searchMode === 'official' && (
              <div className="flex items-center bg-trae-card/40 border border-trae-border rounded-lg p-0.5">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-trae-accent/20 text-trae-accent'
                      : 'text-trae-text-secondary hover:text-trae-text'
                  }`}
                  title="网格视图"
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-trae-accent/20 text-trae-accent'
                      : 'text-trae-text-secondary hover:text-trae-text'
                  }`}
                  title="列表视图"
                >
                  <List className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            )}

            {/* Filter button (only in official mode) */}
            {searchMode === 'official' && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filterPanelOpen || hasActiveFilters
                    ? 'bg-trae-accent/10 text-trae-accent border-trae-accent/25'
                    : 'bg-trae-card/60 text-trae-text-secondary border-trae-border hover:text-trae-text hover:border-trae-border-hover hover:bg-trae-card/80'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>筛选</span>
                {hasActiveFilters && (
                  <span className="w-4 h-4 rounded-full bg-trae-accent/20 text-trae-accent text-[10px] flex items-center justify-center font-medium">
                    {selectedTags.length + sourceFilters.length + (qualityFilter !== 'all' ? 1 : 0) + (activeCategory !== 'all' ? 1 : 0)}
                  </span>
                )}
              </motion.button>
            )}

            {/* Sort dropdown */}
            <SortDropdown value={sortBy} onChange={setSortBy} />

            {/* Clear filters */}
            <AnimatePresence>
              {hasActiveFilters && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.15, rotate: 90 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-danger transition-colors"
                  title="清除所有筛选"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Advanced Filter Panel */}
        {searchMode === 'official' && (
          <FilterPanel
            isOpen={filterPanelOpen}
            onClose={() => setFilterPanelOpen(false)}
            sourceOptions={sourceOptions}
            sourceFilters={sourceFilters}
            onToggleSource={toggleSourceFilter}
            qualityFilter={qualityFilter}
            onQualityChange={setQualityFilter}
            onReset={handleResetFilters}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {/* Results count */}
          <AnimatePresence>
            {!githubSearchLoading && !remoteLoading && sortedSkills.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={springMedium}
                className="text-xs text-trae-text-secondary mb-2 flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-trae-accent/60" />
                共 {sortedSkills.length} 个结果
                {searchMode === 'github' && ' · 来自 GitHub 社区'}
                {discoverTab === 'favorites' && ' · 收藏'}
              </motion.div>
            )}
          </AnimatePresence>

          {searchMode === 'github' && githubSearchLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-40 gap-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-7 h-7 text-trae-accent" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xs text-trae-text-secondary"
              >
                搜索 GitHub 社区...
              </motion.p>
            </motion.div>
          ) : searchMode === 'github' && githubSearchError ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springMedium}
              className="flex flex-col items-center justify-center h-40 text-trae-text-secondary"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' as const, stiffness: 200, damping: 15, delay: 0.1 }}
              >
                <AlertCircle className="w-9 h-9 text-trae-danger mb-3" />
              </motion.div>
              <p className="text-sm">{githubSearchError}</p>
              {githubSearchError.includes('速率限制') && (
                <p className="text-xs mt-1 opacity-70">
                  GitHub API 每小时限制 60 次未认证请求
                </p>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => searchGithubSkills(githubQuery)}
                className="mt-3 text-xs text-trae-accent px-3 py-1.5 rounded-lg bg-trae-accent/10 border border-trae-accent/20 hover:bg-trae-accent/20 transition-colors"
              >
                重试
              </motion.button>
            </motion.div>
          ) : searchMode === 'github' && sortedSkills.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springMedium}
              className="flex flex-col items-center justify-center h-40 text-trae-text-secondary"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring' as const, stiffness: 200, damping: 15, delay: 0.1 }}
              >
                <Github className="w-10 h-10 opacity-30 mb-3" />
              </motion.div>
              <p className="text-sm">
                {githubQuery.trim() ? '未找到匹配的社区 Skill' : '输入关键词搜索 GitHub 社区 Skill'}
              </p>
              <p className="text-xs mt-1.5 opacity-50">
                搜索包含 SKILL.md 文件的公开仓库
              </p>
            </motion.div>
          ) : remoteLoading && remoteSkills.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-40 gap-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-7 h-7 text-trae-accent" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xs text-trae-text-secondary"
              >
                加载 Skill 列表...
              </motion.p>
            </motion.div>
          ) : remoteError ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springMedium}
              className="flex flex-col items-center justify-center h-40 text-trae-text-secondary"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' as const, stiffness: 200, damping: 15, delay: 0.1 }}
              >
                <AlertCircle className="w-9 h-9 text-trae-danger mb-3" />
              </motion.div>
              <p className="text-sm">{remoteError}</p>
              {remoteError.includes('速率限制') && (
                <p className="text-xs mt-1 opacity-70">
                  GitHub API 每小时限制 60 次未认证请求，已启用 5 分钟本地缓存
                </p>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => loadRemoteSkills(activeView)}
                className="mt-3 text-xs text-trae-accent px-3 py-1.5 rounded-lg bg-trae-accent/10 border border-trae-accent/20 hover:bg-trae-accent/20 transition-colors"
              >
                重试
              </motion.button>
            </motion.div>
          ) : sortedSkills.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springMedium}
              className="flex flex-col items-center justify-center py-16 text-trae-text-secondary"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring' as const, stiffness: 200, damping: 15, delay: 0.1 }}
              >
                {discoverTab === 'favorites' ? (
                  <Heart className="w-12 h-12 opacity-30 mb-4" />
                ) : (
                  <Search className="w-12 h-12 opacity-30 mb-4" />
                )}
              </motion.div>
              <p className="text-sm mb-1">{emptyMessage}</p>
              {searchQuery.trim() && (
                <p className="text-xs opacity-50 mb-5">
                  换个关键词试试，或查看下方推荐
                </p>
              )}
              {discoverTab === 'favorites' && (
                <p className="text-xs opacity-50 mb-5">
                  在技能卡片上点击心形图标即可收藏
                </p>
              )}
              {/* Hot search suggestions */}
              <div className="flex flex-col items-center gap-2 mt-2">
                <span className="text-[11px] text-trae-text-secondary/60 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" />
                  试试这些关键词
                </span>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {getHotSearches().map((term, i) => (
                    <motion.button
                      key={term}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.06, type: 'spring', mass: 1, stiffness: 300, damping: 25 }}
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        addSearchHistory(term);
                        handleSearch(term);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs bg-trae-card/60 border border-trae-border text-trae-text-secondary hover:text-trae-accent hover:border-trae-accent/30 hover:bg-trae-accent/5 transition-all"
                    >
                      {term}
                    </motion.button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleResetFilters}
                  className="mt-5 text-xs text-trae-accent px-3 py-1.5 rounded-lg bg-trae-accent/10 border border-trae-accent/20 hover:bg-trae-accent/20 transition-colors"
                >
                  清除筛选条件
                </motion.button>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.035 } },
              }}
              className={viewMode === 'list' ? 'space-y-1.5' : 'space-y-2.5'}
            >
              {sortedSkills.map((skill) => (
                <motion.div
                  key={skill.id}
                  variants={{
                    hidden: { opacity: 0, y: 12, scale: 0.98 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: springMedium,
                    },
                  }}
                >
                  <SkillCard
                    skill={skill}
                    onInstall={handleInstall}
                    installing={installingId === skill.id}
                    selected={selectedSkills.has(skill.id)}
                    onSelect={toggleSelectSkill}
                    onShowDetail={handleShowDetail}
                    highlightQuery={searchQuery}
                    viewMode={viewMode}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Load more */}
          {hasMore && !remoteLoading && searchMode === 'official' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...springGentle }}
              className="flex justify-center py-4"
            >
              <motion.button
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={loadMore}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-card/40 text-trae-text-secondary border border-trae-border hover:bg-trae-card/60 hover:text-trae-text transition-all"
              >
                加载更多
              </motion.button>
            </motion.div>
          )}
          {remoteLoading && remoteSkills.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center py-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-5 h-5 text-trae-accent" />
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* Skill Detail Panel */}
        <AnimatePresence>
          {selectedRemoteSkill && (
            <SkillDetailPanel skill={selectedRemoteSkill} onClose={handleCloseDetail} onSkillClick={handleShowDetail} />
          )}
        </AnimatePresence>

        {/* Custom Install Dialog */}
        <CustomInstallDialog open={showCustomInstall} onClose={onCustomInstallClose} />

        {/* Floating action bar for batch install */}
        <AnimatePresence>
          {selectedSkills.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.9 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 220, damping: 22 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-trae-sidebar/95 backdrop-blur-xl border border-trae-border rounded-xl shadow-2xl"
            >
              <span className="text-sm text-trae-text">
                已选择 {selectedSkills.size} 个 Skill
              </span>
              <motion.button
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleBatchInstall}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20"
              >
                <Download className="w-3.5 h-3.5" />
                批量安装 {selectedSkills.size} 个 Skill
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={clearSelection}
                className="text-xs text-trae-text-secondary hover:text-trae-text transition-colors px-2 py-1"
              >
                取消选择
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Batch progress overlay */}
        <AnimatePresence>
          {batchProgress.active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 16 }}
                transition={{ type: 'spring' as const, mass: 1, stiffness: 220, damping: 24 }}
                className="bg-trae-sidebar border border-trae-border rounded-2xl p-6 w-80 shadow-2xl"
              >
                <h3 className="text-sm font-medium text-trae-text mb-4">
                  {batchProgress.operation === 'install' ? '批量安装中' : '批量卸载中'}
                </h3>
                <div className="w-full bg-trae-card/50 rounded-full h-2 mb-3 overflow-hidden">
                  <motion.div
                    className="bg-trae-accent h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                    }}
                    transition={{ type: 'spring' as const, stiffness: 100, damping: 20 }}
                  />
                </div>
                <p className="text-xs text-trae-text-secondary">
                  {batchProgress.current} / {batchProgress.total} - {batchProgress.currentSkillName}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.92, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, y: 16, scale: 0.92, x: 20 }}
              transition={{ type: 'spring' as const, mass: 1, stiffness: 280, damping: 22 }}
              className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-xl z-50 border ${
                toast.type === 'success'
                  ? 'bg-trae-success/15 text-trae-success border-trae-success/25'
                  : 'bg-trae-danger/15 text-trae-danger border-trae-danger/25'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
