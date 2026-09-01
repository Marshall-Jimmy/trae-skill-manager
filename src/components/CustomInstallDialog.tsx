'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Loader2, PackageOpen, Download, AlertCircle } from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import { TerminalViewer } from './TerminalViewer';
import { Checkbox } from './Checkbox';
import type { RemoteSkill } from '../types';

interface CustomInstallDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CustomInstallDialog({ open, onClose }: CustomInstallDialogProps) {
  const store = useSkillStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState('');
  const [querying, setQuerying] = useState(false);
  const [repoSkills, setRepoSkills] = useState<RemoteSkill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setSource('');
    setRepoSkills([]);
    setSelected(new Set());
    setInstalling(false);
    setOutputLines([]);
    setInstallStatus('idle');
    setQuerying(false);
    setErrorMsg(null);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleQuery = async () => {
    const trimmed = source.trim();
    if (!trimmed) return;

    setQuerying(true);
    setRepoSkills([]);
    setSelected(new Set());
    setErrorMsg(null);

    try {
      const skills = await store.listRepoSkills(trimmed);
      if (Array.isArray(skills) && skills.length > 0) {
        // Normalize source for display
        let normalizedSource = trimmed;
        if (trimmed.startsWith('https://github.com/')) {
          normalizedSource = trimmed.replace('https://github.com/', '').replace(/\/$/, '');
        } else if (trimmed.startsWith('github.com/')) {
          normalizedSource = trimmed.replace('github.com/', '').replace(/\/$/, '');
        }

        const mapped = skills.map((s) => ({
          id: `${normalizedSource}/${s.name}`,
          slug: s.name,
          name: s.name,
          source: normalizedSource,
          installs: 0,
          url: `https://github.com/${normalizedSource}`,
          installUrl: `https://github.com/${normalizedSource}`,
          sourceType: 'github',
          isDuplicate: false,
          description: s.description,
        }));
        setRepoSkills(mapped);

        // If only one skill found, auto-select it
        if (mapped.length === 1) {
          setSelected(new Set([`${mapped[0].source}/${mapped[0].name}`]));
        }
      } else {
        setRepoSkills([]);
      }
    } catch (e) {
      const msg = String(e);
      console.error('Failed to query repo skills:', e);
      setErrorMsg(msg);
      setRepoSkills([]);
    } finally {
      setQuerying(false);
    }
  };

  const handleToggleSelect = (skill: RemoteSkill) => {
    const key = `${skill.source}/${skill.name}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleInstallSelected = async () => {
    if (selected.size === 0) return;

    setInstalling(true);
    setOutputLines([]);
    setInstallStatus('running');

    const selectedSkills = repoSkills.filter(
      (s) => selected.has(`${s.source}/${s.name}`)
    );

    let hasError = false;
    for (const skill of selectedSkills) {
      setOutputLines((prev) => [...prev, `$ Installing ${skill.name} from ${skill.source}...`]);
      try {
        await store.installSkillStreamed(skill.source, skill.name);
        setOutputLines((prev) => [
          ...prev,
          `[OK] ${skill.name}: Installed`,
        ]);
      } catch (e) {
        hasError = true;
        setOutputLines((prev) => [
          ...prev,
          `[ERROR] ${skill.name}: ${String(e)}`,
        ]);
      }
    }

    // Auto-refresh local skills list after installation
    setOutputLines((prev) => [...prev, '$ Refreshing local skills...']);
    try {
      await store.loadLocalSkills();
      setOutputLines((prev) => [...prev, '[OK] Local skills refreshed']);
    } catch {
      setOutputLines((prev) => [...prev, '[WARN] Failed to refresh local skills']);
    }

    setInstallStatus(hasError ? 'error' : 'success');
    setInstalling(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !querying) {
      handleQuery();
    }
  };

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Dialog panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-install-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 5 }}
            transition={{ type: 'spring', mass: 1, stiffness: 220, damping: 24 }}
            className="relative w-full max-w-lg bg-trae-sidebar border border-trae-border rounded-2xl shadow-hard-lg mx-4 max-h-[85vh] flex flex-col"
          >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-trae-border">
          <h2 id="custom-install-title" className="text-trae-text font-semibold text-base">自定义安装</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Input */}
          <div>
            <label htmlFor="custom-install-source" className="block text-xs text-trae-text-secondary mb-1.5">
              GitHub 仓库地址
            </label>
            <div className="flex gap-2">
              <input
                id="custom-install-source"
                ref={inputRef}
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="owner/repo 或 https://github.com/owner/repo"
                aria-label="GitHub 仓库地址"
                className="flex-1 bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-sm text-trae-text placeholder:text-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 transition-colors"
              />
              <button
                type="button"
                onClick={handleQuery}
                disabled={querying || !source.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {querying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                查询
              </button>
            </div>
            <p className="text-xs text-trae-text-secondary mt-1.5 opacity-70">
              支持 SKILL.md 在根目录或子目录的仓库
            </p>
          </div>

          {/* Loading */}
          {querying && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-trae-accent animate-spin" />
              <span className="ml-2 text-sm text-trae-text-secondary">正在扫描仓库...</span>
            </div>
          )}

          {/* Error message */}
          {!querying && errorMsg && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertCircle className="w-8 h-8 text-trae-danger mb-2" />
              <p className="text-sm text-trae-danger font-medium mb-1">查询失败</p>
              <p className="text-xs text-trae-text-secondary max-w-sm whitespace-pre-wrap">
                {errorMsg}
              </p>
              <button
                type="button"
                onClick={handleQuery}
                className="mt-3 text-xs text-trae-accent hover:underline"
              >
                重试
              </button>
            </div>
          )}

          {/* Results */}
          {!querying && !errorMsg && repoSkills.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-trae-text-secondary">
                找到 {repoSkills.length} 个 Skill{repoSkills.length === 1 ? '（已自动选中）' : ''}
              </p>
              {repoSkills.map((skill) => {
                const key = `${skill.source}/${skill.name}`;
                const isChecked = selected.has(key);
                return (
                  <div
                    key={key}
                    onClick={() => handleToggleSelect(skill)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-trae-accent/5 border-trae-accent/30'
                        : 'bg-trae-card/30 border-trae-border hover:border-trae-border-hover'
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onChange={() => handleToggleSelect(skill)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-trae-text font-medium">{skill.name}</div>
                      {skill.description && (
                        <p className="text-xs text-trae-text-secondary mt-0.5 line-clamp-2">
                          {skill.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty result */}
          {!querying && !errorMsg && source.trim() && repoSkills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-trae-text-secondary">
              <PackageOpen className="w-8 h-8 opacity-40 mb-2" />
              <p className="text-sm">未找到可安装的 Skill</p>
            </div>
          )}

          {/* Terminal output during installation */}
          {(installing || installStatus !== 'idle') && (
            <div className="space-y-2">
              <TerminalViewer outputLines={outputLines} status={installStatus} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-trae-border">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
          >
            关闭
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleInstallSelected}
              disabled={installing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {installing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              安装选中项 ({selected.size})
            </button>
          )}
        </div>
      </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
