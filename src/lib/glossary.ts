// 预置技术术语词库（B 方案）：本地术语级翻译，无需 LLM API。
// 覆盖 AI/LLM/agent/workflow 等领域常见术语；代码块（围栏与行内）保持不翻译，
// 与 LLM 翻译行为保持一致。词库可随版本持续扩充。

export interface GlossaryEntry {
  en: string;
  zh: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // AI / 模型
  { en: 'artificial intelligence', zh: '人工智能' },
  { en: 'AI', zh: '人工智能' },
  { en: 'large language model', zh: '大语言模型' },
  { en: 'LLM', zh: '大语言模型' },
  { en: 'machine learning', zh: '机器学习' },
  { en: 'deep learning', zh: '深度学习' },
  { en: 'neural network', zh: '神经网络' },
  { en: 'prompt engineering', zh: '提示词工程' },
  { en: 'prompt', zh: '提示词' },
  { en: 'context window', zh: '上下文窗口' },
  { en: 'fine-tuning', zh: '微调' },
  { en: 'fine tuning', zh: '微调' },
  { en: 'embedding', zh: '向量嵌入' },
  { en: 'retrieval-augmented generation', zh: '检索增强生成' },
  { en: 'RAG', zh: '检索增强生成' },
  { en: 'hallucination', zh: '幻觉' },
  { en: 'multimodal', zh: '多模态' },
  { en: 'inference', zh: '推理' },
  { en: 'token', zh: 'Token' },
  { en: 'model', zh: '模型' },
  { en: 'open-source', zh: '开源' },
  { en: 'open source', zh: '开源' },

  // Agent / 工具
  { en: 'multi-agent', zh: '多智能体' },
  { en: 'agent', zh: '智能体' },
  { en: 'autonomous', zh: '自主' },
  { en: 'tool calling', zh: '工具调用' },
  { en: 'function calling', zh: '函数调用' },
  { en: 'Model Context Protocol', zh: '模型上下文协议' },
  { en: 'MCP', zh: 'MCP（模型上下文协议）' },
  { en: 'workflow', zh: '工作流' },
  { en: 'pipeline', zh: '流水线' },
  { en: 'orchestration', zh: '编排' },
  { en: 'skill', zh: '技能' },
  { en: 'plugin', zh: '插件' },
  { en: 'extension', zh: '扩展' },
  { en: 'SDK', zh: '软件开发工具包' },
  { en: 'API', zh: '接口' },
  { en: 'CLI', zh: '命令行工具' },
  { en: 'command-line', zh: '命令行' },
  { en: 'terminal', zh: '终端' },

  // 数据 / 存储
  { en: 'vector database', zh: '向量数据库' },
  { en: 'database', zh: '数据库' },
  { en: 'file system', zh: '文件系统' },
  { en: 'filesystem', zh: '文件系统' },
  { en: 'schema', zh: '模式' },
  { en: 'query', zh: '查询' },
  { en: 'cache', zh: '缓存' },
  { en: 'storage', zh: '存储' },
  { en: 'index', zh: '索引' },
  { en: 'SQL', zh: 'SQL' },

  // 开发 / 工程
  { en: 'full-stack', zh: '全栈' },
  { en: 'full stack', zh: '全栈' },
  { en: 'frontend', zh: '前端' },
  { en: 'backend', zh: '后端' },
  { en: 'browser', zh: '浏览器' },
  { en: 'debugging', zh: '调试' },
  { en: 'debug', zh: '调试' },
  { en: 'testing', zh: '测试' },
  { en: 'deployment', zh: '部署' },
  { en: 'deploy', zh: '部署' },
  { en: 'compile', zh: '编译' },
  { en: 'repository', zh: '代码仓库' },
  { en: 'repo', zh: '代码仓库' },
  { en: 'version control', zh: '版本控制' },
  { en: 'dependency', zh: '依赖' },
  { en: 'framework', zh: '框架' },
  { en: 'library', zh: '库' },
  { en: 'runtime', zh: '运行时' },
  { en: 'configuration', zh: '配置' },
  { en: 'config', zh: '配置' },
  { en: 'environment', zh: '环境' },
  { en: 'variable', zh: '变量' },
  { en: 'function', zh: '函数' },
  { en: 'module', zh: '模块' },
  { en: 'component', zh: '组件' },
  { en: 'interface', zh: '接口' },
  { en: 'exception', zh: '异常' },
  { en: 'logging', zh: '日志' },
  { en: 'monitoring', zh: '监控' },
  { en: 'security', zh: '安全' },
  { en: 'authentication', zh: '身份验证' },
  { en: 'authorization', zh: '授权' },
  { en: 'encryption', zh: '加密' },
  { en: 'test', zh: '测试' },
  { en: 'build', zh: '构建' },
  { en: 'error', zh: '错误' },
  { en: 'log', zh: '日志' },

  // 云 / 部署
  { en: 'microservice', zh: '微服务' },
  { en: 'micro-service', zh: '微服务' },
  { en: 'kubernetes', zh: 'Kubernetes' },
  { en: 'docker', zh: 'Docker' },
  { en: 'container', zh: '容器' },
  { en: 'webhook', zh: 'Webhook' },
  { en: 'endpoint', zh: '端点' },
  { en: 'streaming', zh: '流式' },
  { en: 'real-time', zh: '实时' },
  { en: 'realtime', zh: '实时' },
  { en: 'asynchronous', zh: '异步' },
  { en: 'async', zh: '异步' },
  { en: 'concurrent', zh: '并发' },
  { en: 'parallel', zh: '并行' },
  { en: 'performance', zh: '性能' },
  { en: 'latency', zh: '延迟' },
  { en: 'throughput', zh: '吞吐量' },
  { en: 'scalability', zh: '可扩展性' },
  { en: 'scalable', zh: '可扩展' },
  { en: 'reliability', zh: '可靠性' },
  { en: 'availability', zh: '可用性' },
  { en: 'backup', zh: '备份' },
  { en: 'migration', zh: '迁移' },
  { en: 'integration', zh: '集成' },
  { en: 'automation', zh: '自动化' },
  { en: 'automated', zh: '自动化' },
  { en: 'server', zh: '服务器' },
  { en: 'client', zh: '客户端' },
  { en: 'cloud', zh: '云' },

