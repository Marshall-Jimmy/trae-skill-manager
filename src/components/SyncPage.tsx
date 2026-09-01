import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { useSkillStore } from '../store/skillStore';
import { Bot, Sparkles, MousePointer2, Terminal, Link2, Unlink, RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CrossToolSkill, ToolSkillEntry } from '../types';

const toolIconMap: Record<string, React.ElementType> = {
  trae: Bot,
  'claude-code': Sparkles,
  cursor: MousePointer2,
  codex: Terminal,
};

function ToolIcon({ id, className }: { id: string; className?: string }) {
  const Icon = toolIconMap[id] || Bot;
  return <Icon className={className} />;
}

type ViewMode = 'skill' | 'tool';

export function SyncPage() {
  const { toolsStatus } = useSkillStore();
  const [skills, setSkills] = useState<CrossToolSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('skill');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<CrossToolSkill[]>('list_cross_tool_skills');
      setSkills(data);
    } catch (e) {
      setToast({ type: 'error', message: `加载失败: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = (id: string) =>
    toolsStatus.find((t) => t.id === id)?.displayName || id;

  const handleSync = async (skillName: string, sourceToolId: string, targetToolId: string) => {
    setSyncing(`${skillName}:${targetToolId}`);
    try {
      await invoke('sync_skill_to_tool', {
        skillName,
        sourceToolId,
        targetToolId,
      });
      setToast({ type: 'success', message: `已同步 ${skillName} 到 ${displayName(targetToolId)}` });
      await load();
    } catch (e) {
      setToast({ type: 'error', message: `同步失败: ${String(e)}` });
    } finally {
      setSyncing(null);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const handleUnsync = async (skillName: string, targetToolId: string) => {
    setSyncing(`${skillName}:${targetToolId}`);
    try {
      await invoke('unsync_skill_from_tool', { skillName, targetToolId });
      setToast({ type: 'success', message: `已取消 ${skillName} 在 ${displayName(targetToolId)} 的同步` });
      await load();
    } catch (e) {
      setToast({ type: 'error', message: `取消同步失败: ${String(e)}` });
    } finally {
      setSyncing(null);
    }
    setTimeout(() => setToast(null), 3000);
  };

  // 判断一个 entry 是否为链接（路径与源工具不同目录时视为链接）
  const isLinked = (skill: CrossToolSkill, entry: ToolSkillEntry) => {
    // 多个工具都有同名技能时，除第一个外其余视为链接（由同步创建）
    const first = skill.entries[0];
    return first && first.toolId !== entry.toolId;
  };

  const installedToolIds = (skill: CrossToolSkill) =>
    new Set(skill.entries.map((e) => e.toolId));

  const availableTools = useMemo(
    () => toolsStatus.filter((t) => t.installed),
    [toolsStatus],
  );

  // 按工具维度：每个工具列出其技能
  const byTool = useMemo(() => {
    return toolsStatus
      .filter((t) => t.installed)
      .map((tool) => ({
        tool,
        skills: skills.filter((s) => s.entries.some((e) => e.toolId === tool.id)),
      }));
  }, [toolsStatus, skills]);

  const renderSkillRow = (skill: CrossToolSkill) => {
    const has = installedToolIds(skill);
    const missing = availableTools.filter((t) => !has.has(t.id));
    const source = skill.entries[0];

    return (
      <motion.div
        key={skill.name}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-trae-card/30 border border-trae-border rounded-lg p-4 hover:bg-trae-card/50 transition-all shadow-hard-sm"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-trae-text font-medium text-sm truncate">{skill.name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {skill.entries.map((entry) => (
              <span
                key={entry.toolId}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  isLinked(skill, entry)
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-trae-accent/10 text-trae-accent border border-trae-accent/20'
                }`}
                title={entry.path}
              >
                <ToolIcon id={entry.toolId} className="w-2.5 h-2.5" />
                {displayName(entry.toolId)}
                {isLinked(skill, entry) && <Link2 className="w-2.5 h-2.5" />}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-trae-text-secondary/70 mt-1 font-mono truncate">
          {source?.path || ''}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {missing.map((tool) => {
            const key = `${skill.name}:${tool.id}`;
            const busy = syncing === key;
            return (
              <motion.button
                key={tool.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => source && handleSync(skill.name, source.toolId, tool.id)}
                disabled={busy || !source}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 transition-all border border-trae-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Link2 className="w-3 h-3" />
                )}
                同步到 {displayName(tool.id)}
              </motion.button>
            );
          })}
          {skill.entries.length > 1 &&
            skill.entries.slice(1).map((entry) => {
              const key = `${skill.name}:${entry.toolId}`;
              const busy = syncing === key;
              return (
                <motion.button
                  key={`un-${entry.toolId}`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleUnsync(skill.name, entry.toolId)}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all border border-trae-border disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Unlink className="w-3 h-3" />
                  )}
                  取消 {displayName(entry.toolId)}
                </motion.button>
              );
            })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-trae-text">跨工具同步</h1>
          <p className="text-xs text-trae-text-secondary mt-1">
            同名技能在多个工具间以链接共享，单点更新全局生效
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-trae-card/40 border border-trae-border rounded-lg p-0.5">
            {(['skill', 'tool'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === mode
                    ? 'bg-trae-accent/15 text-trae-accent'
                    : 'text-trae-text-secondary hover:text-trae-text'
                }`}
              >
                {mode === 'skill' ? '按技能' : '按工具'}
              </button>
            ))}
          </div>
          <motion.button
            onClick={load}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-trae-text-secondary">
          <Loader2 className="w-5 h-5 text-trae-accent animate-spin mr-2" />
          加载中...
        </div>
      ) : viewMode === 'skill' ? (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {skills.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-trae-text-secondary">
              <Link2 className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">还没有可同步的技能</p>
              <p className="text-xs mt-1">先在发现页安装技能，再回来跨工具同步</p>
            </div>
          ) : (
            skills.map(renderSkillRow)
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {byTool.map(({ tool, skills: toolSkills }) => (
            <div key={tool.id} className="bg-trae-card/20 border border-trae-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <ToolIcon id={tool.id} className="w-4 h-4 text-trae-accent" />
                <h3 className="text-sm font-medium text-trae-text">{tool.displayName}</h3>
                <span className="text-[11px] text-trae-text-secondary">
                  {toolSkills.length} 个技能
                </span>
              </div>
              {toolSkills.length === 0 ? (
                <p className="text-xs text-trae-text-secondary/70">未安装技能</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {toolSkills.map((s) => (
                    <span
                      key={s.name}
                      className="px-2 py-1 rounded-md text-[11px] bg-trae-card/50 border border-trae-border text-trae-text-secondary"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
