import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { useSkillStore } from '../store/skillStore';
import {
  Boxes,
  Download,
  Upload,
  Plus,
  Play,
  Loader2,
  X,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
} from 'lucide-react';
import type { BatchResult, PresetSkillRef, RemoteSkill, SkillPreset } from '../types';

export function PresetPage() {
  const { activeToolId, remoteSkills } = useSkillStore();
  const [presets, setPresets] = useState<SkillPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installResults, setInstallResults] = useState<Record<string, BatchResult>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<SkillPreset[]>('list_presets');
      setPresets(data);
    } catch (e) {
      showToast('error', `加载失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const persistPreset = async (preset: SkillPreset) => {
    const dataDir = await invoke<string>('get_app_data_dir');
    await invoke('export_preset', { preset, exportPath: `${dataDir}/presets.json` });
  };

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        title: '导入配方',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      const preset = await invoke<SkillPreset>('import_preset', { importPath: selected });
      await persistPreset(preset);
      showToast('success', `已导入配方: ${preset.name}`);
      await load();
    } catch (e) {
      showToast('error', `导入失败: ${String(e)}`);
    }
  };

  const handleExport = async (preset: SkillPreset) => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        title: '导出配方',
        defaultPath: `${preset.name}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      await invoke('export_preset', { preset, exportPath: path });
      showToast('success', `已导出配方: ${preset.name}`);
    } catch (e) {
      showToast('error', `导出失败: ${String(e)}`);
    }
  };

  const handleInstall = async (preset: SkillPreset) => {
    setInstallingId(preset.id);
    try {
      const result = await invoke<BatchResult>('install_preset', {
        preset,
        toolId: activeToolId,
      });
      setInstallResults((prev) => ({ ...prev, [preset.id]: result }));
      showToast(
        result.failed === 0 ? 'success' : 'error',
        `安装完成: 成功 ${result.succeeded}/${result.total}`,
      );
      useSkillStore.getState().loadLocalSkills().catch(() => {});
    } catch (e) {
      showToast('error', `安装失败: ${String(e)}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleSavePreset = async (preset: SkillPreset) => {
    try {
      await persistPreset(preset);
      showToast('success', `已保存配方: ${preset.name}`);
      await load();
    } catch (e) {
      showToast('error', `保存失败: ${String(e)}`);
    }
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-trae-text">技能栈 Preset</h1>
          <p className="text-xs text-trae-text-secondary mt-1">
            一键安装一组技能，内置官方配方或自建组合
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleImport}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            导入配方
          </motion.button>
          <motion.button
            onClick={() => setShowCreate(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            新建配方
          </motion.button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-trae-text-secondary">
          <Loader2 className="w-5 h-5 text-trae-accent animate-spin mr-2" />
          加载中...
        </div>
      ) : presets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-trae-text-secondary">
          <Boxes className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm">还没有配方</p>
          <p className="text-xs mt-1">点击「新建配方」创建你的第一个技能组合</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {presets.map((preset, index) => {
            const result = installResults[preset.id];
            const expanded = expandedId === preset.id;
            const installing = installingId === preset.id;
            return (
              <motion.div
                key={preset.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring' as const,
                  mass: 1,
                  stiffness: 200,
                  damping: 24,
                  delay: Math.min(index * 0.04, 0.4),
                }}
                className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-trae-text">{preset.name}</h3>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          preset.builtIn
                            ? 'bg-trae-accent/10 text-trae-accent border-trae-accent/20'
                            : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        }`}
                      >
                        {preset.builtIn ? '内置' : '自建'}
                      </span>
                      <span className="text-[11px] text-trae-text-secondary">v{preset.version}</span>
                    </div>
                    <p className="text-xs text-trae-text-secondary mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[11px] text-trae-text-secondary">
                        {preset.skills.length} 个技能
                      </span>
                      {(preset.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-trae-card/60 border border-trae-border text-trae-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <motion.button
                      onClick={() => handleInstall(preset)}
                      disabled={installing}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 transition-all border border-trae-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {installing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      安装
                    </motion.button>
                    <motion.button
                      onClick={() => handleExport(preset)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
                    >
                      <Download className="w-3 h-3" />
                      导出
                    </motion.button>
                    <motion.button
                      onClick={() => setExpandedId(expanded ? null : preset.id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
                    >
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                      {expanded ? '收起' : '详情'}
                    </motion.button>
                  </div>
                </div>

                {/* Install result summary */}
                {result && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-trae-text-secondary">
                        成功 {result.succeeded} / 失败 {result.failed} / 共 {result.total}
                      </span>
                      <span
                        className={result.failed === 0 ? 'text-trae-success' : 'text-trae-danger'}
                      >
                        {result.failed === 0 ? '全部安装成功' : '部分安装失败'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-trae-bg border border-trae-border overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${result.total === 0 ? 0 : (result.succeeded / result.total) * 100}%`,
                        }}
                        transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24 }}
                        className="h-full bg-trae-accent"
                      />
                    </div>
                  </div>
                )}

                {/* Expanded skills */}
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ type: 'spring' as const, mass: 1, stiffness: 200, damping: 24 }}
                    className="mt-3 border-t border-trae-border pt-3 overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {preset.skills.map((s) => (
                        <span
                          key={`${s.source}/${s.name}`}
                          className="px-2 py-1 rounded-md text-[11px] bg-trae-card/50 border border-trae-border text-trae-text-secondary"
                        >
                          {s.name}
                          <span className="text-trae-text-secondary/60 ml-1 font-mono">
                            {s.source}
                          </span>
                        </span>
                      ))}
                    </div>
                    {result && (
                      <div className="mt-3 space-y-1">
                        {result.results.map((r) => (
                          <div key={r.skillName} className="flex items-center gap-2 text-[11px]">
                            {r.success ? (
                              <CheckCircle2 className="w-3 h-3 text-trae-success shrink-0" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-trae-danger shrink-0" />
                            )}
                            <span className="text-trae-text font-medium">{r.skillName}</span>
                            <span
                              className={r.success ? 'text-trae-text-secondary' : 'text-trae-danger'}
                            >
                              {r.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <CreatePresetDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleSavePreset}
        remoteSkills={remoteSkills}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', mass: 1, stiffness: 250, damping: 22 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-hard z-50 flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
                : 'bg-trae-danger/20 text-trae-danger border border-trae-danger/30'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PresetPage;

// ─── 新建配方对话框 ────────────────────────────────────────────────────────

interface CreatePresetDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (preset: SkillPreset) => void;
  remoteSkills: RemoteSkill[];
}

function CreatePresetDialog({ open, onClose, onSave, remoteSkills }: CreatePresetDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualSkills, setManualSkills] = useState<PresetSkillRef[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualSource, setManualSource] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setQuery('');
      setSelected(new Set());
      setManualSkills([]);
      setManualName('');
      setManualSource('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return remoteSkills;
    return remoteSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    );
  }, [remoteSkills, query]);

  const toggleSkill = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addManual = () => {
    const n = manualName.trim();
    if (!n) return;
    setManualSkills((prev) => [
      ...prev,
      { name: n, source: manualSource.trim() || 'anthropics/skills' },
    ]);
    setManualName('');
    setManualSource('');
  };

  const skillCount = manualSkills.length + selected.size;

  const handleSave = () => {
    const n = name.trim();
    if (!n || skillCount === 0) return;
    const skills: PresetSkillRef[] = [
      ...manualSkills,
      ...remoteSkills
        .filter((s) => selected.has(`${s.source}/${s.name}`))
        .map((s) => ({ name: s.name, source: s.source, description: s.description })),
    ];
    onSave({
      id: `user-${Date.now()}`,
      name: n,
      description: description.trim() || '用户自建配方',
      version: '1.0.0',
      skills,
      tags: [],
      createdAt: Date.now(),
      builtIn: false,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 5 }}
            transition={{ type: 'spring', mass: 1, stiffness: 220, damping: 24 }}
            className="relative w-full max-w-lg bg-trae-sidebar border border-trae-border rounded-2xl shadow-hard-lg mx-4 max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-trae-border">
              <h2 className="text-trae-text font-semibold text-base">新建配方</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs text-trae-text-secondary mb-1.5">配方名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：数据分析工作台"
                  className="w-full bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-trae-text-secondary mb-1.5">描述</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话描述这个配方"
                  className="w-full bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
                />
              </div>

              {/* Skill selection */}
              <div>
                <label className="block text-xs text-trae-text-secondary mb-1.5">
                  选择技能（已选 {skillCount} 个）
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-trae-text-secondary" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索技能..."
                    className="w-full bg-trae-bg border border-trae-border rounded-lg pl-9 pr-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-trae-border rounded-lg divide-y divide-trae-border">
                  {filtered.length === 0 ? (
                    <div className="p-4 text-center text-xs text-trae-text-secondary">
                      {remoteSkills.length === 0
                        ? '暂无远程技能，请使用下方手动添加'
                        : '没有匹配的技能'}
                    </div>
                  ) : (
                    filtered.map((s) => {
                      const key = `${s.source}/${s.name}`;
                      const checked = selected.has(key);
                      return (
                        <div
                          key={key}
                          onClick={() => toggleSkill(key)}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                            checked ? 'bg-trae-accent/5' : 'hover:bg-trae-card/40'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 border shrink-0 flex items-center justify-center ${
                              checked ? 'bg-trae-accent border-trae-accent' : 'border-trae-border'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 text-trae-bg" />}
                          </div>
                          <span className="text-xs text-trae-text flex-1 truncate">{s.name}</span>
                          <span className="text-[10px] text-trae-text-secondary/60 font-mono truncate max-w-[140px]">
                            {s.source}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Manual add */}
              <div>
                <label className="block text-xs text-trae-text-secondary mb-1.5">
                  手动添加技能
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="技能名，如 web-search"
                    className="flex-1 bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
                  />
                  <input
                    type="text"
                    value={manualSource}
                    onChange={(e) => setManualSource(e.target.value)}
                    placeholder="来源，如 anthropics/skills"
                    className="flex-1 bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addManual}
                    disabled={!manualName.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    添加
                  </button>
                </div>
                {manualSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {manualSkills.map((s, i) => (
                      <span
                        key={`${s.source}/${s.name}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-trae-card/50 border border-trae-border text-trae-text-secondary"
                      >
                        {s.name}
                        <button
                          type="button"
                          onClick={() =>
                            setManualSkills((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="text-trae-text-secondary/60 hover:text-trae-danger"
                          aria-label={`移除 ${s.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-trae-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!name.trim() || skillCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                保存配方
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