  // 文档 / 内容
  { en: 'documentation', zh: '文档' },
  { en: 'tutorial', zh: '教程' },
  { en: 'template', zh: '模板' },
  { en: 'generator', zh: '生成器' },
  { en: 'scaffold', zh: '脚手架' },
  { en: 'boilerplate', zh: '样板代码' },
  { en: 'snippet', zh: '代码片段' },
  { en: 'notification', zh: '通知' },
  { en: 'summary', zh: '摘要' },
  { en: 'summarize', zh: '总结' },
  { en: 'translation', zh: '翻译' },
  { en: 'translate', zh: '翻译' },
  { en: 'localization', zh: '本地化' },
  { en: 'i18n', zh: '国际化' },
  { en: 'search', zh: '搜索' },
  { en: 'filter', zh: '筛选' },
  { en: 'export', zh: '导出' },
  { en: 'import', zh: '导入' },
  { en: 'upload', zh: '上传' },
  { en: 'download', zh: '下载' },
  { en: 'guide', zh: '指南' },
  { en: 'example', zh: '示例' },
  { en: 'docs', zh: '文档' },
  { en: 'README', zh: 'README' },

  // 通信 / 协作
  { en: 'collaboration', zh: '协作' },
  { en: 'conversation', zh: '对话' },
  { en: 'messaging', zh: '消息' },
  { en: 'calendar', zh: '日历' },
  { en: 'schedule', zh: '日程' },
  { en: 'meeting', zh: '会议' },
  { en: 'analytics', zh: '分析' },
  { en: 'dashboard', zh: '仪表盘' },
  { en: 'visualization', zh: '可视化' },
  { en: 'spreadsheet', zh: '电子表格' },
  { en: 'workspace', zh: '工作区' },
  { en: 'session', zh: '会话' },
  { en: 'context', zh: '上下文' },
  { en: 'history', zh: '历史记录' },
  { en: 'version', zh: '版本' },
  { en: 'release', zh: '发布' },
  { en: 'changelog', zh: '更新日志' },
  { en: 'license', zh: '许可证' },
  { en: 'community', zh: '社区' },
  { en: 'contributor', zh: '贡献者' },
  { en: 'maintainer', zh: '维护者' },
  { en: 'pull request', zh: '拉取请求' },
  { en: 'PR', zh: '拉取请求' },
  { en: 'email', zh: '电子邮件' },
  { en: 'message', zh: '消息' },
  { en: 'chat', zh: '聊天' },
  { en: 'task', zh: '任务' },
  { en: 'issue', zh: '问题' },
  { en: 'project', zh: '项目' },
  { en: 'report', zh: '报告' },
  { en: 'document', zh: '文档' },
  { en: 'file', zh: '文件' },
  { en: 'folder', zh: '文件夹' },
  { en: 'directory', zh: '目录' },
  { en: 'path', zh: '路径' },
  { en: 'star', zh: '星标' },
  { en: 'fork', zh: '复刻' },
  { en: 'team', zh: '团队' },
  { en: 'table', zh: '表格' },
  { en: 'chart', zh: '图表' },
  { en: 'graph', zh: '图' },
];

// ─── 本地术语级翻译 ────────────────────────────────────────────────────────

interface TextSegment {
  type: 'code' | 'text';
  content: string;
}

/** 按围栏代码块切分，保证代码块不参与翻译。 */
function splitFenced(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const fencedRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fencedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 长词优先，避免 "AI" 抢先命中 "artificial intelligence" 等复合词
const SORTED_GLOSSARY = [...GLOSSARY].sort((a, b) => b.en.length - a.en.length);
const GLOSSARY_MAP = new Map<string, string>();
for (const e of SORTED_GLOSSARY) {
  GLOSSARY_MAP.set(e.en.toLowerCase(), e.zh);
}
const GLOSSARY_REGEX = new RegExp(
  SORTED_GLOSSARY.map((e) => `(?<![A-Za-z0-9])${escapeRegex(e.en)}(?![A-Za-z0-9])`).join('|'),
  'gi',
);

/** 在文本段内替换词库术语，行内代码保持不翻译。 */
function translateTextSegment(text: string): string {
  const inlineBlocks: string[] = [];
  const protectedText = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    const idx = inlineBlocks.length;
    inlineBlocks.push(`\`${code}\``);
    return `\u0000${idx}\u0000`;
  });
  const translated = protectedText.replace(GLOSSARY_REGEX, (m) => GLOSSARY_MAP.get(m.toLowerCase()) ?? m);
  return translated.replace(/\u0000(\d+)\u0000/g, (_m, idx) => inlineBlocks[Number(idx)] ?? _m);
}

/** 用预置词库对文本做本地术语级翻译（B 方案），代码块不翻译。 */
export function translateWithGlossary(text: string): string {
  return splitFenced(text)
    .map((seg) => (seg.type === 'code' ? seg.content : translateTextSegment(seg.content)))
    .join('');
}

/** 判断词库翻译是否产生了实际改动（避免展示无意义的"翻译"行）。 */
export function hasMeaningfulGlossaryTranslation(text: string): boolean {
  return translateWithGlossary(text) !== text;
}
