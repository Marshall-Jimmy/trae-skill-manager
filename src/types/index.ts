// ─── Remote Skill (from skills.sh API) ───────────────────────────────────

export interface RemoteSkill {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  description?: string;
  /** GitHub repository description (if available). */
  repoDescription?: string;
  url: string;
  installUrl: string;
  sourceType: string;
  isDuplicate: boolean;
  dataSource?: string;
  stars?: number;
  tags?: string[];
  updatedAt?: number;
  /** Repo license SPDX id (e.g. "MIT"). */
  license?: string;
}

// ─── Skill Categories ────────────────────────────────────────────────────

export type SkillCategory =
  | 'all'
  | 'dev-tools'
  | 'office'
  | 'data'
  | 'creative'
  | 'social'
  | 'system'
  | 'ai-enhanced'
  | 'more';

export interface CategoryInfo {
  id: SkillCategory;
  label: string;
  icon: string;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'all', label: '全部分类', icon: 'Grid3X3', description: '浏览所有技能' },
  { id: 'dev-tools', label: '开发工具', icon: 'Code2', description: '代码开发、调试、工程化' },
  { id: 'office', label: '办公效率', icon: 'FileText', description: '文档、PPT、邮件、会议' },
  { id: 'data', label: '数据处理', icon: 'Database', description: '数据库、数据分析、可视化' },
  { id: 'creative', label: '创意设计', icon: 'Palette', description: '设计、文案、营销' },
  { id: 'social', label: '社交媒体', icon: 'Share2', description: '社媒运营、内容生成' },
  { id: 'system', label: '系统工具', icon: 'Settings2', description: '文件、终端、系统操作' },
  { id: 'ai-enhanced', label: 'AI 增强', icon: 'Sparkles', description: '记忆、推理、Agent 增强' },
  { id: 'more', label: '更多...', icon: 'MoreHorizontal', description: '其他分类' },
];

// ─── View Mode ───────────────────────────────────────────────────────────

export type ViewMode = 'grid' | 'list';

// ─── Discover Tab ────────────────────────────────────────────────────────

export type DiscoverTab = 'all' | 'trending' | 'recent' | 'favorites';

// ─── Local Skill (scanned from disk) ──────────────────────────────────────

export interface LocalSkill {
  name: string;
  description: string;
  path: string;
  type: string;
  enabled: boolean;
  version?: string;
  tags?: string[];
  /** Unique manifest ID (e.g. "anthropics/skills/web-search").
   *  Undefined for legacy installs without a manifest file. */
  manifestId?: string;
  /** Source repository (from manifest). */
  source?: string;
  /** Install method used (from manifest). */
  installMethod?: string;
  /** Install timestamp in ms (from manifest). */
  installedAt?: number;
  /** Whether an update is available (from manifest). */
  updateAvailable?: boolean;
  /** Remote latest commit hash (from manifest). */
  remoteHash?: string;
  /** Last checked update timestamp (from manifest). */
  lastCheckedAt?: number;
  /** Current local hash (from manifest). */
  hash?: string;
}

// ─── Skill Detail (from detail API) ──────────────────────────────────────

export interface SkillDetail {
  id: string;
  source: string;
  slug: string;
  installs: number;
  hash?: string;
  files: SkillFile[];
}

export interface SkillFile {
  path: string;
  contents: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

// ─── API Response wrapper ─────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  pagination?: Pagination;
}

// ─── Repo Skill Info (from `npx skills add --list`) ──────────────────────

export interface RepoSkillInfo {
  name: string;
  description?: string;
  path?: string;
}

// ─── File Entry (file browser) ────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  extension?: string;
  /** Populated client-side when expanding directories lazily. */
  children?: FileEntry[];
}

// ─── Install Record (operation history) ───────────────────────────────────

export interface InstallRecord {
  id: string;
  action: string;
  skill_name: string;
  source: string;
  timestamp: number;
  success: boolean;
  message: string;
}

// ─── Batch / Single operation results ─────────────────────────────────────

export interface BatchResult {
  results: SingleResult[];
  total: number;
  succeeded: number;
  failed: number;
}

export interface SingleResult {
  skillName: string;
  success: boolean;
  message: string;
}

// ─── Translation Config ───────────────────────────────────────────────────

export interface TranslationConfig {
  enabled: boolean;
  targetLanguage: string;
  apiKey: string;
  apiBase: string;
  model: string;
  useImmersive: boolean;
}

// ─── GitHub Config ────────────────────────────────────────────────────────

export interface GithubConfig {
  token: string;
}

// ─── GitHub Repo Info ─────────────────────────────────────────────────────

export interface RepoOwnerInfo {
  login: string;
  avatarUrl: string;
}

