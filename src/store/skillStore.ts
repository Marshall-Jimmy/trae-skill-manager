import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  RemoteSkill,
  LocalSkill,
  SkillDetail,
  RepoSkillInfo,
  FileEntry,
  InstallRecord,
  AppConfig,
  InstallOutputEvent,
  InstallResult,
  ApiResponse,
  RepoInfo,
  UpdateCheckResult,
  UpdateResult,
  SkillCategory,
  ViewMode,
  DiscoverTab,
  Project,
} from '../types';

// ─── Sort options ─────────────────────────────────────────────────────────

export type SortBy = 'installs' | 'stars' | 'name' | 'updated';

// ─── Active view ─────────────────────────────────────────────────────────

export type ActiveView = 'all-time' | 'trending' | 'browse' | 'installed' | 'history';

// ─── State ────────────────────────────────────────────────────────────────

interface BatchProgress {
  active: boolean;
  current: number;
  total: number;
  operation: 'install' | 'remove' | null;
  currentSkillName: string;
}

interface SkillState {
  // Remote skills
  remoteSkills: RemoteSkill[];
  trendingSkills: RemoteSkill[];
  remoteLoading: boolean;
  remoteError: string | null;

  // Local skills
  localSkills: LocalSkill[];
  localLoading: boolean;

  // Config
  config: AppConfig;

  // Selection
  selectedSkills: Set<string>;

  // Skill detail
  detailSkill: SkillDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  selectedRemoteSkill: RemoteSkill | null;

  // Repo skills
  repoSkills: RepoSkillInfo[];
  repoLoading: boolean;

  // History
  history: InstallRecord[];

  // Install output (streamed)
  installOutput: string[];

  // Pagination & sorting
  sortBy: SortBy;
  currentPage: number;
  hasMore: boolean;

  // Active view
  activeView: ActiveView;

  // Batch operation progress
  batchProgress: BatchProgress;

  // Filters
  filters: {
    source: string | null;
    minInstalls: number;
  };

  // Category & tag filters
  activeCategory: SkillCategory;
  selectedTags: string[];
  sourceFilters: string[];
  qualityFilter: 'all' | 'with-stars';

  // View mode
  viewMode: ViewMode;

  // Discover tab
  discoverTab: DiscoverTab;

  // Search mode (official | github)
  searchMode: 'official' | 'github';

  // Translations
  translations: Map<string, string>;
  translating: boolean;

  // GitHub community search
  githubSearchResults: RemoteSkill[];
  githubSearchLoading: boolean;
  githubSearchError: string | null;

  // GitHub repo readme content for detail panel
  githubReadme: string;
  githubReadmeLoading: boolean;

  // GitHub repo info cache (keyed by repo full name, with timestamps for 5-min TTL)
  repoInfoCache: Record<string, { data: RepoInfo; timestamp: number }>;
  repoInfoLoading: Set<string>;

  // Favorites
  favorites: string[];

  // Search history
  searchHistory: string[];

  // Update check results
  updateCheckResults: Map<string, UpdateCheckResult>;
  updateCheckLoading: boolean;
  updateCheckError: string | null;

  // Projects
  projects: Project[];
  currentProjectId: string | null;
  projectSkills: LocalSkill[];
  projectSkillsLoading: boolean;
}

// ─── Actions ──────────────────────────────────────────────────────────────

interface SkillActions {
  loadRemoteSkills: (view?: ActiveView) => Promise<void>;
  searchSkills: (query: string) => Promise<void>;
  fetchSkillDetail: (source: string, slug: string) => Promise<void>;
  setSelectedRemoteSkill: (skill: RemoteSkill | null) => void;
  listRepoSkills: (source: string) => Promise<RepoSkillInfo[]>;
  installSkillStreamed: (source: string, skillName: string, skillPathHint?: string) => Promise<void>;
  installSkill: (source: string, skillName: string, skillPathHint?: string) => Promise<{ success: boolean; message: string }>;
  loadLocalSkills: () => Promise<void>;
  removeSkill: (path: string) => Promise<boolean>;
  toggleSkill: (path: string) => Promise<void>;
  openFolder: (path: string) => Promise<void>;
  browseSkillFiles: (path: string) => Promise<FileEntry[]>;
  readFileContent: (path: string) => Promise<string>;
  getHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  addHistoryRecord: (record: InstallRecord) => Promise<void>;
  batchInstall: (skills: { source: string; skillName: string }[]) => Promise<{ total: number; succeeded: number; failed: number; results: { skillName: string; success: boolean; message: string }[] }>;
  batchRemove: (paths: string[]) => Promise<{ total: number; succeeded: number; failed: number; results: { skillName: string; success: boolean; message: string }[] }>;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AppConfig) => Promise<void>;
  toggleSelectSkill: (id: string) => void;
  clearSelection: () => void;
  setSortBy: (sort: SortBy) => void;
  loadMore: () => Promise<void>;
  setFilter: (key: 'source' | 'minInstalls', value: string | number | null) => void;
  clearFilters: () => void;
  getFilteredSkills: () => RemoteSkill[];

  // Category actions
  setCategory: (category: SkillCategory) => void;
  getSkillCategory: (skill: RemoteSkill) => SkillCategory;
  getSkillsByCategory: (category: SkillCategory) => RemoteSkill[];

  // Tag actions
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  getPopularTags: (limit?: number) => { tag: string; count: number }[];
  generateSkillTags: (skill: RemoteSkill) => string[];

  // Source filter (multi-select)
  toggleSourceFilter: (source: string) => void;
  setSourceFilters: (sources: string[]) => void;

  // Quality filter
  setQualityFilter: (filter: 'all' | 'with-stars') => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;

  // Discover tab
  setDiscoverTab: (tab: DiscoverTab) => void;

  // Search mode
  setSearchMode: (mode: 'official' | 'github') => void;

  // Enhanced filtered skills (combines all filters)
  getEnhancedFilteredSkills: () => RemoteSkill[];

  // Translation actions
  translateSkills: (skills: RemoteSkill[]) => Promise<void>;
  getTranslatedDescription: (original: string) => string | undefined;
  translateText: (text: string) => Promise<string | undefined>;
  clearTranslations: () => void;

  // GitHub community search actions
  searchGithubSkills: (query: string) => Promise<void>;
  searchGithubRepos: (query: string) => Promise<void>;
  clearGithubSearch: () => void;
  fetchGithubReadme: (repoFullName: string) => Promise<string>;
  fetchGithubRepoInfo: (repoFullName: string) => Promise<RepoInfo | null>;
  fetchGithubReposInfoBatch: (repoFullNames: string[]) => Promise<Record<string, RepoInfo>>;
  getRepoInfo: (repoFullName: string) => RepoInfo | undefined;
  isRepoInfoLoading: (repoFullName: string) => boolean;

  // Search history actions
  addSearchHistory: (query: string) => void;
  removeSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  getSearchSuggestions: (query: string) => RemoteSkill[];
  getHotSearches: () => string[];

  // Favorites actions
  toggleFavorite: (skillId: string) => void;
  isFavorite: (skillId: string) => boolean;

  // Update actions
  checkUpdates: (skillPaths?: string[]) => Promise<void>;
  updateSkill: (skillPath: string) => Promise<UpdateResult | null>;
  updateSkillStreamed: (skillPath: string) => Promise<void>;
  rollbackSkill: (skillPath: string) => Promise<UpdateResult | null>;
  batchUpdate: (skillPaths: string[]) => Promise<{ total: number; succeeded: number; failed: number; results: { skillName: string; success: boolean; message: string }[] }>;
  getUpdatableCount: () => number;
  hasUpdate: (skillPath: string) => boolean;

  // Project actions
  loadProjects: () => void;
  addProject: (projectPath: string) => Promise<Project | null>;
  removeProject: (projectId: string) => void;
  switchProject: (projectId: string | null) => void;
  renameProject: (projectId: string, newName: string) => void;
  loadProjectSkills: (projectPath: string) => Promise<void>;
  getCurrentProject: () => Project | null;
  getCurrentSkillsPath: () => string;
  installSkillToTarget: (source: string, skillName: string, targetPath: string, skillPathHint?: string) => Promise<{ success: boolean; message: string }>;
  installSkillStreamedToTarget: (source: string, skillName: string, targetPath: string, skillPathHint?: string) => Promise<void>;
  refreshProjectSkillCount: (projectId: string) => Promise<void>;
}

