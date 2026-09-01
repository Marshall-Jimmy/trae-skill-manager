import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { FileBrowser } from './FileBrowser';
import { TerminalViewer } from './TerminalViewer';
import { SkeletonList } from './SkeletonCard';
import { Checkbox } from './Checkbox';
import type { LocalSkill, FileEntry } from '../types';
import {
  FolderOpen,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  Languages,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowUpCircle,
  RotateCcw,
  X,
  Globe,
  Folder,
  Layers,
  Clock,
} from 'lucide-react';

type FilterTab = 'all' | 'enabled' | 'disabled' | 'updatable' | 'stale';
type ScopeTab = 'current' | 'global' | 'project' | 'all';

// A skill is "stale" when it was installed long ago but its update status
// hasn't been checked recently, so it may be silently out of date.
const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function isStaleSkill(skill: LocalSkill, hasUpdate: boolean): boolean {
  if (hasUpdate) return false;
  const installedAt = skill.installedAt;
  if (!installedAt) return false;
  const now = Date.now();
  if (now - installedAt < STALE_MS) return false;
  const lastChecked = skill.lastCheckedAt;
  if (!lastChecked) return true;
  return now - lastChecked > STALE_MS;
}

function formatAge(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days < 1) return '今天安装';
  if (days < STALE_DAYS) return `${days} 天前安装`;
  const months = Math.floor(days / 30);
  return `${months} 个月前安装`;
}