export interface RepoLicenseInfo {
  spdxId?: string;
  name?: string;
}

export interface RepoInfo {
  fullName: string;
  description?: string;
  htmlUrl: string;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  language?: string;
  license?: RepoLicenseInfo;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  owner: RepoOwnerInfo;
  defaultBranch: string;
}

// ─── App Config ───────────────────────────────────────────────────────────

export interface AppConfig {
  globalSkillsPath: string;
  projectPath: string;
  theme: string;
  translation: TranslationConfig;
  github: GithubConfig;
  /** 当前目标工具（Phase 3 Tool Adapter），默认 "trae" */
  activeToolId: string;
}

// ─── Tool Status (from Tool Adapter registry) ─────────────────────────────

export interface ToolStatus {
  id: string;
  displayName: string;
  icon: string;
  installed: boolean;
  running: boolean;
  globalDir?: string | null;
  projectDir: string;
}

// ─── Running Tool (Phase 4 进程检测) ───────────────────────────────────────

export interface RunningTool {
  toolId: string;
  pid: number;
  exePath?: string | null;
  cwd?: string | null;
  workspaceHint?: string | null;
}

// ─── Cross-Tool Sync (Phase 5.2) ───────────────────────────────────────────

export interface ToolSkillEntry {
  toolId: string;
  path: string;
  enabled: boolean;
}

export interface CrossToolSkill {
  name: string;
  entries: ToolSkillEntry[];
}

// ─── Install Result ───────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  skillName: string;
  skillPath: string;
  method: string;
  verified: boolean;
  error?: string | null;
  filesInstalled: number;
  localSkills: LocalSkill[];
}

// ─── Skill Manifest (stored in each installed skill dir) ─────────────────────

export interface SkillManifest {
  id: string;
  name: string;
  source: string;
  sourceType: string;
  installMethod: string;
  installedAt: number;
  updatedAt: number;
  version?: string;
  hash?: string;
  filesInstalled: number;
  schemaVersion: number;
  /** Remote latest commit hash (for update comparison) */
  remoteHash?: string;
  /** Last checked update timestamp (ms) */
  lastCheckedAt?: number;
  /** Whether an update is available */
  updateAvailable?: boolean;
  /** Latest version string (if any) */
  latestVersion?: string;
}

// ─── Update Check Result ───────────────────────────────────────────────────

export interface UpdateCheckResult {
  skillPath: string;
  skillName: string;
  hasUpdate: boolean;
  currentHash?: string;
  latestHash?: string;
  lastCheckedAt: number;
  error?: string;
}

// ─── Update Result ────────────────────────────────────────────────────────

export interface UpdateResult {
  success: boolean;
  skillName: string;
  skillPath: string;
  previousHash?: string;
  newHash?: string;
  error?: string;
  localSkills: LocalSkill[];
}

// ─── Install Output Event (streamed to frontend) ──────────────────────────

export type InstallOutputEvent =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'done'; data: string };

// ─── Project ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  path: string;
  skillsPath: string;
  skillCount: number;
  lastOpenedAt: number;
  createdAt: number;
}

// ─── Skill Scope ──────────────────────────────────────────────────────────

export type SkillScope = 'global' | 'project' | 'all';

// ─── MCP Server ──────────────────────────────────────────────────────────

export type McpServerStatus = 'stopped' | 'running' | 'error';
export type McpConfigType = 'stdio' | 'sse';
export type McpServerSource = 'user' | 'marketplace';

export interface McpServer {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  status: McpServerStatus;
  configType: McpConfigType;
  url?: string;
  source: McpServerSource;
  installedAt: number;
  lastUsedAt?: number;
  errorMessage?: string;
  /** Log output lines (stdout/stderr) for running servers */
  logs?: string[];
  /** PID of the running process (if any) */
  pid?: number;
}

// ─── MCP Marketplace Server (template / catalog entry) ────────────────────

export interface McpMarketplaceServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  command: string;
  args: string[];
  configType: McpConfigType;
  url?: string;
  stars: number;
  /** Required / suggested environment variables (keys with descriptions) */
  envVars: { key: string; description: string; required: boolean }[];
  /** Official documentation URL */
  docsUrl?: string;
  /** Publisher / author */
  publisher: string;
}

// ─── MCP Category ─────────────────────────────────────────────────────────

export interface McpCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

// ─── MCP Connection Test ──────────────────────────────────────────────────

export interface McpConnectionConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  configType: McpConfigType;
  url?: string;
}

export interface McpTestResult {
  success: boolean;
  message: string;
  durationMs: number;
  stderr?: string | null;
  hint?: string | null;
}

export interface McpLogEvent {
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface McpExitEvent {
  pid: number;
  code?: number | null;
}