// ─── Default config (used for merging partial saves) ──────────────────────

const DEFAULT_CONFIG: AppConfig = {
  globalSkillsPath: '',
  projectPath: '',
  theme: 'dark',
  translation: {
    enabled: false,
    targetLanguage: 'zh',
    apiKey: '',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    useImmersive: false,
  },
  github: {
    token: '',
  },
};

// ─── Search history helpers ───────────────────────────────────────────────

const SEARCH_HISTORY_KEY = 'trae-skill-manager-search-history';
const MAX_SEARCH_HISTORY = 20;
const MAX_SUGGESTIONS = 8;
const MAX_HOT_SEARCHES = 5;
const DEFAULT_HOT_SEARCHES = ['web-search', 'github', 'postgres', 'slack', 'notion'];

function loadSearchHistory(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => typeof s === 'string').slice(0, MAX_SEARCH_HISTORY);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveSearchHistory(history: string[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

// ─── Favorites helpers ───────────────────────────────────────────────────

const FAVORITES_KEY = 'trae-skill-manager-favorites';

function loadFavorites(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => typeof s === 'string');
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveFavorites(favorites: string[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // ignore
  }
}

// ─── Session state helpers (restore last page/filter state on restart) ────

const SESSION_STATE_KEY = 'trae-skill-manager-session-state';

function loadSessionState(): { sortBy: SortBy; viewMode: ViewMode; discoverTab: DiscoverTab } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      sortBy: ['installs', 'stars', 'name', 'updated'].includes(parsed.sortBy) ? parsed.sortBy : 'installs',
      viewMode: ['grid', 'list'].includes(parsed.viewMode) ? parsed.viewMode : 'grid',
      discoverTab: ['all', 'trending', 'recent', 'favorites'].includes(parsed.discoverTab) ? parsed.discoverTab : 'all',
    };
  } catch {
    return null;
  }
}

function saveSessionState(state: { sortBy: SortBy; viewMode: ViewMode; discoverTab: DiscoverTab }): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const initialSessionState = loadSessionState();

// ─── Translation cache helpers (persisted, language-aware) ───────────────

const TRANSLATION_CACHE_KEY = 'trae-skill-manager-translation-cache';

function readTranslationCache(): { language: string; entries: Record<string, string> } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.language === 'string' && parsed.entries && typeof parsed.entries === 'object') {
      return { language: parsed.language, entries: parsed.entries };
    }
  } catch {
    // ignore
  }
  return null;
}

function loadTranslationCacheForLanguage(lang: string): Map<string, string> {
  const cached = readTranslationCache();
  if (cached && cached.language === lang) {
    return new Map(Object.entries(cached.entries));
  }
  return new Map();
}

function saveTranslationCache(map: Map<string, string>, lang: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      TRANSLATION_CACHE_KEY,
      JSON.stringify({ language: lang, entries: Object.fromEntries(map) })
    );
  } catch {
    // ignore
  }
}

// ─── Projects helpers ─────────────────────────────────────────────────────

const PROJECTS_STORAGE_KEY = 'trae-skill-manager-projects';

function loadProjects(): Project[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((p: any) => p && typeof p.id === 'string' && typeof p.path === 'string');
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveProjects(projects: Project[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

/** Generate a simple hash-based ID from a path */
function hashPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'proj_' + Math.abs(hash).toString(36);
}

/** Extract directory name from a path */
function getDirName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

// ─── Category & Tag Heuristics ───────────────────────────────────────────

/** Keyword-based category mapping rules */
const CATEGORY_KEYWORDS: Record<Exclude<SkillCategory, 'all' | 'more'>, string[]> = {
  'dev-tools': [
    'code', 'dev', 'debug', 'test', 'git', 'github', 'repo', 'repository',
    'build', 'deploy', 'ci', 'cd', 'docker', 'kubernetes', 'k8s',
    'api', 'rest', 'graphql', 'cli', 'terminal', 'shell', 'command',
    'search', 'web-search', 'browser', 'web', 'http', 'curl',
    'react', 'vue', 'svelte', 'next', 'typescript', 'javascript',
    'python', 'rust', 'go', 'java', 'ruby', 'php', 'swift', 'kotlin',
    'postgres', 'mysql', 'sql', 'database', 'redis', 'mongodb',
    'linter', 'formatter', 'prettier', 'eslint',
    'copilot', 'agent', 'automation',
  ],
  'office': [
    'doc', 'docx', 'pdf', 'xlsx', 'excel', 'spreadsheet', 'ppt', 'pptx',
    'slide', 'presentation', 'email', 'mail', 'calendar', 'meeting',
    'word', 'document', 'office', 'sheets', 'gmail', 'outlook',
    'google docs', 'google drive', 'notion', 'slack', 'teams',
    '翻译', 'translate', 'translation',
    '笔记', 'note', 'notes', 'writing', 'write',
  ],
  'data': [
    'data', 'analytics', 'analysis', 'visualization', 'chart', 'graph',
    'database', 'sql', 'query', 'etl', 'pipeline',
    'csv', 'json', 'excel', 'pandas', 'numpy',
    'machine learning', 'ml', 'ai model', 'model',
    'statistics', 'stats', 'report', 'dashboard',
    'tableau', 'power bi', 'matplotlib', 'd3',
  ],
  'creative': [
    'design', 'graphic', 'ui', 'ux', 'figma', 'sketch', 'photoshop',
    'image', 'photo', 'picture', 'canvas', 'illustration',
    'copywriting', 'copy', '文案', '营销', 'marketing',
    'brand', 'branding', 'logo', 'poster', 'banner',
    'video', 'audio', 'music', 'sound',
    'creative', 'art', 'artist',
    '生成', 'generate', 'generation', 'midjourney', 'dalle', 'stable diffusion',
  ],
  'social': [
    'social', 'twitter', 'tweet', 'x.com', 'facebook', 'instagram',
    'linkedin', 'tiktok', 'youtube', 'weibo', 'wechat',
    '社交媒体', '社媒', '小红书', 'b站', 'bilibili',
    'content', '内容', 'post', '发布',
    'seo', 'growth', 'hacker', 'viral',
    'community', '论坛', 'discord', 'telegram',
  ],
  'system': [
    'file', 'filesystem', 'folder', 'directory', 'path',
    'terminal', 'shell', 'bash', 'zsh', 'command', 'cmd',
    'system', 'os', '操作系统', 'window', 'mac', 'linux',
    'backup', 'restore', 'sync', 'storage', 'disk',
    'process', 'task', 'monitor', 'performance',
    'network', 'wifi', 'bluetooth', 'usb',
    'security', 'encrypt', 'decrypt', 'password',
  ],
  'ai-enhanced': [
    'memory', '记忆', 'recall', 'rag', 'knowledge',
    'reason', '推理', 'think', 'thinking',
    'agent', 'autonomous', 'multi-agent', 'crew',
    'prompt', 'prompting', '提示词',
    'llm', 'gpt', 'claude', 'gemini',
    'embedding', 'vector', 'semantic',
    'summarize', 'summary', '总结',
    'translation', '翻译',
    'enhance', '增强', 'improve',
  ],
};

/** Known repo-to-category mappings */
const REPO_CATEGORY_MAP: Record<string, SkillCategory> = {
  // Anthropics skills
  'anthropics/skills': 'office', // Default for anthropics - many office tools
  // Vercel
  'vercel-labs/': 'dev-tools',
  'vercel/': 'dev-tools',
  // Google
  'google/': 'dev-tools',
  'google-gemini/': 'ai-enhanced',
  // Specific known skills
};

/**
 * Determine the category of a skill based on heuristics.
 */
export function getSkillCategory(skill: RemoteSkill): SkillCategory {
  const name = skill.name.toLowerCase();
  const desc = (skill.description || '').toLowerCase();
  const source = skill.source.toLowerCase();

  // 1. Check by repo path (most specific first)
  for (const [repoPrefix, category] of Object.entries(REPO_CATEGORY_MAP)) {
    if (source.startsWith(repoPrefix) || source.includes(repoPrefix)) {
      // For anthropics, refine based on skill name
      if (repoPrefix === 'anthropics/skills') {
        if (['pdf', 'docx', 'xlsx', 'ppt', 'pptx', 'doc', 'excel', 'sheet', 'slide', 'email', 'mail', 'calendar', 'meeting', 'notes', 'notion'].some(k => name.includes(k) || desc.includes(k))) {
          return 'office';
        }
        if (['web-search', 'github', 'git', 'code', 'dev', 'terminal', 'shell', 'cli', 'api', 'http'].some(k => name.includes(k) || desc.includes(k))) {
          return 'dev-tools';
        }
        if (['data', 'sql', 'database', 'analytics', 'chart', 'visualization'].some(k => name.includes(k) || desc.includes(k))) {
          return 'data';
        }
        if (['memory', 'rag', 'knowledge', 'reason', 'agent', 'prompt', 'llm'].some(k => name.includes(k) || desc.includes(k))) {
          return 'ai-enhanced';
        }
        return 'office'; // Default anthropics = office
      }
      return category;
    }
  }

  // 2. Check by name + description keywords
  const categoryScores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (name.includes(kw)) score += 3; // Name match is stronger
      if (desc.includes(kw)) score += 1;
    }
    categoryScores[category] = score;
  }

  // Find the highest scoring category
  let bestCategory: SkillCategory = 'more';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat as SkillCategory;
    }
  }

  // Need at least a minimum score to categorize
  if (bestScore >= 2) {
    return bestCategory;
  }

  // 3. Fallback by source type
  if (skill.sourceType === 'github') {
    // Try to infer from repo language/topic patterns
    if (source.includes('awesome')) return 'dev-tools';
    if (source.includes('design') || source.includes('ui') || source.includes('ux')) return 'creative';
  }

  return 'more';
}

