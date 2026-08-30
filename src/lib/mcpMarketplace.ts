import type { McpMarketplaceServer, McpCategory } from '../types';

// ─── MCP Categories ───────────────────────────────────────────────────────

export const mcpCategories: McpCategory[] = [
  { id: 'all', name: '全部', icon: 'grid', description: '所有 MCP Server' },
  { id: 'dev-tools', name: '开发工具', icon: 'code', description: '代码管理、CI/CD、调试工具' },
  { id: 'database', name: '数据库', icon: 'database', description: '数据库连接与操作工具' },
  { id: 'browser', name: '浏览器', icon: 'globe', description: '网页浏览、自动化测试' },
  { id: 'search', name: '搜索', icon: 'search', description: '网页搜索、知识库检索' },
  { id: 'productivity', name: '办公协作', icon: 'briefcase', description: '文档、邮件、项目管理' },
  { id: 'filesystem', name: '文件系统', icon: 'folder', description: '本地文件与目录操作' },
  { id: 'memory', name: '记忆存储', icon: 'brain', description: 'Agent 记忆与知识管理' },
  { id: 'design', name: '设计', icon: 'palette', description: '设计工具与素材管理' },
];

// ─── MCP Marketplace Servers ──────────────────────────────────────────────

export const mcpMarketplaceServers: McpMarketplaceServer[] = [
  // ── Dev Tools ──────────────────────────────────────────────────────────
  {
    id: 'github-mcp-server',
    name: 'GitHub MCP',
    description: 'GitHub 官方 MCP Server，支持仓库管理、Issue、PR、代码搜索等操作。',
    icon: '🐙',
    category: 'dev-tools',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    configType: 'stdio',
    stars: 4280,
    envVars: [
      { key: 'GITHUB_TOKEN', description: 'GitHub Personal Access Token', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'linear-mcp',
    name: 'Linear MCP',
    description: 'Linear 项目管理工具集成，支持创建、查询、更新 Issue 和项目。',
    icon: '📋',
    category: 'dev-tools',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-linear'],
    configType: 'stdio',
    stars: 1850,
    envVars: [
      { key: 'LINEAR_API_KEY', description: 'Linear API Key', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/linear',
    publisher: 'Model Context Protocol',
  },

  // ── Database ───────────────────────────────────────────────────────────
  {
    id: 'postgres-mcp',
    name: 'PostgreSQL MCP',
    description: 'PostgreSQL 数据库 MCP Server，支持 SQL 查询、Schema 探索、表管理。',
    icon: '🐘',
    category: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    configType: 'stdio',
    stars: 2340,
    envVars: [
      { key: 'POSTGRES_DSN', description: 'PostgreSQL 连接字符串 (postgresql://user:pass@host:5432/db)', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'sqlite-mcp',
    name: 'SQLite MCP',
    description: 'SQLite 数据库 MCP Server，轻量级本地数据库操作，无需额外服务。',
    icon: '🗃️',
    category: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    configType: 'stdio',
    stars: 1520,
    envVars: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'noco-mcp',
    name: 'NocoDB MCP',
    description: 'NocoDB 智能表格平台集成，支持数据表查询、记录管理和视图操作。',
    icon: '📊',
    category: 'database',
    command: 'npx',
    args: ['-y', 'mcp-noco'],
    configType: 'stdio',
    stars: 680,
    envVars: [
      { key: 'NOCODB_BASE_URL', description: 'NocoDB 实例地址', required: true },
      { key: 'NOCODB_API_TOKEN', description: 'NocoDB API Token', required: true },
    ],
    docsUrl: 'https://github.com/nocodb/mcp-noco',
    publisher: 'NocoDB',
  },

  // ── Browser ────────────────────────────────────────────────────────────
  {
    id: 'playwright-mcp',
    name: 'Playwright MCP',
    description: 'Playwright 浏览器自动化 MCP Server，支持网页导航、截图、交互操作。',
    icon: '🎭',
    category: 'browser',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-playwright'],
    configType: 'stdio',
    stars: 3150,
    envVars: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/playwright',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'puppeteer-mcp',
    name: 'Puppeteer MCP',
    description: 'Puppeteer 浏览器自动化 MCP Server，支持网页抓取、表单填写、截图。',
    icon: '🤖',
    category: 'browser',
    command: 'npx',
    args: ['-y', 'mcp-server-puppeteer'],
    configType: 'stdio',
    stars: 920,
    envVars: [],
    docsUrl: 'https://github.com/puppeteer/puppeteer',
    publisher: 'Community',
  },

  // ── Search ─────────────────────────────────────────────────────────────
  {
    id: 'brave-search-mcp',
    name: 'Brave Search MCP',
    description: 'Brave 网页搜索 MCP Server，提供隐私友好的网页搜索能力。',
    icon: '🔍',
    category: 'search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    configType: 'stdio',
    stars: 2680,
    envVars: [
      { key: 'BRAVE_API_KEY', description: 'Brave Search API Key', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    publisher: 'Model Context Protocol',
  },

  // ── Productivity / Office ──────────────────────────────────────────────
  {
    id: 'slack-mcp',
    name: 'Slack MCP',
    description: 'Slack 团队协作 MCP Server，支持发送消息、查询频道、管理线程。',
    icon: '💬',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    configType: 'stdio',
    stars: 1960,
    envVars: [
      { key: 'SLACK_BOT_TOKEN', description: 'Slack Bot Token (xoxb-...)', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'notion-mcp',
    name: 'Notion MCP',
    description: 'Notion 知识库 MCP Server，支持页面查询、内容编辑、数据库操作。',
    icon: '📝',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    configType: 'stdio',
    stars: 2450,
    envVars: [
      { key: 'NOTION_TOKEN', description: 'Notion Integration Token', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/notion',
    publisher: 'Model Context Protocol',
  },
  {
    id: 'gmail-mcp',
    name: 'Gmail MCP',
    description: 'Gmail 邮件管理 MCP Server，支持阅读、发送、搜索邮件。',
    icon: '📧',
    category: 'productivity',
    command: 'npx',
    args: ['-y', 'mcp-gmail'],
    configType: 'stdio',
    stars: 1340,
    envVars: [
      { key: 'GMAIL_CLIENT_ID', description: 'Google OAuth Client ID', required: true },
      { key: 'GMAIL_CLIENT_SECRET', description: 'Google OAuth Client Secret', required: true },
      { key: 'GMAIL_REFRESH_TOKEN', description: 'OAuth Refresh Token', required: true },
    ],
    docsUrl: 'https://github.com/teamreflex/mcp-gmail',
    publisher: 'Team Reflex',
  },
  {
    id: 'google-drive-mcp',
    name: 'Google Drive MCP',
    description: 'Google Drive 云盘 MCP Server，支持文件浏览、上传、下载和搜索。',
    icon: '📁',
    category: 'productivity',
    command: 'npx',
    args: ['-y', 'mcp-google-drive'],
    configType: 'stdio',
    stars: 890,
    envVars: [
      { key: 'GOOGLE_DRIVE_CLIENT_ID', description: 'Google OAuth Client ID', required: true },
      { key: 'GOOGLE_DRIVE_CLIENT_SECRET', description: 'Google OAuth Client Secret', required: true },
      { key: 'GOOGLE_DRIVE_REFRESH_TOKEN', description: 'OAuth Refresh Token', required: true },
    ],
    docsUrl: 'https://github.com/teamreflex/mcp-google-drive',
    publisher: 'Team Reflex',
  },
  {
    id: 'obsidian-mcp',
    name: 'Obsidian MCP',
    description: 'Obsidian 笔记 MCP Server，支持笔记搜索、内容读写、标签管理。',
    icon: '💎',
    category: 'productivity',
    command: 'npx',
    args: ['-y', 'mcp-obsidian'],
    configType: 'stdio',
    stars: 1120,
    envVars: [
      { key: 'OBSIDIAN_VAULT_PATH', description: 'Obsidian Vault 目录路径', required: true },
    ],
    docsUrl: 'https://github.com/ailyn/mcp-obsidian',
    publisher: 'Community',
  },

  // ── Filesystem ─────────────────────────────────────────────────────────
  {
    id: 'filesystem-mcp',
    name: 'Filesystem MCP',
    description: '本地文件系统 MCP Server，支持文件读写、目录浏览、搜索。',
    icon: '📂',
    category: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    configType: 'stdio',
    stars: 3560,
    envVars: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    publisher: 'Model Context Protocol',
  },

  // ── Memory ─────────────────────────────────────────────────────────────
  {
    id: 'memory-mcp',
    name: 'Memory MCP',
    description: 'Agent 记忆存储 MCP Server，提供长期记忆、知识检索和上下文管理。',
    icon: '🧠',
    category: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    configType: 'stdio',
    stars: 1780,
    envVars: [
      { key: 'MEMORY_DB_PATH', description: '记忆数据库存储路径', required: false },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    publisher: 'Model Context Protocol',
  },

  // ── Design ─────────────────────────────────────────────────────────────
  {
    id: 'figma-mcp',
    name: 'Figma MCP',
    description: 'Figma 设计工具 MCP Server，支持文件查询、组件提取、设计规范获取。',
    icon: '🎨',
    category: 'design',
    command: 'npx',
    args: ['-y', 'mcp-figma'],
    configType: 'stdio',
    stars: 1450,
    envVars: [
      { key: 'FIGMA_ACCESS_TOKEN', description: 'Figma Personal Access Token', required: true },
    ],
    docsUrl: 'https://github.com/figma/mcp-figma',
    publisher: 'Figma',
  },
];

// ─── Helper Functions ─────────────────────────────────────────────────────

export function getMcpServersByCategory(categoryId: string): McpMarketplaceServer[] {
  if (categoryId === 'all') return mcpMarketplaceServers;
  return mcpMarketplaceServers.filter((s) => s.category === categoryId);
}

export function searchMcpServers(query: string): McpMarketplaceServer[] {
  const q = query.toLowerCase().trim();
  if (!q) return mcpMarketplaceServers;
  return mcpMarketplaceServers.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.publisher.toLowerCase().includes(q),
  );
}

export function getMcpCategoryById(id: string): McpCategory | undefined {
  return mcpCategories.find((c) => c.id === id);
}

export function getMcpMarketplaceServerById(id: string): McpMarketplaceServer | undefined {
  return mcpMarketplaceServers.find((s) => s.id === id);
}
