import { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import { Folder, Sun, Moon, Monitor, Save, Loader2, Check, Download, Upload, Languages, Key, Globe, Sparkles, Trash2, Zap, Rabbit, Turtle, Gauge, Github, Eye, EyeOff, Edit2, FolderOpen, Plus, RefreshCw, Palette } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Checkbox } from './Checkbox';
import type { AppConfig, TranslationConfig, Project } from '../types';
import { useMotionConfig, type MotionSpeed, SPEED_MULTIPLIERS } from '../lib/motionConfig';
import { applyTheme as applyThemeShared, applyAccent, ACCENT_PRESETS, hexToTriplet } from '../lib/theme';
import { useI18nStore, useLang, type LangSetting } from '../store/i18nStore';
import { t } from '../lib/i18n';

const UI_LANGUAGE_OPTIONS: { value: LangSetting; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'system', label: '跟随系统' },
];

const LANGUAGE_OPTIONS = [
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const SPEED_OPTIONS: { value: MotionSpeed; label: string; icon: typeof Zap; desc: string }[] = [
  { value: 'slow', label: '慢速', icon: Turtle, desc: '优雅舒缓' },
  { value: 'normal', label: '正常', icon: Gauge, desc: '平衡流畅' },
  { value: 'fast', label: '快速', icon: Rabbit, desc: '敏捷响应' },
  { value: 'instant', label: '瞬时', icon: Zap, desc: '无动画' },
];

// ─── Project List Item ─────────────────────────────────────────────────────

function ProjectListItem({
  project,
  onRename,
  onRemove,
  onOpen,
  onSwitch,
}: {
  project: Project;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onOpen: (path: string) => void;
  onSwitch: (id: string | null) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(true);
    setEditName(project.name);
  };

  const handleSaveRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setEditName(project.name);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要从列表中移除项目「${project.name}」吗？\n（不会删除任何文件）`)) {
      onRemove(project.id);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(project.path);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSwitch(project.id)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-trae-bg/40 border border-trae-border hover:border-trae-accent/30 hover:bg-trae-card/60 transition-all cursor-pointer group"
    >
      <Folder className="w-4 h-4 text-trae-accent shrink-0" />
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-trae-bg border border-trae-accent/50 rounded px-2 py-0.5 text-sm text-trae-text font-medium focus:outline-none focus:border-trae-accent"
          />
        ) : (
          <>
            <div className="text-sm text-trae-text font-medium truncate">
              {project.name}
            </div>
            <div className="text-[11px] text-trae-text-secondary font-mono truncate">
              {project.path}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-trae-text-secondary/70 px-1.5 py-0.5 rounded bg-trae-card/60">
          {project.skillCount} 个技能
        </span>
        <button
          onClick={handleOpenFolder}
          className="p-1.5 rounded text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-colors opacity-0 group-hover:opacity-100"
          title="在资源管理器中打开"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleStartRename}
          className="p-1.5 rounded text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-colors opacity-0 group-hover:opacity-100"
          title="重命名"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRemove}
          className="p-1.5 rounded text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-colors opacity-0 group-hover:opacity-100"
          title="移除项目"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function SettingsPage() {
  const { config, loadConfig, updateConfig, localSkills, loadLocalSkills, clearTranslations,
    // Project-related
    projects,
    addProject,
    removeProject,
    renameProject,
    switchProject,
    openFolder,
  } = useSkillStore();
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testTranslationStatus, setTestTranslationStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testTranslationError, setTestTranslationError] = useState<string | null>(null);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [testGithubStatus, setTestGithubStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testGithubError, setTestGithubError] = useState<string | null>(null);
  const [githubRateLimit, setGithubRateLimit] = useState<{
    limit: number;
    remaining: number;
    resetUnix: number;
    authenticated: boolean;
  } | null>(null);
  const [githubRateLoading, setGithubRateLoading] = useState(false);
  const { config: motionConfig, setSpeed, setEnabled } = useMotionConfig();
  const { setting: langSetting, setSetting: setLangSetting } = useI18nStore();
  useLang();

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadConfig();
      setIsLoading(false);
    };
    init();
  }, [loadConfig]);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const applyTheme = useCallback((theme: string) => {
    applyThemeShared(theme);
  }, []);

  // Apply theme immediately when the selection changes (not just on save)
  useEffect(() => {
    applyTheme(localConfig.theme);
    applyAccent(localConfig.accentColor);
  }, [localConfig.theme, localConfig.accentColor, applyTheme]);

  const loadGithubRateLimit = useCallback(async () => {
    setGithubRateLoading(true);
    try {
      const info = await invoke<{
        limit: number;
        remaining: number;
        resetUnix: number;
        authenticated: boolean;
      }>('get_github_rate_limit');
      setGithubRateLimit(info);
    } catch {
      setGithubRateLimit(null);
    }
    setGithubRateLoading(false);
  }, []);

  useEffect(() => {
    loadGithubRateLimit();
  }, [loadGithubRateLimit]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-trae-accent animate-spin" />
      </div>
    );
  }

  const handleSave = async () => {
    await updateConfig(localConfig);
    // Apply theme immediately
    applyTheme(localConfig.theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateTranslation = (updates: Partial<TranslationConfig>) => {
    setLocalConfig({
      ...localConfig,
      translation: { ...localConfig.translation, ...updates },
    });
  };

  const updateGithub = (updates: Partial<{ token: string }>) => {
    setLocalConfig({
      ...localConfig,
      github: { ...localConfig.github, ...updates },
    });
  };

  const handleTestGithubToken = async () => {
    const token = localConfig.github.token;
    if (!token) {
      setTestGithubStatus('error');
      setTestGithubError('请先输入 Token');
      setTimeout(() => {
        setTestGithubStatus('idle');
        setTestGithubError(null);
      }, 2000);
      return;
    }
    setTestGithubStatus('testing');
    setTestGithubError(null);
    try {
      await invoke('test_github_token', { token });
      setTestGithubStatus('success');
    } catch (e) {
      setTestGithubStatus('error');
      setTestGithubError(typeof e === 'string' ? e : 'Token 无效或连接失败');
    }
    setTimeout(() => {
      setTestGithubStatus('idle');
      setTestGithubError(null);
    }, 3000);
  };

  const handleTestTranslation = async () => {
    const t = localConfig.translation;
    if (!t.enabled || (!t.useImmersive && !t.apiKey)) {
      setTestTranslationStatus('error');
      setTimeout(() => setTestTranslationStatus('idle'), 2000);
      return;
    }
    setTestTranslationStatus('testing');
    setTestTranslationError(null);
    try {
      await invoke('translate_skill_descriptions', {
        texts: ['This is a test message for translation.'],
        targetLanguage: t.targetLanguage,
        apiKey: t.apiKey,
        apiBase: t.apiBase,
        model: t.model,
        useImmersive: t.useImmersive,
      });
      setTestTranslationStatus('success');
    } catch (e) {
      setTestTranslationStatus('error');
      setTestTranslationError(
        typeof e === 'string' ? e : '连接失败，请检查 API Key 和 Base URL'
      );
    }
    setTimeout(() => setTestTranslationStatus('idle'), 3000);
  };

  const handleAddProject = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择项目目录',
      });
      if (selected && typeof selected === 'string') {
        const result = await addProject(selected);
        if (result) {
          setImportMsg({ type: 'success', text: `已添加项目：${result.name}` });
        } else {
          setImportMsg({ type: 'error', text: '添加项目失败' });
        }
        setTimeout(() => setImportMsg(null), 3000);
      }
    } catch (e) {
      setImportMsg({ type: 'error', text: `添加失败: ${String(e)}` });
      setTimeout(() => setImportMsg(null), 3000);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearTranslations();
      setImportMsg({ type: 'success', text: '翻译缓存已清除' });
    } catch (e) {
      setImportMsg({ type: 'error', text: `清除失败: ${String(e)}` });
    }
    setTimeout(() => setImportMsg(null), 3000);
  };

  const handleExport = async () => {
    if (localSkills.length === 0) {
      setImportMsg({ type: 'error', text: '没有已安装的 Skill 可导出' });
      setTimeout(() => setImportMsg(null), 3000);
      return;
    }
    try {
      // Use the config/data directory, not the skills directory itself
      const baseDir = config.globalSkillsPath
        ? config.globalSkillsPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
        : '';
      const exportPath = `${baseDir}/trae-skills-backup_${new Date().toISOString().slice(0, 10)}.json`;
      await invoke('export_skills', { skills: localSkills, exportPath });
      setImportMsg({ type: 'success', text: `已导出到: ${exportPath}` });
      setTimeout(() => setImportMsg(null), 5000);
    } catch (e) {
      setImportMsg({ type: 'error', text: `导出失败: ${String(e)}` });
      setTimeout(() => setImportMsg(null), 3000);
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const content = ev.target?.result as string;
          const data = JSON.parse(content);
          if (data.skills && Array.isArray(data.skills) && data.skills.length > 0) {
            // Import by reinstalling each skill from its source if available
            const toInstall = data.skills
              .filter((s: { source?: string; name?: string }) => s.source && s.name)
              .map((s: { source: string; name: string }) => ({ source: s.source, skillName: s.name }));
            if (toInstall.length > 0) {
              const { batchInstall } = useSkillStore.getState();
              await batchInstall(toInstall);
              await loadLocalSkills();
              setImportMsg({ type: 'success', text: `导入成功: ${toInstall.length} 个 Skill` });
            } else {
              setImportMsg({ type: 'error', text: '备份文件缺少可识别的 source/name 字段' });
            }
          } else {
            setImportMsg({ type: 'error', text: '无效的导入文件格式' });
          }
        } catch (e) {
          setImportMsg({ type: 'error', text: `导入失败: ${String(e)}` });
        }
        setTimeout(() => setImportMsg(null), 3000);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-trae-text mb-1">{t('settings.title')}</h1>
        <p className="text-sm text-trae-text-secondary">{t('settings.subtitle')}</p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Global Skills Path */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-2">
              <Folder className="w-4 h-4 text-trae-accent" />
              {t('settings.globalSkillsPath')}
            </label>
            <p className="text-xs text-trae-text-secondary mb-3">
              {t('settings.globalSkillsPathHint')}
            </p>
            <input
              type="text"
              value={localConfig.globalSkillsPath}
              onChange={(e) => setLocalConfig({ ...localConfig, globalSkillsPath: e.target.value })}
              placeholder={t('settings.autoDetecting')}
              className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text font-mono focus:outline-none focus:border-trae-accent/50"
            />
            {localConfig.globalSkillsPath && (
              <p className="text-xs text-trae-success mt-2 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {t('settings.pathDetected')}
              </p>
            )}
          </div>
        </motion.div>

        {/* Project Management */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.06 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm text-trae-text">
                <Folder className="w-4 h-4 text-trae-accent" />
                项目管理
              </label>
              <motion.button
                onClick={handleAddProject}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20 transition-all"
              >
                <Plus className="w-3 h-3" />
                添加项目
              </motion.button>
            </div>
            <p className="text-xs text-trae-text-secondary mb-3">
              管理项目级 Skill（存放在项目的 .trae/skills/ 目录中）
            </p>

            {/* Project list */}
            {projects.length === 0 ? (
              <div className="text-center py-6 text-trae-text-secondary text-xs">
                暂无项目，点击上方「添加项目」按钮添加
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {projects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    onRename={renameProject}
                    onRemove={removeProject}
                    onOpen={openFolder}
                    onSwitch={switchProject}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Theme */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.12 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-2">
              {localConfig.theme === 'dark' ? <Moon className="w-4 h-4 text-trae-accent" /> : localConfig.theme === 'light' ? <Sun className="w-4 h-4 text-trae-accent" /> : <Monitor className="w-4 h-4 text-trae-accent" />}
              {t('settings.theme')}
            </label>
            <div className="flex gap-2 mt-2" role="radiogroup" aria-label="主题选择">
              {(['dark', 'light', 'system'] as const).map((theme) => {
                const active = localConfig.theme === theme;
                return (
                  <motion.button
                    key={theme}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLocalConfig({ ...localConfig, theme })}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/20'
                        : 'bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50'
                    }`}
                  >
                    {theme === 'dark' && t('settings.dark')}
                    {theme === 'light' && t('settings.light')}
                    {theme === 'system' && t('settings.followSystem')}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Accent Color */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.14 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-3">
              <Palette className="w-4 h-4 text-trae-accent" />
              强调色
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const active = localConfig.accentColor === preset.triplet;
                return (
                  <motion.button
                    key={preset.hex}
                    title={preset.name}
                    onClick={() => setLocalConfig({ ...localConfig, accentColor: preset.triplet })}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      active ? 'border-trae-text scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}
              <label
                className="relative w-7 h-7 rounded-full border-2 border-trae-border cursor-pointer overflow-hidden"
                title="自定义颜色"
              >
                <input
                  type="color"
                  value={
                    localConfig.accentColor?.startsWith('#')
                      ? localConfig.accentColor
                      : ACCENT_PRESETS[0].hex
                  }
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      accentColor: hexToTriplet(e.target.value),
                    })
                  }
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-trae-text-secondary">
                  +
                </span>
              </label>
            </div>
          </div>
        </motion.div>

        {/* Language */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.145 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-2">
              <Languages className="w-4 h-4 text-trae-accent" />
              {t('settings.language')}
            </label>
            <p className="text-xs text-trae-text-secondary mb-3">
              {t('settings.languageHint')}
            </p>
            <div className="flex gap-2 mt-2" role="radiogroup" aria-label="语言选择">
              {UI_LANGUAGE_OPTIONS.map((opt) => {
                const active = langSetting === opt.value;
                return (
                  <motion.button
                    key={opt.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLangSetting(opt.value)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/20'
                        : 'bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50'
                    }`}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Motion Speed */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.15 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-3">
              <Gauge className="w-4 h-4 text-trae-accent" />
              动画速度
            </label>
            <p className="text-xs text-trae-text-secondary mb-4">
              调整全局动画速度。实时生效，无需保存。
            </p>

            {/* Enable toggle */}
            <label
              className="flex items-center gap-3 cursor-pointer mb-4"
              onClick={() => setEnabled(!motionConfig.enabled)}
            >
              <Checkbox
                checked={motionConfig.enabled}
                onChange={() => setEnabled(!motionConfig.enabled)}
              />
              <span className="text-sm text-trae-text">启用动画效果</span>
            </label>

            <AnimatePresence>
              {motionConfig.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring' as const, stiffness: 300, damping: 25 }}
                >
                  {/* Speed selector cards */}
                  <div className="grid grid-cols-4 gap-2 mb-4" role="radiogroup" aria-label="动画速度选择">
                    {SPEED_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = motionConfig.speed === opt.value;
                      return (
                        <motion.button
                          key={opt.value}
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setSpeed(opt.value)}
                          whileHover={{ scale: 1.04, y: -2 }}
                          whileTap={{ scale: 0.96 }}
                          className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-xs font-medium transition-all border ${
                            isActive
                              ? 'bg-trae-accent/15 text-trae-accent border-trae-accent/25 shadow-sm shadow-trae-accent/5'
                              : 'bg-trae-card/30 text-trae-text-secondary border-trae-border hover:bg-trae-card/50 hover:text-trae-text'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{opt.label}</span>
                          <span className="text-[10px] opacity-60">{opt.desc}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Live preview */}
                  <div className="bg-trae-bg/50 border border-trae-border rounded-lg p-4">
                    <p className="text-[10px] text-trae-text-secondary mb-3 uppercase tracking-wider font-medium">实时预览</p>
                    <div className="h-8 flex items-center">
                      <div className="relative w-full h-full">
                        {/* Track line */}
                        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-full bg-trae-card/70" />
                        {/* Animated dot */}
                        <motion.div
                          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 -ml-2"
                          animate={{ left: ['0%', '100%', '0%'] }}
                          transition={{
                            duration: SPEED_MULTIPLIERS[motionConfig.speed] * 1.8,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        >
                          <div className="w-full h-full rounded-full bg-trae-accent shadow-hard shadow-trae-accent/30" />
                        </motion.div>
                        {/* Speed indicator */}
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-trae-text-secondary/40">
                          <span>慢</span>
                          <span>快</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Import / Export */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.18 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-3">
              <Download className="w-4 h-4 text-trae-accent" />
              配置导入/导出
            </label>
            <p className="text-xs text-trae-text-secondary mb-3">
              导出已安装 Skill 列表，或从备份文件导入配置。
            </p>
            <div className="flex gap-2">
              <motion.button
                type="button"
                onClick={handleExport}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50 transition-all"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                导出配置
              </motion.button>
              <motion.button
                type="button"
                onClick={handleImport}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50 transition-all"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                导入配置
              </motion.button>
            </div>
            {importMsg && (
              <p className={`text-xs mt-2 ${importMsg.type === 'success' ? 'text-trae-success' : 'text-trae-danger'}`}>
                {importMsg.text}
              </p>
            )}
          </div>
        </motion.div>

        {/* AI Translation Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.24 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-3">
              <Languages className="w-4 h-4 text-trae-accent" />
              AI 翻译设置
            </label>
            <p className="text-xs text-trae-text-secondary mb-4">
              配置 AI API 后，可自动翻译 Skill 描述为指定语言。支持任意 OpenAI-compatible API。
              未启用时，Skill 描述会默认展示基于内置技术词库的「术语对照」（本地翻译，无需联网）。
            </p>

            <div className="space-y-4">
              {/* Enable toggle */}
              <label
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => updateTranslation({ enabled: !localConfig.translation.enabled })}
              >
                <Checkbox
                  checked={localConfig.translation.enabled}
                  onChange={() => updateTranslation({ enabled: !localConfig.translation.enabled })}
                />
                <span className="text-sm text-trae-text">启用 AI 翻译</span>
              </label>

              {localConfig.translation.enabled && (
                <>
                  {/* Immersive Translate (free) toggle */}
                  <label
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => updateTranslation({ useImmersive: !localConfig.translation.useImmersive })}
                  >
                    <Checkbox
                      checked={localConfig.translation.useImmersive}
                      onChange={() => updateTranslation({ useImmersive: !localConfig.translation.useImmersive })}
                    />
                    <span className="text-sm text-trae-text">使用沉浸式翻译（免费，无需 API Key）</span>
                  </label>
                  {localConfig.translation.useImmersive && (
                    <p className="text-xs text-trae-text-secondary -mt-1">
                      基于 Google Translate 免费端点，与沉浸式翻译免费版同链路。仅用于 Skill 描述翻译，不影响应用其他功能。
                    </p>
                  )}

                  {/* Target Language */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-trae-text-secondary mb-1.5">
                      <Globe className="w-3 h-3" />
                      目标语言
                    </label>
                    <select
                      value={localConfig.translation.targetLanguage}
                      onChange={(e) => updateTranslation({ targetLanguage: e.target.value })}
                      className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text focus:outline-none focus:border-trae-accent/50"
                    >
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!localConfig.translation.useImmersive && (
                    <>
                  {/* API Key */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-trae-text-secondary mb-1.5">
                      <Key className="w-3 h-3" />
                      API Key
                    </label>
                    <input
                      type="password"
                      value={localConfig.translation.apiKey}
                      onChange={(e) => updateTranslation({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text font-mono focus:outline-none focus:border-trae-accent/50"
                    />
                  </div>

                  {/* API Base */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-trae-text-secondary mb-1.5">
                      <Globe className="w-3 h-3" />
                      API Base URL
                    </label>
                    <input
                      type="text"
                      value={localConfig.translation.apiBase}
                      onChange={(e) => updateTranslation({ apiBase: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text font-mono focus:outline-none focus:border-trae-accent/50"
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-trae-text-secondary mb-1.5">
                      <Sparkles className="w-3 h-3" />
                      模型
                    </label>
                    <input
                      type="text"
                      value={localConfig.translation.model}
                      onChange={(e) => updateTranslation({ model: e.target.value })}
                      placeholder="gpt-4o-mini"
                      className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text font-mono focus:outline-none focus:border-trae-accent/50"
                    />
                  </div>
                    </>
                  )}

                  {/* Test & Clear buttons */}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <motion.button
                        type="button"
                        onClick={handleTestTranslation}
                        disabled={testTranslationStatus === 'testing'}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        aria-label="测试翻译连接"
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          testTranslationStatus === 'success'
                            ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
                            : testTranslationStatus === 'error'
                            ? 'bg-trae-danger/20 text-trae-danger border border-trae-danger/30'
                            : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20'
                        }`}
                      >
                        {testTranslationStatus === 'testing' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                        {testTranslationStatus === 'success' && <Check className="w-3 h-3" aria-hidden="true" />}
                        {testTranslationStatus === 'idle' && <Sparkles className="w-3 h-3" aria-hidden="true" />}
                        {testTranslationStatus === 'error' && <span className="text-trae-danger">测试失败</span>}
                        {testTranslationStatus === 'success' && '测试通过'}
                        {testTranslationStatus === 'idle' && '测试连接'}
                        {testTranslationStatus === 'testing' && '测试中...'}
                      </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleClearCache}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50 transition-all"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                      清除缓存
                    </motion.button>
                    </div>
                    {testTranslationError && testTranslationStatus === 'error' && (
                      <p className="text-xs text-trae-danger">{testTranslationError}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* GitHub Integration Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24, delay: 0.3 }}
        >
          <div className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm">
            <label className="flex items-center gap-2 text-sm text-trae-text mb-3">
              <Github className="w-4 h-4 text-trae-accent" />
              GitHub 集成
            </label>
            <p className="text-xs text-trae-text-secondary mb-4">
              配置 GitHub Token 后可提升 API 速率限制（60 → 5000 次/小时），并获取更准确的仓库数据。推荐使用 fine-grained token，仅授予 public_repo 权限。
            </p>

            <div className="space-y-4">
              {/* GitHub Token */}
              <div>
                <label className="flex items-center gap-1.5 text-xs text-trae-text-secondary mb-1.5">
                  <Key className="w-3 h-3" />
                  Personal Access Token
                </label>
                <div className="relative">
                  <input
                    type={showGithubToken ? 'text' : 'password'}
                    value={localConfig.github.token}
                    onChange={(e) => updateGithub({ token: e.target.value })}
                    placeholder="ghp_..."
                    className="w-full bg-trae-bg/50 border border-trae-border rounded-lg px-3 py-2 pr-10 text-sm text-trae-text font-mono focus:outline-none focus:border-trae-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGithubToken(!showGithubToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-trae-text-secondary hover:text-trae-text transition-colors"
                    aria-label={showGithubToken ? '隐藏 Token' : '显示 Token'}
                  >
                    {showGithubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Test connection button */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <motion.button
                    type="button"
                    onClick={handleTestGithubToken}
                    disabled={testGithubStatus === 'testing'}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    aria-label="测试 GitHub Token"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      testGithubStatus === 'success'
                        ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
                        : testGithubStatus === 'error'
                        ? 'bg-trae-danger/20 text-trae-danger border border-trae-danger/30'
                        : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20'
                    }`}
                  >
                    {testGithubStatus === 'testing' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                    {testGithubStatus === 'success' && <Check className="w-3 h-3" aria-hidden="true" />}
                    {testGithubStatus === 'idle' && <Github className="w-3 h-3" aria-hidden="true" />}
                    {testGithubStatus === 'error' && <span className="text-trae-danger">测试失败</span>}
                    {testGithubStatus === 'success' && '测试通过'}
                    {testGithubStatus === 'idle' && '测试连接'}
                    {testGithubStatus === 'testing' && '测试中...'}
                  </motion.button>
                </div>
                {testGithubError && testGithubStatus === 'error' && (
                  <p className="text-xs text-trae-danger">{testGithubError}</p>
                )}
              </div>

              {/* Rate limit status */}
              <div className="flex items-center justify-between gap-2 bg-trae-bg/30 border border-trae-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-trae-text-secondary">
                  <Gauge className="w-3.5 h-3.5 text-trae-accent" />
                  <span>API 限额</span>
                </div>
                {githubRateLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-trae-accent animate-spin" />
                ) : githubRateLimit ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        githubRateLimit.remaining < 10
                          ? 'text-trae-danger font-medium'
                          : 'text-trae-text'
                      }
                    >
                      {githubRateLimit.remaining} / {githubRateLimit.limit}
                    </span>
                    <span className="text-trae-text-secondary/60">
                      {githubRateLimit.authenticated ? '已认证' : '未认证'}
                    </span>
                    {githubRateLimit.remaining < 10 && (
                      <span className="text-trae-danger/80">
                        {new Date(githubRateLimit.resetUnix * 1000).toLocaleTimeString()} 重置
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={loadGithubRateLimit}
                      className="p-1 rounded-md text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-colors"
                      aria-label="刷新限额"
                      title="刷新"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-trae-text-secondary/60">获取失败</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          type="button"
          onClick={handleSave}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          animate={saved ? { scale: [1, 1.05, 1] } : {}}
          transition={{ type: 'spring' as const, stiffness: 300, damping: 15 }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            saved
              ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
              : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 border border-trae-accent/20'
          }`}
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          {saved ? t('common.saved') : t('settings.save')}
        </motion.button>
      </div>
    </div>
  );
}