/**
 * Generate tags for a skill based on heuristics.
 */
export function generateSkillTags(skill: RemoteSkill): string[] {
  const tags: string[] = [];
  const name = skill.name.toLowerCase();
  const desc = (skill.description || '').toLowerCase();
  const source = skill.source.toLowerCase();

  // Source/type tags
  if (skill.sourceType === 'github') {
    tags.push('社区');
  } else {
    tags.push('官方');
  }

  // Functionality tags based on keywords
  const tagRules: { tag: string; keywords: string[] }[] = [
    { tag: '搜索', keywords: ['search', '搜索', 'find', '查找', 'web-search'] },
    { tag: '代码', keywords: ['code', '代码', 'dev', '开发', 'program', '编程', 'script'] },
    { tag: '文档', keywords: ['doc', '文档', 'document', 'pdf', 'docx', 'notion', 'note'] },
    { tag: '数据', keywords: ['data', '数据', 'database', 'sql', 'excel', 'csv', 'analytics'] },
    { tag: 'AI', keywords: ['ai', 'llm', 'gpt', 'claude', 'gemini', '人工智能', 'agent', '智能体'] },
    { tag: '效率', keywords: ['productivity', '效率', 'automate', '自动化', 'workflow', '工作流'] },
    { tag: '设计', keywords: ['design', '设计', 'ui', 'ux', 'graphic', 'image', '图片'] },
    { tag: '翻译', keywords: ['translate', '翻译', 'translation', 'language'] },
    { tag: 'Git', keywords: ['git', 'github', 'repo', 'repository', '版本控制'] },
    { tag: '终端', keywords: ['terminal', 'shell', 'cli', 'command', 'bash', '终端', '命令行'] },
    { tag: '邮件', keywords: ['email', 'mail', 'gmail', 'outlook', '邮件'] },
    { tag: '会议', keywords: ['meeting', '会议', 'calendar', '日程', 'zoom', 'teams'] },
    { tag: '可视化', keywords: ['chart', 'graph', 'visual', '可视化', 'dashboard', '图表'] },
    { tag: '营销', keywords: ['marketing', '营销', 'social', 'social media', '推广'] },
    { tag: '记忆', keywords: ['memory', '记忆', 'rag', 'knowledge', '知识'] },
    { tag: '推理', keywords: ['reason', '推理', 'think', '思考'] },
    { tag: '文件', keywords: ['file', '文件', 'folder', '目录', 'filesystem'] },
    { tag: '表格', keywords: ['excel', 'xlsx', 'spreadsheet', 'sheet', '表格'] },
    { tag: '演示', keywords: ['ppt', 'pptx', 'slide', 'presentation', '演示', '幻灯片'] },
    { tag: '网页', keywords: ['web', 'browser', 'html', '网页', '网站', 'http'] },
    { tag: 'API', keywords: ['api', 'rest', 'http', '接口'] },
    { tag: '测试', keywords: ['test', '测试', 'debug', '调试', 'qa'] },
    { tag: '部署', keywords: ['deploy', '部署', 'devops', 'ci/cd', 'ci', 'cd'] },
  ];

  for (const rule of tagRules) {
    let matchCount = 0;
    for (const kw of rule.keywords) {
      if (name.includes(kw)) matchCount += 2;
      if (desc.includes(kw)) matchCount += 1;
    }
    if (matchCount >= 2) {
      tags.push(rule.tag);
    }
  }

  // Add source-based tag
  const owner = source.split('/')[0];
  if (owner && owner !== 'anthropics') {
    // Only add if it's a well-known source
    const knownSources = ['vercel', 'google', 'microsoft', 'openai', 'anthropic'];
    if (knownSources.some(s => owner.includes(s))) {
      tags.push(owner);
    }
  }

  // If no specific tags were generated beyond the source type, add a generic one
  if (tags.length <= 1) {
    const category = getSkillCategory(skill);
    const categoryTagMap: Record<string, string> = {
      'dev-tools': '开发',
      'office': '办公',
      'data': '数据',
      'creative': '创意',
      'social': '社媒',
      'system': '系统',
      'ai-enhanced': 'AI',
    };
    if (categoryTagMap[category]) {
      tags.push(categoryTagMap[category]);
    }
  }

  return [...new Set(tags)].slice(0, 6); // Deduplicate, max 6 tags
}

/**
 * Get effective tags for a skill (uses skill.tags if available, otherwise generates them).
 */
export function getSkillTags(skill: RemoteSkill): string[] {
  if (skill.tags && skill.tags.length > 0) {
    return skill.tags;
  }
  return generateSkillTags(skill);
}