export function InstalledPage() {
  const {
    localSkills,
    localLoading,
    selectedSkills,
    loadConfig,
    loadLocalSkills,
    removeSkill,
    toggleSkill,
    openFolder,
    toggleSelectSkill,
    clearSelection,
    browseSkillFiles,
    config,
    getTranslatedDescription,
    checkUpdates,
    updateCheckLoading,
    getUpdatableCount,
    hasUpdate,
    updateSkillStreamed,
    batchUpdate,
    batchProgress,
    installOutput,
    rollbackSkill,
    // Project-related
    projectSkills,
    projectSkillsLoading,
    currentProjectId,
    getCurrentProject,
    loadProjectSkills,
    // Tool Adapter
    getActiveTool,
  } = useSkillStore();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [scopeTab, setScopeTab] = useState<ScopeTab>('current');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Update dialog state
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Batch update dialog state
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const [batchUpdateResults, setBatchUpdateResults] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    results: { skillName: string; success: boolean; message: string }[];
  } | null>(null);

  useEffect(() => {
    loadConfig().then(() => loadLocalSkills());
  }, [loadConfig, loadLocalSkills]);

  const currentProject = getCurrentProject();
  const isProjectMode = !!currentProjectId;
  const activeTool = getActiveTool();

  // Get the current skills list based on scope tab
  const displaySkills = useMemo(() => {
    if (scopeTab === 'global') {
      return localSkills;
    }
    if (scopeTab === 'project') {
      return projectSkills;
    }
    if (scopeTab === 'all') {
      // Merge: project skills take priority over global (by name)
      const globalMap = new Map(localSkills.map((s) => [s.name, s]));
      const merged = [...localSkills];
      for (const ps of projectSkills) {
        if (!globalMap.has(ps.name)) {
          merged.push(ps);
        }
      }
      return merged;
    }
    // 'current' - show based on current project mode
    return isProjectMode ? projectSkills : localSkills;
  }, [scopeTab, localSkills, projectSkills, isProjectMode]);

  const isLoading = useMemo(() => {
    if (scopeTab === 'global') return localLoading;
    if (scopeTab === 'project') return projectSkillsLoading;
    if (scopeTab === 'all') return localLoading || projectSkillsLoading;
    return isProjectMode ? projectSkillsLoading : localLoading;
  }, [scopeTab, localLoading, projectSkillsLoading, isProjectMode]);

  // Stats
  const stats = useMemo(() => {
    const skills = displaySkills;
    const total = skills.length;
    const enabled = skills.filter((s) => s.enabled).length;
    const disabled = total - enabled;
    const updatable = skills.filter((s) => hasUpdate(s.path)).length;
    const stale = skills.filter((s) => isStaleSkill(s, hasUpdate(s.path))).length;
    return { total, enabled, disabled, updatable, stale };
  }, [displaySkills, hasUpdate]);

  // Filtered skills
  const filteredSkills = useMemo(() => {
    const skills = displaySkills;
    if (filter === 'enabled') return skills.filter((s) => s.enabled);
    if (filter === 'disabled') return skills.filter((s) => !s.enabled);
    if (filter === 'updatable') return skills.filter((s) => hasUpdate(s.path));
    if (filter === 'stale') return skills.filter((s) => isStaleSkill(s, hasUpdate(s.path)));
    return skills;
  }, [displaySkills, filter, hasUpdate]);

  const handleToggle = async (skill: LocalSkill) => {
    try {
      await toggleSkill(skill.path);
      setToast({
        type: 'success',
        message: skill.enabled ? `已禁用 ${skill.name}` : `已启用 ${skill.name}`,
      });
    } catch (e) {
      setToast({ type: 'error', message: `切换失败: ${String(e)}` });
    }
    setTimeout(() => setToast(null), 2000);
  };

  const handleRemove = async (skill: LocalSkill) => {
    if (!confirm(`确定要卸载 ${skill.name} 吗？`)) return;
    const result = await removeSkill(skill.path);
    setToast({
      type: result ? 'success' : 'error',
      message: result ? `已卸载 ${skill.name}` : `卸载 ${skill.name} 失败`,
    });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenFolder = (path: string) => {
    openFolder(path);
  };

  const handleRefresh = async () => {
    await loadConfig();
    await loadLocalSkills();
    if (currentProject) {
      await loadProjectSkills(currentProject.path);
    }
    setToast({ type: 'success', message: '已刷新' });
    setTimeout(() => setToast(null), 2000);
  };

  const handleCheckUpdates = async () => {
    await checkUpdates();
    const count = getUpdatableCount();
    setToast({
      type: 'success',
      message: count > 0 ? `发现 ${count} 个可更新的 Skill` : '所有 Skill 已是最新版本',
    });
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdateSingle = async (skill: LocalSkill) => {
    setUpdatingSkill(skill.path);
    setUpdateError(null);
    setShowUpdateDialog(true);

    try {
      await updateSkillStreamed(skill.path);
      setToast({ type: 'success', message: `${skill.name} 更新成功` });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setUpdatingSkill(null);
    }
  };

  const handleBatchUpdate = async () => {
    const updatableSkills = localSkills.filter((s) => hasUpdate(s.path));
    if (updatableSkills.length === 0) return;

    setShowBatchUpdateDialog(true);
    setBatchUpdateResults(null);

    const paths = updatableSkills.map((s) => s.path);
    const result = await batchUpdate(paths);
    setBatchUpdateResults(result);

    setToast({
      type: result.failed === 0 ? 'success' : 'error',
      message:
        result.failed === 0
          ? `成功更新 ${result.succeeded} 个 Skill`
          : `更新完成: ${result.succeeded} 成功, ${result.failed} 失败`,
    });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRollback = async (skill: LocalSkill) => {
    if (!confirm(`确定要回滚 ${skill.name} 到上一个版本吗？`)) return;
    const result = await rollbackSkill(skill.path);
    if (result?.success) {
      setToast({ type: 'success', message: `${skill.name} 已回滚` });
    } else {
      setToast({ type: 'error', message: `回滚失败: ${result?.error || '未知错误'}` });
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleExpandSkill = async (skill: LocalSkill) => {
    if (expandedSkill === skill.path) {
      setExpandedSkill(null);
      setFileTree([]);
      return;
    }
    setExpandedSkill(skill.path);
    setLoadingFiles(true);
    try {
      const files = await browseSkillFiles(skill.path);
      setFileTree(files);
    } catch (e) {
      setFileTree([]);
      setToast({ type: 'error', message: `加载文件失败: ${String(e)}` });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleBatchRemove = async () => {
    const skillsToRemove = localSkills.filter((s) =>
      selectedSkills.has(s.path),
    );
    if (skillsToRemove.length === 0) return;
    if (!confirm(`确定要批量卸载 ${skillsToRemove.length} 个 Skill 吗？`)) return;
    let failed = 0;
    for (const skill of skillsToRemove) {
      const ok = await removeSkill(skill.path);
      if (!ok) failed += 1;
    }
    clearSelection();
    setToast({
      type: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? `已批量卸载 ${skillsToRemove.length} 个 Skill`
          : `批量卸载完成: ${skillsToRemove.length - failed} 成功, ${failed} 失败`,
    });
    setTimeout(() => setToast(null), 3000);
  };

  const filterTabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: stats.total },
    { id: 'enabled', label: '已启用', count: stats.enabled },
    { id: 'disabled', label: '已禁用', count: stats.disabled },
    { id: 'updatable', label: '可更新', count: stats.updatable },
    { id: 'stale', label: '可能过期', count: stats.stale },
  ];

  if (isLoading) {
    return (
      <div className="h-full flex flex-col p-6">
        <div className="mb-4 space-y-3">
          <div className="skeleton-block h-7 w-40" />
          <div className="flex gap-4">
            <div className="skeleton-block h-3 w-24" />
            <div className="skeleton-block h-3 w-24" />
            <div className="skeleton-block h-3 w-24" />
          </div>
        </div>
        <SkeletonList count={6} viewMode="list" />
      </div>
    );
  }

  // Scope tabs configuration
  const scopeTabs: { id: ScopeTab; label: string; icon: typeof Globe }[] = [
    { id: 'current', label: isProjectMode ? `项目：${currentProject?.name || ''}` : '全局技能', icon: isProjectMode ? Folder : Globe },
  ];
  if (isProjectMode) {
    scopeTabs.push(
      { id: 'global', label: '全局', icon: Globe },
      { id: 'project', label: '项目', icon: Folder },
      { id: 'all', label: '全部', icon: Layers },
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header with stats */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-trae-text">已安装 Skill</h1>
            {activeTool && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-trae-card/60 border border-trae-border text-[11px] text-trae-text-secondary">
                <Globe className="w-3 h-3 text-trae-accent" />
                目标：{activeTool.displayName}
                {activeTool.running && (
                  <span className="flex items-center gap-1 text-trae-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-trae-success animate-pulse" />
                    运行中
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="text-sm text-trae-text-secondary">
              总计{' '}
              <span className="text-trae-text font-medium">{stats.total}</span>{' '}
              个
            </span>
            <span className="text-sm text-trae-text-secondary">
              已启用{' '}
              <span className="text-trae-success font-medium">
                {stats.enabled}
              </span>{' '}
              个
            </span>
            <span className="text-sm text-trae-text-secondary">
              可更新{' '}
              <span className="text-trae-accent font-medium">
                {stats.updatable}
              </span>{' '}
              个
            </span>
            {stats.stale > 0 && (
              <span className="text-sm text-trae-text-secondary">
                可能过期{' '}
                <span className="text-orange-400 font-medium">
                  {stats.stale}
                </span>{' '}
                个
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleCheckUpdates}
            disabled={updateCheckLoading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateCheckLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {updateCheckLoading ? '检查中...' : '检查更新'}
          </motion.button>
          {stats.updatable > 0 && (
            <motion.button
              onClick={handleBatchUpdate}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              全部更新 ({stats.updatable})
            </motion.button>
          )}
          <motion.button
            onClick={handleRefresh}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </motion.button>
        </div>
      </div>

      {/* Scope tabs (only when in project mode) */}
      {isProjectMode && (
        <div className="flex gap-2 mb-4">
          {scopeTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setScopeTab(tab.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  scopeTab === tab.id
                    ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/20'
                    : 'bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50 hover:text-trae-text'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {filterTabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === tab.id
                ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/20'
                : 'bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50'
            }`}
          >
            {tab.label} ({tab.count})
          </motion.button>
        ))}
      </div>

      {/* Skill list */}
      {filteredSkills.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-trae-text-secondary">
          <FolderOpen className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">
            {filter === 'updatable'
              ? '没有可更新的 Skill'
              : filter === 'stale'
              ? '没有可能过期的 Skill'
              : '还没有安装任何 Skill'}
          </p>
          <p className="text-xs mt-1">
            {filter === 'updatable'
              ? '点击「检查更新」查看是否有新版本'
              : filter === 'stale'
              ? '安装超过 30 天且长期未检查更新的 Skill 会在此显示'
              : '去发现页搜索并安装你需要的 Skill'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredSkills.map((skill, index) => {
            const isExpanded = expandedSkill === skill.path;
            const isSelected = selectedSkills.has(skill.path);
            const skillHasUpdate = hasUpdate(skill.path);
            const skillStale = isStaleSkill(skill, skillHasUpdate);

            return (
              <motion.div key={skill.path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: Math.min(index * 0.03, 0.3) }}>
                {/* Skill card */}
                <div
                  className={`bg-trae-card/30 border rounded-lg p-4 hover:bg-trae-card/50 transition-all shadow-hard-sm ${
                    isSelected
                      ? 'border-trae-accent shadow-[0_0_12px_rgba(0,255,136,0.08)]'
                      : skillHasUpdate
                      ? 'border-orange-500/30 hover:border-orange-500/50'
                      : 'border-trae-border hover:border-trae-accent/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelectSkill(skill.path)}
                    />

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(skill)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                        skill.enabled
                          ? 'bg-trae-accent/30'
                          : 'bg-trae-border'
                      }`}
                      title={skill.enabled ? '点击禁用' : '点击启用'}
                    >
                      <motion.div layout className={`absolute top-0.5 w-4 h-4 rounded-full ${
                          skill.enabled
                            ? 'left-[18px] bg-trae-accent'
                            : 'left-0.5 bg-trae-text-secondary'
                        }`}
                      />
                    </button>

                    {/* Skill info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleExpandSkill(skill)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-trae-text font-medium text-sm truncate">
                          {skill.name}
                        </h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-accent/10 text-trae-accent">
                          {skill.type}
                        </span>
                        {/* Scope badge - useful in 'all' view */}
                        {scopeTab === 'all' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5 ${
                            skill.type === 'project'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          }`}>
                            {skill.type === 'project' ? (
                              <><Folder className="w-2.5 h-2.5" /> 项目</>
                            ) : (
                              <><Globe className="w-2.5 h-2.5" /> 全局</>
                            )}
                          </span>
                        )}
                        {skillHasUpdate && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-0.5">
                            <ArrowUpCircle className="w-2.5 h-2.5" />
                            可更新
                          </span>
                        )}
                        {skillStale && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            可能过期
                          </span>
                        )}
                        {skill.enabled ? (
                          <Power className="w-3 h-3 text-trae-success shrink-0" />
                        ) : (
                          <PowerOff className="w-3 h-3 text-trae-text-secondary shrink-0" />
                        )}
                      </div>
                      {skill.description && (
                        <div>
                          <p className="text-xs text-trae-text-secondary mt-0.5 truncate">
                            {skill.description}
                          </p>
                          {config.translation.enabled && (() => {
                            const translated = getTranslatedDescription(skill.description);
                            return translated ? (
                              <p className="text-xs text-trae-accent mt-0.5 truncate flex items-center gap-1">
                                <Languages className="w-3 h-3 shrink-0" />
                                {translated}
                              </p>
                            ) : null;
                          })()}
                        </div>
                      )}
                      <p className="text-[11px] text-trae-text-secondary mt-1 font-mono truncate">
                        {skill.path}
                      </p>
                      {skill.installedAt && (
                        <p className="text-[11px] text-trae-text-secondary/70 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {formatAge(skill.installedAt)}
                          {skill.lastCheckedAt
                            ? ` · 上次检查 ${formatAge(skill.lastCheckedAt).replace('安装', '检查')}`
                            : ' · 从未检查更新'}
                        </p>
                      )}
                    </div>

                    {/* Expand arrow */}
                    <button
                      onClick={() => handleExpandSkill(skill)}
                      className="p-1 rounded text-trae-text-secondary hover:text-trae-text transition-colors shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {skillHasUpdate && (
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleUpdateSingle(skill)}
                          className="p-2 rounded-lg text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-all"
                          title="更新"
                        >
                          <Download className="w-4 h-4" />
                        </motion.button>
                      )}
                      <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => handleOpenFolder(skill.path)}
                        className="p-2 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
                        title="打开文件夹"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => handleRemove(skill)}
                        className="p-2 rounded-lg text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all"
                        title="卸载"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* File browser (expanded) */}
                {isExpanded && (
                  <div className="mt-2 ml-4 mr-2">
                    {loadingFiles ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-trae-accent border-t-transparent rounded-full animate-spin" />
                        <span className="ml-2 text-sm text-trae-text-secondary">
                          加载文件...
                        </span>
                      </div>
                    ) : fileTree.length > 0 ? (
                      <FileBrowser
                        files={fileTree}
                        onFileSelect={(path) => {
                          console.log('Selected file:', path);
                        }}
                      />
                    ) : (
                      <div className="text-center py-6 text-trae-text-secondary text-sm">
                        无文件内容
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Floating action bar for batch remove */}
      {selectedSkills.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 22 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-trae-sidebar border border-trae-border rounded-xl shadow-hard"
        >
          <span className="text-sm text-trae-text">
            已选择 {selectedSkills.size} 个 Skill
          </span>
          <button
            onClick={handleBatchRemove}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-danger/15 text-trae-danger hover:bg-trae-danger/25 transition-all border border-trae-danger/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            批量卸载 {selectedSkills.size} 个
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-trae-text-secondary hover:text-trae-text transition-colors"
          >
            取消选择
          </button>
        </motion.div>
      )}

      {/* Single update dialog */}
      <AnimatePresence>
        {showUpdateDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => !updatingSkill && setShowUpdateDialog(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24 }}
              className="pointer-events-auto w-[520px] max-w-[90vw] bg-trae-sidebar border border-trae-border rounded-xl shadow-hard overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                <h3 className="text-trae-text font-semibold text-base">
                  {updatingSkill ? '更新中...' : updateError ? '更新失败' : '更新完成'}
                </h3>
                {!updatingSkill && (
                  <button
                    onClick={() => setShowUpdateDialog(false)}
                    className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-5">
                {updatingSkill && (
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-5 h-5 text-trae-accent animate-spin" />
                    <span className="text-sm text-trae-text">正在下载最新版本...</span>
                  </div>
                )}
                {!updatingSkill && !updateError && (
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-5 h-5 text-trae-success" />
                    <span className="text-sm text-trae-text">更新成功！</span>
                  </div>
                )}
                {updateError && (
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <XCircle className="w-5 h-5 text-trae-danger" />
                      <span className="text-sm text-trae-text">更新失败</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-trae-danger/10 border border-trae-danger/20 text-xs text-trae-danger font-mono">
                      {updateError}
                    </div>
                    <button
                      onClick={() => {
                        const skill = localSkills.find((s) => s.path === updatingSkill);
                        if (skill) handleRollback(skill);
                        setShowUpdateDialog(false);
                      }}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-danger/15 text-trae-danger hover:bg-trae-danger/25 transition-all border border-trae-danger/20"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      回滚到上一版本
                    </button>
                  </div>
                )}

                {/* Terminal output */}
                <div className="border border-trae-border rounded-lg overflow-hidden">
                  <TerminalViewer
                    outputLines={installOutput}
                    status={updatingSkill ? 'running' : updateError ? 'error' : 'success'}
                  />
                </div>
              </div>

              {!updatingSkill && (
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-trae-border bg-trae-card/30">
                  <button
                    onClick={() => setShowUpdateDialog(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                  >
                    关闭
                  </button>
                </div>
              )}
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Batch update dialog */}
      <AnimatePresence>
        {showBatchUpdateDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => !batchProgress.active && setShowBatchUpdateDialog(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24 }}
              className="pointer-events-auto w-[560px] max-w-[90vw] bg-trae-sidebar border border-trae-border rounded-xl shadow-hard overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border">
                <h3 className="text-trae-text font-semibold text-base">
                  批量更新
                </h3>
                {!batchProgress.active && (
                  <button
                    onClick={() => setShowBatchUpdateDialog(false)}
                    className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-5">
                {batchProgress.active && (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-trae-text">
                        正在更新: {batchProgress.currentSkillName}
                      </span>
                      <span className="text-xs text-trae-text-secondary">
                        {batchProgress.current} / {batchProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-trae-card/50 rounded-full overflow-hidden mb-4">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full bg-trae-accent rounded-full"
                      />
                    </div>
                  </>
                )}

                {batchUpdateResults && (
                  <div className="mb-4">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-trae-success" />
                        <span className="text-sm text-trae-text">
                          成功: {batchUpdateResults.succeeded}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-trae-danger" />
                        <span className="text-sm text-trae-text">
                          失败: {batchUpdateResults.failed}
                        </span>
                      </div>
                    </div>
                    {batchUpdateResults.results.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {batchUpdateResults.results.map((r, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                              r.success
                                ? 'bg-trae-success/10 text-trae-success'
                                : 'bg-trae-danger/10 text-trae-danger'
                            }`}
                          >
                            {r.success ? (
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="font-medium">{r.skillName}</span>
                            {!r.success && (
                              <span className="text-trae-danger/70 truncate">
                                - {r.message}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Terminal output */}
                <div className="border border-trae-border rounded-lg overflow-hidden">
                  <TerminalViewer
                    outputLines={installOutput}
                    status={batchProgress.active ? 'running' : batchUpdateResults && batchUpdateResults.failed > 0 ? 'error' : 'success'}
                  />
                </div>
              </div>

              {!batchProgress.active && batchUpdateResults && (
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-trae-border bg-trae-card/30">
                  <button
                    onClick={() => setShowBatchUpdateDialog(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                  >
                    关闭
                  </button>
                </div>
              )}
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 250, damping: 22 }}
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-hard z-50 ${
            toast.type === 'success'
              ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
              : 'bg-trae-danger/20 text-trae-danger border border-trae-danger/30'
          }`}
        >
          {toast.message}
        </motion.div>
      )}
    </div>
  );
}
