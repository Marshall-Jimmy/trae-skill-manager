'use client';

import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Languages,
  Github,
  Star,
  Heart,
  TrendingUp,
  Database,
  Tag,
  Hash,
  ArrowUpCircle,
  CheckCircle,
  XCircle,
  Clock,
  GitFork,
  AlertCircle,
  Code,
  Scale,
} from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import { FileBrowser } from './FileBrowser';
import type { RemoteSkill, SkillFile, FileEntry, LocalSkill, RepoInfo } from '../types';

type DetailTab = 'overview' | 'docs' | 'files' | 'related';

interface SkillDetailPanelProps {
  skill: RemoteSkill | null;
  localSkill?: LocalSkill | null;
  onClose: () => void;
  onSkillClick?: (skill: RemoteSkill) => void;
}

// ─── Markdown renderer ────────────────────────────────────────────────────

/** Simple markdown-to-HTML renderer (no external deps) */
function renderMarkdown(md: string): string {
  let html = md;

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trimEnd();
    return `<pre class="bg-trae-bg/60 border border-trae-border rounded-lg p-3 my-3 overflow-x-auto text-xs"><code>${escaped}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<code class="bg-trae-bg/50 border border-trae-border px-1.5 py-0.5 rounded text-xs text-trae-accent">${escaped}</code>`;
  });

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-trae-accent hover:underline">$1</a>'
  );

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-trae-text font-semibold">$1</strong>');

  // h3: ### heading
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-trae-text font-medium text-sm mt-4 mb-1">$1</h3>');

  // h2: ## heading
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-trae-text font-semibold text-base mt-5 mb-1.5">$1</h2>');

  // h1: # heading
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-trae-text font-bold text-lg mt-5 mb-2">$1</h1>');

  // Unordered list items: - item or * item
  html = html.replace(/^[-*] (.+)$/gm, '<li class="text-trae-text/80 text-sm ml-4 list-disc">$1</li>');

  // Paragraphs: double newline
  html = html.replace(/\n\n/g, '</p><p class="text-trae-text/80 text-sm leading-relaxed my-2">');

  // Single newline -> br
  html = html.replace(/\n/g, '<br/>');

  // Wrap in paragraph
  html = `<div class="text-trae-text/80 text-sm leading-relaxed"><p class="my-2">${html}</p></div>`;

  return html;
}

// ─── Format helpers ───────────────────────────────────────────────────────

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDataSource(source?: string): string {
  switch (source) {
    case 'fallback':
      return '备用数据';
    case 'github-raw':
      return 'GitHub Raw';
    case 'github-api':
      return 'GitHub API';
    case 'npx':
      return 'npx';
    default:
      return source || '未知';
  }
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return '从未';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

// ─── File tree builder ────────────────────────────────────────────────────

interface BuildFileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: Record<string, BuildFileTreeNode>;
}

function buildFileTree(files: SkillFile[]): FileEntry[] {
  const root: Record<string, BuildFileTreeNode> = {};

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        // It's a file
        currentLevel[part] = {
          name: part,
          path: currentPath,
          isDir: false,
          size: file.contents?.length || 0,
          children: {},
        };
      } else {
        // It's a directory
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: currentPath,
            isDir: true,
            size: 0,
            children: {},
          };
        }
        currentLevel = currentLevel[part].children;
      }
    }
  }

  // Convert to FileEntry array format
  const convert = (nodes: Record<string, BuildFileTreeNode>): FileEntry[] => {
    return Object.values(nodes)
      .sort((a, b) => {
        // Directories first
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        const result: FileEntry = {
          name: node.name,
          path: node.path,
          isDir: node.isDir,
          size: node.size,
        };
        if (node.isDir && Object.keys(node.children).length > 0) {
          result.children = convert(node.children);
        }
        return result;
      });
  };

  return convert(root);
}

// ─── Tab variants ─────────────────────────────────────────────────────────

const tabContentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, mass: 1, stiffness: 200, damping: 24 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// ─── Main component ───────────────────────────────────────────────────────