function mergeConfig(partial: Partial<AppConfig> | AppConfig): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    translation: {
      ...DEFAULT_CONFIG.translation,
      ...(partial.translation || {}),
    },
    github: {
      ...DEFAULT_CONFIG.github,
      ...(partial.github || {}),
    },
  };
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useSkillStore = create<SkillState & SkillActions>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────

  remoteSkills: [],
  trendingSkills: [],
  remoteLoading: true, // Start true for first render loading state
  remoteError: null,

  localSkills: [],
  localLoading: false,

  config: DEFAULT_CONFIG,

  selectedSkills: new Set<string>(),

  detailSkill: null,
  detailLoading: false,
  detailError: null,
  selectedRemoteSkill: null,

  repoSkills: [],
  repoLoading: false,

  history: [],

  installOutput: [],

  sortBy: initialSessionState?.sortBy ?? 'installs',
  currentPage: 0,
  hasMore: false,

  activeView: 'all-time',

  batchProgress: {
    active: false,
    current: 0,
    total: 0,
    operation: null,
    currentSkillName: '',
  },

  filters: {
    source: null,
    minInstalls: 0,
  },

  activeCategory: 'all',
  selectedTags: [],
  sourceFilters: [],
  qualityFilter: 'all',
  viewMode: initialSessionState?.viewMode ?? 'grid',
  discoverTab: initialSessionState?.discoverTab ?? 'all',
  searchMode: 'official',

  translations: loadTranslationCacheForLanguage(DEFAULT_CONFIG.translation.targetLanguage),
  translating: false,

  githubSearchResults: [],
  githubSearchLoading: false,
  githubSearchError: null,

  githubReadme: '',
  githubReadmeLoading: false,

  repoInfoCache: {},
  repoInfoLoading: new Set<string>(),

  searchHistory: loadSearchHistory(),
  favorites: loadFavorites(),

  // Update check state
  updateCheckResults: new Map<string, UpdateCheckResult>(),
  updateCheckLoading: false,
  updateCheckError: null,

  // Project state
  projects: loadProjects(),
  currentProjectId: null,
  projectSkills: [],
  projectSkillsLoading: false,

  // ── Actions ────────────────────────────────────────────────────────────

  loadRemoteSkills: async (view?: ActiveView) => {
    const activeView = view ?? 'trending';
    set({ remoteLoading: true, remoteError: null, currentPage: 0, activeView });
    try {
      const res = await invoke<ApiResponse<RemoteSkill[]>>('fetch_skills', {
        view: view ?? null,
        page: 0,
        perPage: 30,
      });
      const skills = res.data ?? [];
      const pagination = res.pagination;
      set({
        remoteSkills: skills,
        trendingSkills: view === 'trending' || !view ? skills : get().trendingSkills,
        remoteLoading: false,
        hasMore: pagination?.hasMore ?? false,
      });

      // Enrich with real GitHub stars if token is configured (background, no blocking)
      const githubToken = get().config.github.token;
      const targetView = view ?? 'trending';
      if (githubToken && (targetView === 'trending' || targetView === 'browse')) {
        const uniqueRepos = [...new Set(
          skills.filter((s) => s.sourceType === 'github').map((s) => s.source)
        )];
        if (uniqueRepos.length > 0) {
          get()
            .fetchGithubReposInfoBatch(uniqueRepos)
            .then((repoInfos) => {
              const enrichedSkills = skills
                .map((skill) => {
                  if (skill.sourceType === 'github') {
                    const info = repoInfos[skill.source];
                    if (info) {
                      return { ...skill, stars: info.stargazersCount };
                    }
                  }
                  return skill;
                })
                .sort((a, b) => {
                  const aStars = a.stars ?? -1;
                  const bStars = b.stars ?? -1;
                  // Skills with real stars first (descending), those without at end
                  if (aStars === -1 && bStars === -1) return 0;
                  if (aStars === -1) return 1;
                  if (bStars === -1) return -1;
                  return bStars - aStars;
                });
              
              if (targetView === 'trending' || !view) {
                set({ trendingSkills: enrichedSkills });
              }
              if (targetView === 'browse' || !view) {
                set({ remoteSkills: enrichedSkills });
              }
            })
            .catch((e) => {
              console.warn('Failed to enrich with GitHub stars:', e);
            });
        }
      }
    } catch (e) {
      const errorMsg = String(e);
      console.error('Failed to fetch remote skills:', e);
      set({
        remoteSkills: [],
        trendingSkills: view === 'trending' || !view ? [] : get().trendingSkills,
        remoteLoading: false,
        hasMore: false,
        remoteError: errorMsg.includes('rate limit') || errorMsg.includes('速率限制')
          ? 'GitHub API 速率限制，请稍后再试'
          : errorMsg.includes('无法获取') || errorMsg.includes('网络')
          ? errorMsg
          : '加载失败，请检查网络连接',
      });
    }
  },

  searchSkills: async (query: string) => {
    set({ remoteLoading: true, remoteError: null });
    try {
      const res = await invoke<ApiResponse<RemoteSkill[]>>('search_skills', {
        query,
        limit: 50,
      });
      set({
        remoteSkills: res.data ?? [],
        remoteLoading: false,
        hasMore: false,
      });
    } catch (e) {
      console.error('Failed to search skills:', e);
      set({
        remoteSkills: [],
        remoteLoading: false,
        remoteError: String(e),
        hasMore: false,
      });
    }
  },

  fetchSkillDetail: async (source: string, slug: string) => {
    set({ detailLoading: true, detailSkill: null, detailError: null });
    try {
      const detail = await invoke<SkillDetail>('fetch_skill_detail', { source, slug });
      set({ detailSkill: detail, detailLoading: false });
    } catch (e) {
      console.error('Failed to fetch skill detail:', e);
      set({ detailLoading: false, detailSkill: null, detailError: String(e) });
    }
  },

  setSelectedRemoteSkill: (skill: RemoteSkill | null) => {
    set({ selectedRemoteSkill: skill });
  },

  listRepoSkills: async (source: string) => {
    set({ repoLoading: true, repoSkills: [] });
    try {
      const skills = await invoke<RepoSkillInfo[]>('list_repo_skills', { source });
      set({ repoSkills: skills, repoLoading: false });
      return skills;
    } catch (e) {
      console.error('Failed to list repo skills:', e);
      set({ repoLoading: false });
      throw e;
    }
  },

  installSkillStreamed: async (source: string, skillName: string, skillPathHint?: string) => {
    set({ installOutput: [] });

    let unlisten: UnlistenFn | undefined;

    try {
      // Listen for install-output events from the backend
      unlisten = await listen<InstallOutputEvent>('install-output', (event) => {
        const payload = event.payload;
        set((state) => ({
          installOutput: [...state.installOutput, payload.data],
        }));
      });

      // Invoke the streaming install command with configured target path
      const config = get().config;
      const result = await invoke<InstallResult>('install_skill_streamed', {
        source,
        skillName,
        targetPath: config.globalSkillsPath || undefined,
        skillPathHint: skillPathHint || undefined,
      });
      set({ localSkills: result.localSkills });
    } catch (e) {
      set((state) => ({
        installOutput: [...state.installOutput, `Error: ${String(e)}`],
      }));
      throw e;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  installSkill: async (source: string, skillName: string, skillPathHint?: string) => {
    try {
      const config = get().config;
      const result = await invoke<InstallResult>('install_skill_streamed', {
        source,
        skillName,
        targetPath: config.globalSkillsPath || undefined,
        skillPathHint: skillPathHint || undefined,
      });
      // Update local skills from result
      set({ localSkills: result.localSkills });
      return { success: result.success, message: result.error || `Successfully installed ${skillName}` };
    } catch (e) {
      return { success: false, message: String(e) };
    }
  },

  loadLocalSkills: async () => {
    set({ localLoading: true });
    try {
      const config = get().config;
      const skills = await invoke<LocalSkill[]>('scan_local_skills', {
        path: config.globalSkillsPath || '',
      });
      set({ localSkills: skills, localLoading: false });
    } catch (e) {
      console.error('Failed to load local skills:', e);
      set({ localLoading: false });
    }
  },

  removeSkill: async (path: string) => {
    try {
      await invoke('remove_skill', { path });
      // Reload local skills after remove
      const config = get().config;
      if (config.globalSkillsPath) {
        const skills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills: skills });
      }
      return true;
    } catch (e) {
      console.error('Failed to remove skill:', e);
      return false;
    }
  },

  toggleSkill: async (path: string) => {
    try {
      const result = await invoke<{ enabled: boolean; path: string }>('toggle_skill', { skillPath: path });
      // Update local state immediately
      set({
        localSkills: get().localSkills.map(skill =>
          skill.path === path ? { ...skill, enabled: result.enabled } : skill
        )
      });
      // Still do full scan to ensure consistency
      const config = get().config;
      if (config.globalSkillsPath) {
        const skills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills: skills });
      }
    } catch (e) {
      console.error('Failed to toggle skill:', e);
    }
  },

  openFolder: async (path: string) => {
    try {
      await invoke('open_folder', { path });
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  },

  browseSkillFiles: async (path: string) => {
    return await invoke<FileEntry[]>('browse_skill_files', { path });
  },

  readFileContent: async (path: string) => {
    return await invoke<string>('read_file_content', { path });
  },

  getHistory: async () => {
    try {
      const records = await invoke<InstallRecord[]>('get_history');
      set({ history: records });
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  },

  clearHistory: async () => {
    try {
      await invoke('clear_history');
      set({ history: [] });
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  },

  addHistoryRecord: async (record: InstallRecord) => {
    try {
      await invoke('add_history_record', { record });
      set((state) => ({ history: [record, ...state.history] }));
    } catch (e) {
      console.error('Failed to add history record:', e);
    }
  },

  batchInstall: async (skills: { source: string; skillName: string }[]) => {
    set({
      batchProgress: {
        active: true,
        current: 0,
        total: skills.length,
        operation: 'install',
        currentSkillName: '',
      },
    });

    const results: { skillName: string; success: boolean; message: string }[] = [];
    let completed = 0;

    // Serial queue: install one at a time so a single failure doesn't corrupt
    // concurrent git/npx processes, and progress stays predictable.
    for (const { source, skillName } of skills) {
      set({ batchProgress: { ...get().batchProgress, currentSkillName: skillName } });
      try {
        const config = get().config;
        await invoke<InstallResult>('install_skill_streamed', {
          source,
          skillName,
          targetPath: config.globalSkillsPath || undefined,
          skillPathHint: undefined,
        });
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });
        results.push({ skillName, success: true, message: 'Installed' });
      } catch (e) {
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });
        results.push({ skillName, success: false, message: String(e) });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    // Reload local skills after batch install
    const config = get().config;
    if (config.globalSkillsPath) {
      try {
        const localSkills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills });
      } catch {
        // ignore
      }
    }

    set({
      batchProgress: {
        active: false,
        current: 0,
        total: 0,
        operation: null,
        currentSkillName: '',
      },
    });

    return { total: skills.length, succeeded, failed, results };
  },

  batchRemove: async (paths: string[]) => {
    set({
      batchProgress: {
        active: true,
        current: 0,
        total: paths.length,
        operation: 'remove',
        currentSkillName: '',
      },
    });

    const results: { skillName: string; success: boolean; message: string }[] = [];
    let completed = 0;

    const removePromises = paths.map(async (path) => {
      set({ batchProgress: { ...get().batchProgress, currentSkillName: path } });
      try {
        await invoke('remove_skill', { path });
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });
        return { skillName: path, success: true, message: 'Removed' };
      } catch (e) {
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });
        return { skillName: path, success: false, message: String(e) };
      }
    });

    const settled = await Promise.allSettled(removePromises);
    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    // Reload local skills after batch remove
    const config = get().config;
    if (config.globalSkillsPath) {
      try {
        const localSkills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills });
      } catch {
        // ignore
      }
    }

    set({
      batchProgress: {
        active: false,
        current: 0,
        total: 0,
        operation: null,
        currentSkillName: '',
      },
    });

    return { total: paths.length, succeeded, failed, results };
  },

  loadConfig: async () => {
    try {
      const config = await invoke<AppConfig>('get_config');
      const merged = mergeConfig(config);
      set({
        config: merged,
        translations: loadTranslationCacheForLanguage(merged.translation.targetLanguage),
      });
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  },

  updateConfig: async (config: AppConfig) => {
    const merged = mergeConfig(config);
    try {
      await invoke('save_config', { config: merged });
      set({ config: merged });
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  },

  toggleSelectSkill: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedSkills);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedSkills: next };
    });
  },

  clearSelection: () => {
    set({ selectedSkills: new Set<string>() });
  },

  setSortBy: (sort: SortBy) => {
    set({ sortBy: sort });
    saveSessionState({ sortBy: sort, viewMode: get().viewMode, discoverTab: get().discoverTab });
  },

  loadMore: async () => {
    const { currentPage, hasMore, remoteLoading, activeView } = get();
    if (!hasMore || remoteLoading) return;

    const nextPage = currentPage + 1;
    set({ remoteLoading: true });

    try {
      const res = await invoke<ApiResponse<RemoteSkill[]>>('fetch_skills', {
        view: activeView,
        page: nextPage,
        perPage: 30,
      });
      const skills = res.data ?? [];
      const pagination = res.pagination;

      set((state) => ({
        remoteSkills: [...state.remoteSkills, ...skills],
        currentPage: nextPage,
        hasMore: pagination?.hasMore ?? false,
        remoteLoading: false,
      }));
    } catch (e) {
      set({ remoteError: String(e), remoteLoading: false });
    }
  },

  setFilter: (key: 'source' | 'minInstalls', value: string | number | null) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }));
  },

  clearFilters: () => {
    set({ filters: { source: null, minInstalls: 0 } });
  },

  getFilteredSkills: () => {
    const { remoteSkills, filters } = get();
    return remoteSkills.filter((skill) => {
      if (filters.source) {
        // filters.source is the owner (e.g. "anthropics"), skill.source is full repo (e.g. "anthropics/skills")
        const sourceLower = skill.source.toLowerCase();
        const filterLower = filters.source.toLowerCase();
        // Match if source starts with filter (owner match) or contains it
        if (!sourceLower.startsWith(filterLower + '/') && sourceLower !== filterLower) {
          return false;
        }
      }
      if (skill.installs < filters.minInstalls) return false;
      return true;
    });
  },

  // ── Category Actions ───────────────────────────────────────────────────

  setCategory: (category: SkillCategory) => {
    set({ activeCategory: category });
  },

  getSkillCategory: (skill: RemoteSkill): SkillCategory => {
    return getSkillCategory(skill);
  },

  getSkillsByCategory: (category: SkillCategory): RemoteSkill[] => {
    const { remoteSkills } = get();
    if (category === 'all') return remoteSkills;
    return remoteSkills.filter((skill) => getSkillCategory(skill) === category);
  },

  // ── Tag Actions ────────────────────────────────────────────────────────

  toggleTag: (tag: string) => {
    set((state) => {
      const exists = state.selectedTags.includes(tag);
      const next = exists
        ? state.selectedTags.filter((t) => t !== tag)
        : [...state.selectedTags, tag];
      return { selectedTags: next };
    });
  },

  clearTags: () => {
    set({ selectedTags: [] });
  },

  getPopularTags: (limit: number = 15): { tag: string; count: number }[] => {
    const { remoteSkills } = get();
    const tagCount = new Map<string, number>();

    for (const skill of remoteSkills) {
      const tags = getSkillTags(skill);
      for (const tag of tags) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  generateSkillTags: (skill: RemoteSkill): string[] => {
    return generateSkillTags(skill);
  },

  // ── Source Filter (multi-select) ──────────────────────────────────────

  toggleSourceFilter: (source: string) => {
    set((state) => {
      const exists = state.sourceFilters.includes(source);
      const next = exists
        ? state.sourceFilters.filter((s) => s !== source)
        : [...state.sourceFilters, source];
      return { sourceFilters: next };
    });
  },

  setSourceFilters: (sources: string[]) => {
    set({ sourceFilters: sources });
  },

  // ── Quality Filter ─────────────────────────────────────────────────────

  setQualityFilter: (filter: 'all' | 'with-stars') => {
    set({ qualityFilter: filter });
  },

  // ── View Mode ──────────────────────────────────────────────────────────

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
    saveSessionState({ sortBy: get().sortBy, viewMode: mode, discoverTab: get().discoverTab });
  },

  // ── Discover Tab ───────────────────────────────────────────────────────

  setDiscoverTab: (tab: DiscoverTab) => {
    set({ discoverTab: tab });
    saveSessionState({ sortBy: get().sortBy, viewMode: get().viewMode, discoverTab: tab });
  },

  setSearchMode: (mode: 'official' | 'github') => {
    set({ searchMode: mode });
  },

  // ── Enhanced Filtered Skills ──────────────────────────────────────────

  getEnhancedFilteredSkills: (): RemoteSkill[] => {
    const {
      remoteSkills,
      filters,
      activeCategory,
      selectedTags,
      sourceFilters,
      qualityFilter,
      discoverTab,
      sortBy,
      favorites,
      trendingSkills,
    } = get();

    let skills = [...remoteSkills];

    // Filter by discover tab
    if (discoverTab === 'favorites') {
      skills = skills.filter((s) => favorites.includes(s.id));
    } else if (discoverTab === 'trending') {
      skills = [...trendingSkills];
    } else if (discoverTab === 'recent') {
      // 最近更新: only skills with a known update time, newest first
      skills = skills
        .filter((s) => s.updatedAt !== undefined && s.updatedAt > 0)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }

    // Filter by category
    if (activeCategory !== 'all') {
      skills = skills.filter((skill) => getSkillCategory(skill) === activeCategory);
    }

    // Filter by tags (AND logic - all selected tags must match)
    if (selectedTags.length > 0) {
      skills = skills.filter((skill) => {
        const skillTags = getSkillTags(skill);
        return selectedTags.every((tag) => skillTags.includes(tag));
      });
    }

    // Filter by source (single-select legacy filter)
    if (filters.source) {
      const filterLower = filters.source.toLowerCase();
      skills = skills.filter((skill) => {
        const sourceLower = skill.source.toLowerCase();
        return sourceLower.startsWith(filterLower + '/') || sourceLower === filterLower;
      });
    }

    // Filter by multi-source filter
    if (sourceFilters.length > 0) {
      skills = skills.filter((skill) => {
        const owner = skill.source.split('/')[0]?.toLowerCase();
        return sourceFilters.some((s) => s.toLowerCase() === owner);
      });
    }

    // Filter by min installs
    if (filters.minInstalls > 0) {
      skills = skills.filter((skill) => skill.installs >= filters.minInstalls);
    }

    // Filter by quality
    if (qualityFilter === 'with-stars') {
      skills = skills.filter((skill) => skill.stars !== undefined && skill.stars > 0);
    }

    // Sort. The 最近更新 and 趋势 tabs define their own canonical order (the
    // backend ranks trending by growth/recency), so the generic sortBy must not
    // override them.
    if (discoverTab !== 'recent' && discoverTab !== 'trending') {
      if (sortBy === 'installs') {
        skills.sort((a, b) => b.installs - a.installs);
      } else if (sortBy === 'stars') {
        skills.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
      } else if (sortBy === 'name') {
        skills.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === 'updated') {
        skills.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      }
    }

    return skills;
  },

  // ── Translation Actions ────────────────────────────────────────────────

  translateSkills: async (skills: RemoteSkill[]) => {
    const { config } = get();
    const t = config.translation;
    if (!t.enabled) return;
    if (!t.useImmersive && !t.apiKey) return;

    // Collect descriptions that need translation
    const descriptionsToTranslate: string[] = [];
    for (const skill of skills) {
      if (skill.description && skill.description.trim().length > 0) {
        descriptionsToTranslate.push(skill.description.trim());
      }
    }

    if (descriptionsToTranslate.length === 0) return;

    set({ translating: true });
    try {
      const result = await invoke<Record<string, string>>('translate_skill_descriptions', {
        texts: descriptionsToTranslate,
        targetLanguage: t.targetLanguage,
        apiKey: t.apiKey,
        apiBase: t.apiBase,
        model: t.model,
        useImmersive: t.useImmersive,
      });

      const newTranslations = new Map(get().translations);
      for (const [original, translated] of Object.entries(result)) {
        newTranslations.set(original, translated);
      }
      set({ translations: newTranslations });
      saveTranslationCache(newTranslations, get().config.translation.targetLanguage);
    } catch (e) {
      console.error('Translation failed:', e);
    } finally {
      set({ translating: false });
    }
  },

  getTranslatedDescription: (original: string) => {
    return get().translations.get(original);
  },

  translateText: async (text: string): Promise<string | undefined> => {
    const { config } = get();
    const t = config.translation;
    if (!t.enabled) return undefined;
    if (!t.useImmersive && !t.apiKey) return undefined;

    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const cached = get().translations.get(trimmed);
    if (cached) return cached;

    const result = await invoke<Record<string, string>>('translate_skill_descriptions', {
      texts: [trimmed],
      targetLanguage: t.targetLanguage,
      apiKey: t.apiKey,
      apiBase: t.apiBase,
      model: t.model,
      useImmersive: t.useImmersive,
    });
    const translated = result[trimmed];
    if (translated) {
      const newTranslations = new Map(get().translations);
      newTranslations.set(trimmed, translated);
      set({ translations: newTranslations });
      saveTranslationCache(newTranslations, get().config.translation.targetLanguage);
      return translated;
    }
    return undefined;
  },

  clearTranslations: () => {
    set({ translations: new Map<string, string>() });
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(TRANSLATION_CACHE_KEY);
    } catch {
      // ignore
    }
    invoke('clear_translation_cache').catch(console.error);
  },

  // ── GitHub Community Search Actions ────────────────────────────────────

  searchGithubSkills: async (query: string) => {
    set({ githubSearchLoading: true, githubSearchError: null, githubSearchResults: [] });
    try {
      const results = await invoke<RemoteSkill[]>('search_github_skills', { query, limit: 30 });
      set({ githubSearchResults: results, githubSearchLoading: false });
    } catch (e) {
      const msg = String(e);
      set({
        githubSearchError: msg.includes('rate limit') || msg.includes('速率限制')
          ? 'GitHub API 速率限制，请稍后再试'
          : msg,
        githubSearchLoading: false,
      });
    }
  },

  searchGithubRepos: async (query: string) => {
    set({ githubSearchLoading: true, githubSearchError: null, githubSearchResults: [] });
    try {
      const results = await invoke<RemoteSkill[]>('search_github_repos', { query, limit: 30 });
      set({ githubSearchResults: results, githubSearchLoading: false });
    } catch (e) {
      const msg = String(e);
      set({
        githubSearchError: msg.includes('rate limit') || msg.includes('速率限制')
          ? 'GitHub API 速率限制，请稍后再试'
          : msg,
        githubSearchLoading: false,
      });
    }
  },

  clearGithubSearch: () => {
    set({ githubSearchResults: [], githubSearchLoading: false, githubSearchError: null });
  },

  fetchGithubReadme: async (repoFullName: string) => {
    set({ githubReadmeLoading: true, githubReadme: '' });
    try {
      const content = await invoke<string>('fetch_github_repo_readme', { repoFullName });
      set({ githubReadme: content, githubReadmeLoading: false });
      return content;
    } catch (e) {
      set({ githubReadmeLoading: false });
      throw e;
    }
  },

  fetchGithubRepoInfo: async (repoFullName: string) => {
    const normalized = repoFullName.trim();
    if (!normalized) return null;

    const FIVE_MINUTES = 5 * 60 * 1000;
    const now = Date.now();

    // Return cached if available and not expired (5 min TTL)
    const cached = get().repoInfoCache[normalized];
    if (cached && now - cached.timestamp < FIVE_MINUTES) return cached.data;

    // Return null if already loading
    if (get().repoInfoLoading.has(normalized)) {
      return null;
    }

    // Mark as loading
    const newLoading = new Set(get().repoInfoLoading);
    newLoading.add(normalized);
    set({ repoInfoLoading: newLoading });

    try {
      const info = await invoke<RepoInfo>('fetch_github_repo_info', { repoFullName: normalized });
      set((state) => ({
        repoInfoCache: { ...state.repoInfoCache, [normalized]: { data: info, timestamp: now } },
      }));
      return info;
    } catch (e) {
      console.error('Failed to fetch github repo info:', e);
      return null;
    } finally {
      const finalLoading = new Set(get().repoInfoLoading);
      finalLoading.delete(normalized);
      set({ repoInfoLoading: finalLoading });
    }
  },

  fetchGithubReposInfoBatch: async (repoFullNames: string[]) => {
    const { repoInfoCache } = get();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const now = Date.now();

    // Filter out cached and valid entries, only fetch those not in cache or expired
    const toFetch = repoFullNames.filter((name) => {
      if (!name.trim()) return false;
      const cached = repoInfoCache[name];
      return !cached || now - cached.timestamp >= FIVE_MINUTES;
    });

    if (toFetch.length === 0) {
      // Return just the data from cache
      const result: Record<string, RepoInfo> = {};
      for (const name of repoFullNames) {
        if (repoInfoCache[name]) {
          result[name] = repoInfoCache[name].data;
        }
      }
      return result;
    }

    try {
      const results = await invoke<Record<string, RepoInfo>>('fetch_github_repos_info_batch', {
        repoFullNames: toFetch,
      });
      // Update cache with timestamps
      const newCacheEntries: Record<string, { data: RepoInfo; timestamp: number }> = {};
      for (const [name, info] of Object.entries(results)) {
        newCacheEntries[name] = { data: info, timestamp: now };
      }
      set((state) => ({
        repoInfoCache: { ...state.repoInfoCache, ...newCacheEntries },
      }));
      // Return combined result (cached + newly fetched)
      const combined: Record<string, RepoInfo> = {};
      for (const name of repoFullNames) {
        if (results[name]) {
          combined[name] = results[name];
        } else if (repoInfoCache[name] && now - repoInfoCache[name].timestamp < FIVE_MINUTES) {
          combined[name] = repoInfoCache[name].data;
        }
      }
      return combined;
    } catch (e) {
      console.error('Failed to batch fetch github repo info:', e);
      // Return cached data even on error
      const result: Record<string, RepoInfo> = {};
      for (const name of repoFullNames) {
        if (repoInfoCache[name] && now - repoInfoCache[name].timestamp < FIVE_MINUTES) {
          result[name] = repoInfoCache[name].data;
        }
      }
      return result;
    }
  },

  getRepoInfo: (repoFullName: string) => {
    const cached = get().repoInfoCache[repoFullName];
    if (!cached) return undefined;
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (Date.now() - cached.timestamp >= FIVE_MINUTES) return undefined;
    return cached.data;
  },

  isRepoInfoLoading: (repoFullName: string) => {
    return get().repoInfoLoading.has(repoFullName);
  },

  // ── Search History Actions ─────────────────────────────────────────────

  addSearchHistory: (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const current = get().searchHistory;
    const filtered = current.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...filtered].slice(0, MAX_SEARCH_HISTORY);
    set({ searchHistory: next });
    saveSearchHistory(next);
  },

  removeSearchHistory: (query: string) => {
    const current = get().searchHistory;
    const next = current.filter((q) => q !== query);
    set({ searchHistory: next });
    saveSearchHistory(next);
  },

  clearSearchHistory: () => {
    set({ searchHistory: [] });
    saveSearchHistory([]);
  },

  getSearchSuggestions: (query: string): RemoteSkill[] => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    const { remoteSkills } = get();
    const results: RemoteSkill[] = [];
    const seen = new Set<string>();

    // Priority 1: name starts with query
    for (const skill of remoteSkills) {
      if (results.length >= MAX_SUGGESTIONS) break;
      if (skill.name.toLowerCase().startsWith(trimmed)) {
        results.push(skill);
        seen.add(skill.id);
      }
    }

    // Priority 2: name contains query
    for (const skill of remoteSkills) {
      if (results.length >= MAX_SUGGESTIONS) break;
      if (seen.has(skill.id)) continue;
      if (skill.name.toLowerCase().includes(trimmed)) {
        results.push(skill);
        seen.add(skill.id);
      }
    }

    // Priority 3: source contains query
    for (const skill of remoteSkills) {
      if (results.length >= MAX_SUGGESTIONS) break;
      if (seen.has(skill.id)) continue;
      if (skill.source.toLowerCase().includes(trimmed)) {
        results.push(skill);
        seen.add(skill.id);
      }
    }

    // Priority 4: description contains query
    for (const skill of remoteSkills) {
      if (results.length >= MAX_SUGGESTIONS) break;
      if (seen.has(skill.id)) continue;
      if (skill.description?.toLowerCase().includes(trimmed)) {
        results.push(skill);
        seen.add(skill.id);
      }
    }

    return results;
  },

  getHotSearches: (): string[] => {
    const history = get().searchHistory;
    if (history.length === 0) {
      return DEFAULT_HOT_SEARCHES.slice(0, MAX_HOT_SEARCHES);
    }
    // Count frequency (case-insensitive)
    const freq = new Map<string, { lower: string; original: string; count: number }>();
    for (const term of history) {
      const lower = term.toLowerCase();
      const existing = freq.get(lower);
      if (existing) {
        existing.count++;
      } else {
        freq.set(lower, { lower, original: term, count: 1 });
      }
    }
    const sorted = Array.from(freq.values()).sort((a, b) => b.count - a.count);
    const hotFromHistory = sorted.slice(0, MAX_HOT_SEARCHES).map((s) => s.original);
    // If not enough from history, pad with defaults
    if (hotFromHistory.length < MAX_HOT_SEARCHES) {
      const existingSet = new Set(hotFromHistory.map((s) => s.toLowerCase()));
      for (const def of DEFAULT_HOT_SEARCHES) {
        if (hotFromHistory.length >= MAX_HOT_SEARCHES) break;
        if (!existingSet.has(def.toLowerCase())) {
          hotFromHistory.push(def);
          existingSet.add(def.toLowerCase());
        }
      }
    }
    return hotFromHistory;
  },

  // ── Favorites Actions ──────────────────────────────────────────────────

  toggleFavorite: (skillId: string) => {
    const current = get().favorites;
    const exists = current.includes(skillId);
    const next = exists
      ? current.filter((id) => id !== skillId)
      : [...current, skillId];
    set({ favorites: next });
    saveFavorites(next);
  },

  isFavorite: (skillId: string): boolean => {
    return get().favorites.includes(skillId);
  },

  // ── Update Actions ────────────────────────────────────────────────────

  checkUpdates: async (skillPaths?: string[]) => {
    set({ updateCheckLoading: true, updateCheckError: null });
    try {
      const { localSkills, config } = get();
      const paths = skillPaths && skillPaths.length > 0
        ? skillPaths
        : localSkills
            .filter((s) => s.source && s.source.length > 0)
            .map((s) => s.path);

      if (paths.length === 0) {
        set({ updateCheckLoading: false });
        return;
      }

      const results = await invoke<UpdateCheckResult[]>('check_for_updates', {
        skillPaths: paths,
      });

      const resultsMap = new Map<string, UpdateCheckResult>();
      for (const r of results) {
        resultsMap.set(r.skillPath, r);
      }

      set({ updateCheckResults: resultsMap, updateCheckLoading: false });

      // Reload local skills to get updated manifest data
      if (config.globalSkillsPath) {
        const skills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills: skills });
      }
    } catch (e) {
      console.error('Failed to check updates:', e);
      set({
        updateCheckLoading: false,
        updateCheckError: String(e),
      });
    }
  },

  updateSkill: async (skillPath: string): Promise<UpdateResult | null> => {
    try {
      const result = await invoke<UpdateResult>('update_skill_streamed', {
        skillPath,
      });
      set({ localSkills: result.localSkills });

      // Update the check result for this skill
      const updatedMap = new Map(get().updateCheckResults);
      const existing = updatedMap.get(skillPath);
      if (existing) {
        updatedMap.set(skillPath, {
          ...existing,
          hasUpdate: false,
          currentHash: result.newHash,
          latestHash: result.newHash,
          lastCheckedAt: Date.now(),
        });
        set({ updateCheckResults: updatedMap });
      }

      return result;
    } catch (e) {
      console.error('Failed to update skill:', e);
      return null;
    }
  },

  updateSkillStreamed: async (skillPath: string) => {
    set({ installOutput: [] });

    let unlisten: UnlistenFn | undefined;

    try {
      unlisten = await listen<InstallOutputEvent>('install-output', (event) => {
        const payload = event.payload;
        set((state) => ({
          installOutput: [...state.installOutput, payload.data],
        }));
      });

      const result = await invoke<UpdateResult>('update_skill_streamed', {
        skillPath,
      });
      set({ localSkills: result.localSkills });

      // Update the check result
      const updatedMap = new Map(get().updateCheckResults);
      const existing = updatedMap.get(skillPath);
      if (existing) {
        updatedMap.set(skillPath, {
          ...existing,
          hasUpdate: false,
          currentHash: result.newHash,
          latestHash: result.newHash,
          lastCheckedAt: Date.now(),
        });
        set({ updateCheckResults: updatedMap });
      }
    } catch (e) {
      set((state) => ({
        installOutput: [...state.installOutput, `Error: ${String(e)}`],
      }));
      throw e;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  rollbackSkill: async (skillPath: string): Promise<UpdateResult | null> => {
    try {
      const result = await invoke<UpdateResult>('rollback_skill', {
        skillPath,
      });
      set({ localSkills: result.localSkills });

      // Update the check result
      const updatedMap = new Map(get().updateCheckResults);
      const existing = updatedMap.get(skillPath);
      if (existing) {
        updatedMap.set(skillPath, {
          ...existing,
          hasUpdate: false,
          currentHash: result.newHash,
          lastCheckedAt: Date.now(),
        });
        set({ updateCheckResults: updatedMap });
      }

      return result;
    } catch (e) {
      console.error('Failed to rollback skill:', e);
      return null;
    }
  },

  batchUpdate: async (skillPaths: string[]) => {
    set({
      batchProgress: {
        active: true,
        current: 0,
        total: skillPaths.length,
        operation: 'install',
        currentSkillName: '',
      },
    });

    const results: { skillName: string; success: boolean; message: string }[] = [];
    let completed = 0;

    const updatePromises = skillPaths.map(async (path) => {
      const skillName = path.split(/[\\/]/).pop() || path;
      set({ batchProgress: { ...get().batchProgress, currentSkillName: skillName } });
      try {
        const result = await invoke<UpdateResult>('update_skill_streamed', {
          skillPath: path,
        });
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });

        // Update local skills
        set({ localSkills: result.localSkills });

        // Update check result
        const updatedMap = new Map(get().updateCheckResults);
        const existing = updatedMap.get(path);
        if (existing) {
          updatedMap.set(path, {
            ...existing,
            hasUpdate: false,
            currentHash: result.newHash,
            latestHash: result.newHash,
            lastCheckedAt: Date.now(),
          });
          set({ updateCheckResults: updatedMap });
        }

        return { skillName, success: true, message: 'Updated' };
      } catch (e) {
        completed++;
        set({ batchProgress: { ...get().batchProgress, current: completed } });
        return { skillName, success: false, message: String(e) };
      }
    });

    const settled = await Promise.allSettled(updatePromises);
    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    // Reload local skills
    const config = get().config;
    if (config.globalSkillsPath) {
      try {
        const localSkills = await invoke<LocalSkill[]>('scan_local_skills', {
          path: config.globalSkillsPath,
        });
        set({ localSkills });
      } catch {
        // ignore
      }
    }

    set({
      batchProgress: {
        active: false,
        current: 0,
        total: 0,
        operation: null,
        currentSkillName: '',
      },
    });

    return { total: skillPaths.length, succeeded, failed, results };
  },

  getUpdatableCount: (): number => {
    const { updateCheckResults, localSkills } = get();
    // First count from updateCheckResults (fresh check)
    let count = 0;
    for (const result of updateCheckResults.values()) {
      if (result.hasUpdate) count++;
    }
    // If no fresh results, count from localSkills (cached in manifest)
    if (count === 0 && updateCheckResults.size === 0) {
      count = localSkills.filter((s) => s.updateAvailable).length;
    }
    return count;
  },

  hasUpdate: (skillPath: string): boolean => {
    const { updateCheckResults, localSkills } = get();
    // First check fresh results
    const result = updateCheckResults.get(skillPath);
    if (result) {
      return result.hasUpdate;
    }
    // Fall back to cached manifest data
    const skill = localSkills.find((s) => s.path === skillPath);
    return skill?.updateAvailable ?? false;
  },

  // ── Project Actions ────────────────────────────────────────────────────

  loadProjects: () => {
    const projects = loadProjects();
    set({ projects });
  },

  addProject: async (projectPath: string): Promise<Project | null> => {
    const normalizedPath = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
    const id = hashPath(normalizedPath);

    // Check if already exists
    const existing = get().projects.find((p) => p.id === id);
    if (existing) {
      // Just switch to it
      get().switchProject(id);
      return existing;
    }

    const name = getDirName(normalizedPath);
    const skillsPath = `${normalizedPath}/.trae/skills`;
    const now = Date.now();

    const newProject: Project = {
      id,
      name,
      path: normalizedPath,
      skillsPath,
      skillCount: 0,
      lastOpenedAt: now,
      createdAt: now,
    };

    const updatedProjects = [...get().projects, newProject];
    saveProjects(updatedProjects);
    set({ projects: updatedProjects });

    // Scan skills for this project and update count
    try {
      const skills = await invoke<LocalSkill[]>('scan_project_skills', { projectPath: normalizedPath });
      const finalProjects = get().projects.map((p) =>
        p.id === id ? { ...p, skillCount: skills.length } : p
      );
      saveProjects(finalProjects);
      set({ projects: finalProjects, projectSkills: skills });
    } catch (e) {
      console.error('Failed to scan project skills:', e);
    }

    // Switch to the new project
    get().switchProject(id);

    return get().projects.find((p) => p.id === id) || null;
  },

  removeProject: (projectId: string) => {
    const { projects, currentProjectId } = get();
    const updatedProjects = projects.filter((p) => p.id !== projectId);
    saveProjects(updatedProjects);

    // If we're removing the current project, switch to global
    if (currentProjectId === projectId) {
      set({
        projects: updatedProjects,
        currentProjectId: null,
        projectSkills: [],
      });
    } else {
      set({ projects: updatedProjects });
    }
  },

  switchProject: (projectId: string | null) => {
    const { projects } = get();
    const now = Date.now();

    if (projectId === null) {
      // Switch to global mode
      set({ currentProjectId: null, projectSkills: [] });
      // Update last opened for all projects (no change for global)
      return;
    }

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // Update last opened time
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, lastOpenedAt: now } : p
    );
    saveProjects(updatedProjects);
    set({ projects: updatedProjects, currentProjectId: projectId, projectSkillsLoading: true });

    // Load project skills
    get().loadProjectSkills(project.path);
  },

  renameProject: (projectId: string, newName: string) => {
    const updatedProjects = get().projects.map((p) =>
      p.id === projectId ? { ...p, name: newName } : p
    );
    saveProjects(updatedProjects);
    set({ projects: updatedProjects });
  },

  loadProjectSkills: async (projectPath: string) => {
    set({ projectSkillsLoading: true });
    try {
      const skills = await invoke<LocalSkill[]>('scan_project_skills', { projectPath });
      set({ projectSkills: skills, projectSkillsLoading: false });

      // Update skill count in project list
      const { projects, currentProjectId } = get();
      if (currentProjectId) {
        const updatedProjects = projects.map((p) =>
          p.id === currentProjectId ? { ...p, skillCount: skills.length } : p
        );
        saveProjects(updatedProjects);
        set({ projects: updatedProjects });
      }
    } catch (e) {
      console.error('Failed to load project skills:', e);
      set({ projectSkillsLoading: false });
    }
  },

  getCurrentProject: (): Project | null => {
    const { projects, currentProjectId } = get();
    if (!currentProjectId) return null;
    return projects.find((p) => p.id === currentProjectId) || null;
  },

  getCurrentSkillsPath: (): string => {
    const project = get().getCurrentProject();
    if (project) return project.skillsPath;
    return get().config.globalSkillsPath || '';
  },

  installSkillToTarget: async (source: string, skillName: string, targetPath: string, skillPathHint?: string) => {
    try {
      const result = await invoke<InstallResult>('install_skill_streamed', {
        source,
        skillName,
        targetPath: targetPath || undefined,
        skillPathHint: skillPathHint || undefined,
      });

      // Update the appropriate skills list
      const { currentProjectId, config } = get();
      if (currentProjectId) {
        // If target is a project path, reload project skills
        const project = get().getCurrentProject();
        if (project && targetPath === project.skillsPath) {
          await get().loadProjectSkills(project.path);
        }
      } else {
        // If target is global path, reload global skills
        if (targetPath === config.globalSkillsPath) {
          const skills = await invoke<LocalSkill[]>('scan_local_skills', {
            path: config.globalSkillsPath,
          });
          set({ localSkills: skills });
        }
      }

      return { success: result.success, message: result.error || `Successfully installed ${skillName}` };
    } catch (e) {
      return { success: false, message: String(e) };
    }
  },

  installSkillStreamedToTarget: async (source: string, skillName: string, targetPath: string, skillPathHint?: string) => {
    set({ installOutput: [] });

    let unlisten: UnlistenFn | undefined;

    try {
      unlisten = await listen<InstallOutputEvent>('install-output', (event) => {
        const payload = event.payload;
        set((state) => ({
          installOutput: [...state.installOutput, payload.data],
        }));
      });

      await invoke<InstallResult>('install_skill_streamed', {
        source,
        skillName,
        targetPath: targetPath || undefined,
        skillPathHint: skillPathHint || undefined,
      });

      // Update the appropriate skills list
      const { currentProjectId, config } = get();
      if (currentProjectId) {
        const project = get().getCurrentProject();
        if (project && targetPath === project.skillsPath) {
          await get().loadProjectSkills(project.path);
        }
      } else {
        if (targetPath === config.globalSkillsPath) {
          const skills = await invoke<LocalSkill[]>('scan_local_skills', {
            path: config.globalSkillsPath,
          });
          set({ localSkills: skills });
        }
      }
    } catch (e) {
      set((state) => ({
        installOutput: [...state.installOutput, `Error: ${String(e)}`],
      }));
      throw e;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },

  refreshProjectSkillCount: async (projectId: string) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    try {
      const skills = await invoke<LocalSkill[]>('scan_project_skills', { projectPath: project.path });
      const updatedProjects = get().projects.map((p) =>
        p.id === projectId ? { ...p, skillCount: skills.length } : p
      );
      saveProjects(updatedProjects);
      set({ projects: updatedProjects });
    } catch (e) {
      console.error('Failed to refresh project skill count:', e);
    }
  },
}));

// TEMP DEBUG: expose store for CDP inspection
if (typeof window !== 'undefined') {
  (window as any).__skillStore = useSkillStore;
}
