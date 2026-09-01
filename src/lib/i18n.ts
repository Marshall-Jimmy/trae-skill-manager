import { useI18nStore, type UiLang } from '../store/i18nStore';

// 语言包：key 按组件/语义分组，zh 为默认，en 为翻译。
const messages = {
  zh: {
    nav: {
      discover: '发现',
      installed: '已安装',
      sync: '同步',
      mcp: 'MCP',
      diagnosis: '诊断',
      graph: '关系图',
      preset: '技能栈',
      history: '历史',
      settings: '设置',
      customInstall: '自定义安装',
      categories: '分类',
      hotTags: '热门标签',
      clear: '清除',
    },
    common: {
      loading: '加载中...',
      refresh: '刷新',
      close: '关闭',
      cancel: '取消',
      confirm: '确认',
      save: '保存',
      saved: '已保存',
      search: '搜索',
      install: '安装',
      remove: '移除',
      export: '导出',
      import: '导入',
      openFolder: '在资源管理器中打开',
      rename: '重命名',
      removeProject: '移除项目',
      skillsCount: '{n} 个技能',
    },
    titlebar: {
      help: '帮助 (H)',
      minimize: '最小化',
      maximize: '最大化',
      restore: '还原',
      close: '关闭',
      changelog: '显示更新日志',
      devtools: '切换开发人员工具',
      report: '报告问题',
      process: '进程浏览器',
      docs: '帮助文档',
      contact: '联系我们',
      logs: '在文件夹中打开日志',
      checkUpdate: '检查更新...',
      about: '关于...',
      expandSidebar: '展开边栏',
      collapseSidebar: '收缩边栏',
    },
    settings: {
      title: '设置',
      subtitle: '管理 Skill 路径和主题偏好',
      globalSkillsPath: 'TRAE 全局 Skill 目录',
      globalSkillsPathHint: 'TRAE IDE 全局技能存放路径。修改后重新扫描生效。',
      autoDetecting: '自动检测中...',
      pathDetected: '已检测到路径',
      projectManagement: '项目管理',
      addProject: '添加项目',
      projectHint: '管理项目级 Skill（存放在项目的 .trae/skills/ 目录中）',
      noProjects: '暂无项目，点击上方「添加项目」按钮添加',
      theme: '主题',
      dark: '深色',
      light: '浅色',
      followSystem: '跟随系统',
      accentColor: '强调色',
      language: '语言',
      languageHint: '选择界面显示语言，跟随系统将自动匹配操作系统语言',
      save: '保存设置',
    },
  },
  en: {
    nav: {
      discover: 'Discover',
      installed: 'Installed',
      sync: 'Sync',
      mcp: 'MCP',
      diagnosis: 'Diagnosis',
      graph: 'Graph',
      preset: 'Presets',
      history: 'History',
      settings: 'Settings',
      customInstall: 'Custom Install',
      categories: 'Categories',
      hotTags: 'Hot Tags',
      clear: 'Clear',
    },
    common: {
      loading: 'Loading...',
      refresh: 'Refresh',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      saved: 'Saved',
      search: 'Search',
      install: 'Install',
      remove: 'Remove',
      export: 'Export',
      import: 'Import',
      openFolder: 'Open in File Explorer',
      rename: 'Rename',
      removeProject: 'Remove Project',
      skillsCount: '{n} skills',
    },
    titlebar: {
      help: 'Help (H)',
      minimize: 'Minimize',
      maximize: 'Maximize',
      restore: 'Restore',
      close: 'Close',
      changelog: 'Show Changelog',
      devtools: 'Toggle Developer Tools',
      report: 'Report Issue',
      process: 'Process Browser',
      docs: 'Documentation',
      contact: 'Contact Us',
      logs: 'Open Logs Folder',
      checkUpdate: 'Check for Updates...',
      about: 'About...',
      expandSidebar: 'Expand Sidebar',
      collapseSidebar: 'Collapse Sidebar',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Manage Skill paths and theme preferences',
      globalSkillsPath: 'TRAE Global Skills Directory',
      globalSkillsPathHint: 'Global skills path for TRAE IDE. Changes take effect after rescan.',
      autoDetecting: 'Auto-detecting...',
      pathDetected: 'Path detected',
      projectManagement: 'Project Management',
      addProject: 'Add Project',
      projectHint: 'Manage project-level skills (stored in the project .trae/skills/ directory)',
      noProjects: 'No projects yet. Click "Add Project" above to add one.',
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      followSystem: 'System',
      accentColor: 'Accent Color',
      language: 'Language',
      languageHint: 'Choose the UI language. System follows the OS language.',
      save: 'Save Settings',
    },
  },
} as const;

export type MessageKey = keyof typeof messages.zh;

export function t(key: string, vars?: Record<string, string | number>): string {
  const lang: UiLang = useI18nStore.getState().lang;
  const dict = messages[lang] ?? messages.zh;
  const path = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = dict;
  for (const seg of path) {
    if (value && typeof value === 'object' && seg in value) {
      value = value[seg];
    } else {
      value = undefined;
      break;
    }
  }
  if (typeof value !== 'string') {
    // Fall back to zh, then to the raw key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let zhValue: any = messages.zh;
    for (const seg of path) {
      if (zhValue && typeof zhValue === 'object' && seg in zhValue) {
        zhValue = zhValue[seg];
      } else {
        zhValue = undefined;
        break;
      }
    }
    value = typeof zhValue === 'string' ? zhValue : key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