export function SkillDetailPanel({ skill, localSkill, onClose, onSkillClick }: SkillDetailPanelProps) {
  const store = useSkillStore();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contentSource, setContentSource] = useState<string>('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [copyAllCopied, setCopyAllCopied] = useState(false);
  const [docContentMode, setDocContentMode] = useState<'skill' | 'readme'>('skill');
  const [hasReadme, setHasReadme] = useState(false);
  const [hasSkillMd, setHasSkillMd] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [skillMdContent, setSkillMdContent] = useState<string>('');

  const { config, getTranslatedDescription, fetchGithubReadme, detailSkill, detailLoading, fetchGithubRepoInfo, getRepoInfo } = useSkillStore();
  const translatedDesc = skill?.description ? getTranslatedDescription(skill.description) : undefined;
  const showTranslation = config.translation.enabled && translatedDesc;

  const isFav = skill ? store.isFavorite(skill.id) : false;

  const installCommand = useMemo(() => {
    if (!skill) return '';
    return `npx skills add ${skill.source}${skill.name !== skill.source.split('/').pop() ? ` --skill ${skill.name}` : ''}`;
  }, [skill]);

  const githubUrl = useMemo(() => {
    if (!skill) return '';
    if (skill.source.startsWith('http')) return skill.source;
    return `https://github.com/${skill.source}`;
  }, [skill]);

  // ── Fetch content on skill change ──────────────────────────────────────

  useEffect(() => {
    if (!skill) {
      setContent('');
      setContentSource('');
      setActiveTab('overview');
      setReadmeContent('');
      setSkillMdContent('');
      setHasReadme(false);
      setHasSkillMd(false);
      setDocContentMode('skill');
      return;
    }

    const fetchContent = async () => {
      setLoading(true);
      try {
        // For GitHub community skills, fetch both SKILL.md and README.md
        if (skill.sourceType === 'github') {
          // Try to get SKILL.md and README.md separately for toggle support
          let skillContent = '';
          let readmeContentStr = '';

          // Try SKILL.md at root level first (single-skill repos)
          try {
            skillContent = await invoke<string>('fetchGithubSkillMdRoot', { repoFullName: skill.source });
            setHasSkillMd(true);
          } catch {
            // No SKILL.md at root - try fetching via original method (which tries subdirs too)
            try {
              const fallbackContent = await fetchGithubReadme(skill.source);
              // This might be either SKILL.md or README.md
              skillContent = fallbackContent;
              setHasSkillMd(true);
            } catch {
              setHasSkillMd(false);
            }
          }

          // Try README.md separately
          try {
            readmeContentStr = await invoke<string>('fetchGithubReadmeOnly', { repoFullName: skill.source });
            setHasReadme(true);
          } catch {
            setHasReadme(false);
          }

          setSkillMdContent(skillContent);
          setReadmeContent(readmeContentStr);
          setContent(skillContent || readmeContentStr);
          setContentSource(skillContent ? 'SKILL.md' : 'README.md');
          setDocContentMode(skillContent ? 'skill' : 'readme');
        } else {
          // For official skills, use existing detail fetch
          await store.fetchSkillDetail(skill.source, skill.slug);
          const detail = useSkillStore.getState().detailSkill;
          if (detail && detail.files) {
            const skillMdFile = detail.files.find((f) => f.path.endsWith('SKILL.md'));
            const readmeFile = detail.files.find((f) => f.path.toLowerCase().endsWith('readme.md'));
            const skillContent = skillMdFile?.contents || '';
            const readmeContent = readmeFile?.contents || '';
            
            setSkillMdContent(skillContent);
            setReadmeContent(readmeContent);
            setHasSkillMd(!!skillContent);
            setHasReadme(!!readmeContent);
            
            setContent(skillContent || readmeContent);
            setContentSource(skillContent ? 'SKILL.md' : 'README.md');
            setDocContentMode(skillContent ? 'skill' : 'readme');
          } else {
            setContent('');
            setContentSource('');
          }
        }
      } catch {
        setContent('');
        setContentSource('');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [skill?.id]);

  // ── Fetch repo info on skill change ────────────────────────────────────

  useEffect(() => {
    if (!skill || skill.sourceType !== 'github') return;
    // Trigger repo info fetch (results stored in store cache)
    fetchGithubRepoInfo(skill.source);
  }, [skill?.id, skill?.source]);

  // ── Current displayed content based on doc mode ────────────────────────

  const displayedContent = docContentMode === 'readme' ? readmeContent : (skillMdContent || content);
  const displayedContentSource = docContentMode === 'readme' ? 'README.md' : (hasSkillMd ? 'SKILL.md' : contentSource);

  // ── Repo info helpers ──────────────────────────────────────────────────

  const repoInfo: RepoInfo | undefined = skill?.sourceType === 'github' ? getRepoInfo(skill.source) : undefined;

  // Common language colors (no new deps)
  const languageColors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Rust: '#dea584',
    Go: '#00ADD8',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
    Dart: '#00B4AB',
    Lua: '#000080',
  };

  const getLanguageColor = (lang: string) => languageColors[lang] || '#8b949e';

  // ── File tree & contents map (for Files tab) ──────────────────────────

  const fileTree = useMemo<FileEntry[]>(() => {
    if (!detailSkill?.files || detailSkill.files.length === 0) return [];
    return buildFileTree(detailSkill.files);
  }, [detailSkill?.files]);

  const fileContentsMap = useMemo<Record<string, string>>(() => {
    if (!detailSkill?.files) return {};
    const map: Record<string, string> = {};
    for (const f of detailSkill.files) {
      map[f.path] = f.contents;
    }
    return map;
  }, [detailSkill?.files]);

  // ── Related skills ─────────────────────────────────────────────────────

  const sameSourceSkills = useMemo<RemoteSkill[]>(() => {
    if (!skill) return [];
    const all = useSkillStore.getState().remoteSkills;
    return all
      .filter((s) => s.source === skill.source && s.id !== skill.id)
      .slice(0, 6);
  }, [skill?.id, skill?.source]);

  const recommendedSkills = useMemo<RemoteSkill[]>(() => {
    if (!skill) return [];
    const all = useSkillStore.getState().remoteSkills;
    // Sort by installs (popular), exclude current skill and same-source ones already shown
    const seen = new Set<string>([skill.id, ...sameSourceSkills.map((s) => s.id)]);
    return all
      .filter((s) => !seen.has(s.id))
      .sort((a, b) => b.installs - a.installs)
      .slice(0, 6);
  }, [skill?.id, sameSourceSkills]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(displayedContent);
      setCopyAllCopied(true);
      setTimeout(() => setCopyAllCopied(false), 2000);
    } catch {}
  };

  const handleInstall = async () => {
    if (!skill) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await store.installSkillStreamed(skill.source, skill.name);
    } catch (e) {
      const raw = typeof e === 'string' ? e : String(e);
      setInstallError(raw || '安装失败，请检查网络或仓库地址');
    }
    setInstalling(false);
  };

  const handleUpdate = async () => {
    if (!localSkill) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      await store.updateSkillStreamed(localSkill.path);
    } catch (e) {
      const raw = typeof e === 'string' ? e : String(e);
      setUpdateError(raw || '更新失败');
    }
    setUpdating(false);
  };

  const handleOpenGithub = () => {
    if (githubUrl) {
      window.open(githubUrl, '_blank', 'noreferrer');
    }
  };

  const handleToggleFavorite = () => {
    if (!skill) return;
    store.toggleFavorite(skill.id);
  };

  const handleRelatedSkillClick = (relatedSkill: RemoteSkill) => {
    if (onSkillClick) {
      onSkillClick(relatedSkill);
    }
  };

  const handleTabChange = (tab: DetailTab) => {
    setActiveTab(tab);
    // If switching to files tab and no detail data yet, fetch it
    if (tab === 'files' && skill && skill.sourceType !== 'github' && !detailSkill && !detailLoading) {
      store.fetchSkillDetail(skill.source, skill.slug);
    }
  };

  const renderedHtml = useMemo(() => (displayedContent ? renderMarkdown(displayedContent) : ''), [displayedContent]);

  // ── Render ─────────────────────────────────────────────────────────────

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: '概览' },
    { key: 'docs', label: '文档' },
    { key: 'files', label: '文件' },
    { key: 'related', label: '相关' },
  ];

  return (
    <AnimatePresence>
      {skill && (
        <>
          {/* Backdrop */}
          <motion.div
            key="detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="detail-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '30%', opacity: 0 }}
            transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 25 }}
            className="fixed top-0 right-0 z-50 w-[460px] h-screen bg-trae-sidebar border-l border-trae-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-trae-border shrink-0">
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-trae-text font-semibold text-lg truncate">{skill.name}</h2>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                    skill.sourceType === 'github' ? 'bg-trae-accent/10 text-trae-accent' : 'bg-trae-card/50 text-trae-text-secondary'
                  }`}>
                    {skill.sourceType === 'github' ? '社区' : '官方'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <button onClick={handleOpenGithub} className="flex items-center gap-1 text-xs text-trae-text-secondary hover:text-trae-accent transition-colors">
                    <Github className="w-3 h-3" />
                    <span className="truncate max-w-[200px]">{skill.source}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                  <span className="flex items-center gap-1 text-xs text-trae-text-secondary">
                    <Star className="w-3 h-3" />
                    {formatInstalls(skill.installs)}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="关闭详情"
                className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex items-center px-3 border-b border-trae-border shrink-0 bg-trae-sidebar">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-trae-accent'
                      : 'text-trae-text-secondary hover:text-trae-text'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="detail-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-trae-accent rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div
                    key="tab-overview"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full overflow-y-auto px-5 py-4"
                  >
                    {/* Translated description */}
                    {showTranslation && skill.description && (
                      <div className="mb-4 p-3 bg-trae-accent/5 border border-trae-accent/20 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-trae-accent mb-1">
                          <Languages className="w-3 h-3" />
                          翻译
                        </div>
                        <p className="text-xs text-trae-text leading-relaxed">{translatedDesc}</p>
                      </div>
                    )}

                    {/* Original description */}
                    {skill.description && (
                      <div className="mb-5">
                        <p className="text-sm text-trae-text/80 leading-relaxed">{skill.description}</p>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="flex gap-2 mb-5">
                      {localSkill ? (
                        <>
                          {store.hasUpdate(localSkill.path) ? (
                            <button
                              onClick={handleUpdate}
                              disabled={updating}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-all border border-orange-500/30"
                            >
                              {updating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ArrowUpCircle className="w-4 h-4" />
                              )}
                              {updating ? '更新中...' : '有新版本，点击更新'}
                            </button>
                          ) : (
                            <button
                              disabled
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-trae-success/10 text-trae-success border border-trae-success/20 cursor-default"
                            >
                              <CheckCircle className="w-4 h-4" />
                              已是最新版本
                            </button>
                          )}
                          <button
                            onClick={handleToggleFavorite}
                            aria-label={isFav ? '取消收藏' : '收藏'}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                              isFav
                                ? 'bg-trae-accent/15 text-trae-accent border-trae-accent/30'
                                : 'bg-trae-card/30 text-trae-text-secondary border-trae-border hover:text-trae-text hover:bg-trae-card/50'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                            {isFav ? '已收藏' : '收藏'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleInstall}
                            disabled={installing}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all"
                          >
                            {installing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            {installing ? '安装中...' : '安装'}
                          </button>
                          <button
                            onClick={handleToggleFavorite}
                            aria-label={isFav ? '取消收藏' : '收藏'}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                              isFav
                                ? 'bg-trae-accent/15 text-trae-accent border-trae-accent/30'
                                : 'bg-trae-card/30 text-trae-text-secondary border-trae-border hover:text-trae-text hover:bg-trae-card/50'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                            {isFav ? '已收藏' : '收藏'}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Update info banner (for installed skills) */}
                    {localSkill && store.hasUpdate(localSkill.path) && (
                      <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-orange-400 text-sm font-medium">
                          <ArrowUpCircle className="w-4 h-4" />
                          有新版本可用
                        </div>
                        <p className="text-xs text-orange-400/70 mt-1">
                          点击上方按钮更新到最新版本
                        </p>
                      </div>
                    )}

                    {/* Update error (for installed skills) */}
                    {localSkill && updateError && (
                      <div className="mb-4 p-3 bg-trae-danger/10 border border-trae-danger/30 rounded-lg">
                        <div className="flex items-center gap-2 text-trae-danger text-sm font-medium">
                          <XCircle className="w-4 h-4" />
                          更新失败
                        </div>
                        <p className="text-xs text-trae-danger/70 mt-1 font-mono">
                          {updateError}
                        </p>
                      </div>
                    )}

                    {/* Enhanced repo header (when repo info available) */}
                    {repoInfo && (
                      <div className="mb-3 bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-3">
                          <img
                            src={repoInfo.owner.avatarUrl}
                            alt={repoInfo.owner.login}
                            className="w-9 h-9 rounded-md border border-trae-border"
                          />
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={handleOpenGithub}
                              className="text-sm text-trae-text font-semibold hover:text-trae-accent transition-colors text-left truncate w-full flex items-center gap-1"
                            >
                              <span className="truncate">{repoInfo.fullName}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </button>
                            {repoInfo.description && (
                              <p className="text-xs text-trae-text-secondary mt-0.5 line-clamp-2">
                                {repoInfo.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1 text-trae-text-secondary">
                            <Star className="w-3 h-3" />
                            <span className="text-trae-text font-medium">{formatInstalls(repoInfo.stargazersCount)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-trae-text-secondary">
                            <GitFork className="w-3 h-3" />
                            <span className="text-trae-text font-medium">{formatInstalls(repoInfo.forksCount)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-trae-text-secondary">
                            <AlertCircle className="w-3 h-3" />
                            <span className="text-trae-text font-medium">{formatInstalls(repoInfo.openIssuesCount)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Meta info grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Source repo */}
                      {!repoInfo && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Github className="w-3 h-3" />
                            来源仓库
                          </div>
                          <button
                            onClick={handleOpenGithub}
                            className="text-xs text-trae-text font-medium hover:text-trae-accent transition-colors text-left truncate w-full flex items-center gap-1"
                          >
                            <span className="truncate">{skill.source}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </button>
                        </div>
                      )}

                      {/* Data source */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Database className="w-3 h-3" />
                          数据来源
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {formatDataSource(skill.dataSource)}
                        </p>
                      </div>

                      {/* Stars (with real data when available) */}
                      {!repoInfo && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Star className="w-3 h-3" />
                            Stars
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {skill.stars !== undefined ? formatInstalls(skill.stars) : '未知'}
                          </p>
                        </div>
                      )}

                      {/* Forks (only when repo info available) */}
                      {repoInfo && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <GitFork className="w-3 h-3" />
                            Forks
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {formatInstalls(repoInfo.forksCount)}
                          </p>
                        </div>
                      )}

                      {/* Language (only when repo info available) */}
                      {repoInfo && repoInfo.language && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Code className="w-3 h-3" />
                            主要语言
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: getLanguageColor(repoInfo.language) }}
                            />
                            <p className="text-xs text-trae-text font-medium">{repoInfo.language}</p>
                          </div>
                        </div>
                      )}

                      {/* License (only when repo info available) */}
                      {repoInfo && repoInfo.license?.spdxId && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Scale className="w-3 h-3" />
                            License
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {repoInfo.license.spdxId}
                          </p>
                        </div>
                      )}

                      {/* Installs */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <TrendingUp className="w-3 h-3" />
                          安装量
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {skill.installs > 0 ? formatInstalls(skill.installs) : '未知'}
                        </p>
                      </div>

                      {/* Skill type */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Tag className="w-3 h-3" />
                          技能类型
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {skill.sourceType === 'github' ? '社区技能' : '官方技能'}
                        </p>
                      </div>

                      {/* Last updated (only when repo info available) */}
                      {repoInfo && repoInfo.updatedAt && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Clock className="w-3 h-3" />
                            最后更新
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {formatTimeAgo(new Date(repoInfo.updatedAt).getTime())}
                          </p>
                        </div>
                      )}

                      {/* Skill ID */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Hash className="w-3 h-3" />
                          技能 ID
                        </div>
                        <p className="text-xs text-trae-text font-mono truncate" title={skill.id}>
                          {skill.id}
                        </p>
                      </div>

                      {/* Current version (for installed skills) */}
                      {localSkill && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Tag className="w-3 h-3" />
                            当前版本
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {localSkill.version || '未指定'}
                          </p>
                        </div>
                      )}

                      {/* Current hash (for installed skills) */}
                      {localSkill && store.updateCheckResults.get(localSkill.path)?.currentHash && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Hash className="w-3 h-3" />
                            当前 Hash
                          </div>
                          <p className="text-xs text-trae-text font-mono truncate" title={store.updateCheckResults.get(localSkill.path)?.currentHash}>
                            {store.updateCheckResults.get(localSkill.path)?.currentHash?.slice(0, 7)}...
                          </p>
                        </div>
                      )}

                      {/* Last checked (for installed skills) */}
                      {localSkill && store.updateCheckResults.get(localSkill.path) && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Clock className="w-3 h-3" />
                            上次检查
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {formatTimeAgo(store.updateCheckResults.get(localSkill.path)?.lastCheckedAt || 0)}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'docs' && (
                  <motion.div
                    key="tab-docs"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full overflow-y-auto px-5 py-4"
                  >
                    {/* Loading */}
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 text-trae-accent animate-spin" />
                        <span className="ml-2 text-sm text-trae-text-secondary">加载详情...</span>
                      </div>
                    ) : displayedContent ? (
                      <div>
                        {/* Header with source, toggle, and copy button */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* Doc source toggle (only when both available) */}
                            {(hasSkillMd && hasReadme) ? (
                              <div className="flex items-center bg-trae-card/30 border border-trae-border rounded-md p-0.5">
                                <button
                                  onClick={() => setDocContentMode('skill')}
                                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                    docContentMode === 'skill'
                                      ? 'bg-trae-accent/20 text-trae-accent'
                                      : 'text-trae-text-secondary hover:text-trae-text'
                                  }`}
                                >
                                  SKILL.md
                                </button>
                                <button
                                  onClick={() => setDocContentMode('readme')}
                                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                    docContentMode === 'readme'
                                      ? 'bg-trae-accent/20 text-trae-accent'
                                      : 'text-trae-text-secondary hover:text-trae-text'
                                  }`}
                                >
                                  README.md
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-trae-text-secondary font-medium">{displayedContentSource}</span>
                            )}
                          </div>
                          <button
                            onClick={handleCopyAll}
                            className="flex items-center gap-1 text-xs text-trae-text-secondary hover:text-trae-accent transition-colors"
                            title="复制全文"
                          >
                            {copyAllCopied ? (
                              <>
                                <Check className="w-3 h-3 text-trae-success" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                复制全文
                              </>
                            )}
                          </button>
                        </div>
                        <div
                          className="prose-sm"
                          dangerouslySetInnerHTML={{ __html: renderedHtml }}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-trae-text-secondary">
                        <p className="text-sm">暂无详情内容</p>
                        <button type="button" onClick={handleOpenGithub} className="mt-2 text-xs text-trae-accent hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          在 GitHub 上查看
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'files' && (
                  <motion.div
                    key="tab-files"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full overflow-hidden"
                  >
                    {detailLoading && !detailSkill ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-5 h-5 text-trae-accent animate-spin" />
                        <span className="ml-2 text-sm text-trae-text-secondary">加载文件列表...</span>
                      </div>
                    ) : fileTree.length > 0 ? (
                      <div className="h-full">
                        <FileBrowser
                          files={fileTree}
                          onFileSelect={() => {}}
                          fileContents={fileContentsMap}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-trae-text-secondary px-5">
                        <p className="text-sm text-center">暂无文件数据</p>
                        {skill.sourceType === 'github' && (
                          <p className="text-xs mt-1 text-center">社区技能暂不支持文件浏览</p>
                        )}
                        <button
                          type="button"
                          onClick={handleOpenGithub}
                          className="mt-3 text-xs text-trae-accent hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          在 GitHub 上查看
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'related' && (
                  <motion.div
                    key="tab-related"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full overflow-y-auto px-5 py-4 space-y-5"
                  >
                    {/* Same source skills */}
                    <div>
                      <h3 className="text-sm font-medium text-trae-text mb-2.5 flex items-center gap-1.5">
                        <Github className="w-3.5 h-3.5 text-trae-text-secondary" />
                        同来源的其他技能
                      </h3>
                      {sameSourceSkills.length > 0 ? (
                        <div className="space-y-1.5">
                          {sameSourceSkills.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleRelatedSkillClick(s)}
                              className="w-full text-left p-2.5 rounded-lg bg-trae-card/20 hover:bg-trae-card/40 border border-trae-border/50 hover:border-trae-border transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-trae-text font-medium group-hover:text-trae-accent transition-colors truncate">
                                  {s.name}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-trae-text-secondary shrink-0 ml-2">
                                  <Star className="w-2.5 h-2.5" />
                                  {formatInstalls(s.installs)}
                                </span>
                              </div>
                              {s.description && (
                                <p className="text-xs text-trae-text-secondary mt-1 line-clamp-2 leading-relaxed">
                                  {s.description}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-trae-text-secondary/70 py-2">
                          暂无同来源的其他技能
                        </div>
                      )}
                    </div>

                    {/* Recommended skills */}
                    <div>
                      <h3 className="text-sm font-medium text-trae-text mb-2.5 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-trae-text-secondary" />
                        你可能还喜欢
                      </h3>
                      {recommendedSkills.length > 0 ? (
                        <div className="space-y-1.5">
                          {recommendedSkills.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleRelatedSkillClick(s)}
                              className="w-full text-left p-2.5 rounded-lg bg-trae-card/20 hover:bg-trae-card/40 border border-trae-border/50 hover:border-trae-border transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-trae-text font-medium group-hover:text-trae-accent transition-colors truncate">
                                  {s.name}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-trae-text-secondary shrink-0 ml-2">
                                  <Star className="w-2.5 h-2.5" />
                                  {formatInstalls(s.installs)}
                                </span>
                              </div>
                              {s.description && (
                                <p className="text-xs text-trae-text-secondary mt-1 line-clamp-2 leading-relaxed">
                                  {s.description}
                                </p>
                              )}
                              <div className="flex items-center gap-1 mt-1.5">
                                <span className="text-[10px] text-trae-text-secondary/60 font-mono truncate">
                                  {s.source}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-trae-text-secondary/70 py-2">
                          暂无推荐
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer: install command + buttons */}
            <div className="shrink-0 px-5 py-4 border-t border-trae-border space-y-3 bg-trae-sidebar">
              {installError && (
                <div className="px-3 py-2 rounded-lg bg-trae-danger/10 border border-trae-danger/20 text-xs text-trae-danger">
                  {installError}
                </div>
              )}
              {localSkill && updateError && (
                <div className="px-3 py-2 rounded-lg bg-trae-danger/10 border border-trae-danger/20 text-xs text-trae-danger">
                  {updateError}
                </div>
              )}
              {/* Install command */}
              <div className="relative flex items-center gap-2">
                <code className="flex-1 bg-trae-bg border border-trae-border rounded-lg px-3 py-2 text-xs text-trae-accent font-mono truncate block">
                  {installCommand}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="复制安装命令"
                  className="p-2 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all shrink-0"
                  title="复制命令"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-trae-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenGithub}
                  aria-label="在 GitHub 上查看"
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                >
                  <Github className="w-4 h-4" aria-hidden="true" />
                  GitHub
                </button>
                {localSkill ? (
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={updating || !store.hasUpdate(localSkill.path)}
                    aria-busy={updating}
                    aria-label={updating ? '更新中' : '更新 Skill'}
                    className={`flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      updating
                        ? 'bg-orange-500/20 text-orange-400 cursor-wait'
                        : store.hasUpdate(localSkill.path)
                        ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 active:bg-orange-500/35 border border-orange-500/30'
                        : 'bg-trae-success/10 text-trae-success cursor-default border border-trae-success/20'
                    }`}
                  >
                    {updating ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : store.hasUpdate(localSkill.path) ? (
                      <ArrowUpCircle className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                    )}
                    {updating ? '更新中...' : store.hasUpdate(localSkill.path) ? '更新' : '已是最新'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={installing}
                    aria-busy={installing}
                    aria-label={installing ? '安装中' : '安装 Skill'}
                    className={`flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      installing
                        ? 'bg-trae-accent/20 text-trae-accent cursor-wait'
                        : 'bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 active:bg-trae-accent/35'
                    }`}
                  >
                    {installing ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download className="w-4 h-4" aria-hidden="true" />
                    )}
                    {installing ? '安装中...' : '安装'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
