import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Server,
  Globe,
  Terminal,
} from 'lucide-react';
import { useMcpStore } from '../store/mcpStore';
import { useSkillStore } from '../store/skillStore';
import { ToolIcon } from './ToolIcon';
import { McpIcon, mcpIconNames } from '../lib/iconMap';
import type {
  McpServer,
  McpConfigType,
  McpTestResult,
  McpConnectionConfig,
  McpTargetInfo,
  McpWriteResult,
} from '../types';

interface McpConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onToast?: (type: 'success' | 'error', message: string) => void;
}

interface EnvVar {
  key: string;
  value: string;
}

export function McpConfigDialog({ open, onClose, onToast }: McpConfigDialogProps) {
  const { editingServer, marketplaceTemplate, addServer, updateServer, addServerFromMarketplace, startServer } =
    useMcpStore();
  const getCurrentProject = useSkillStore((s) => s.getCurrentProject);

  const isEditing = !!editingServer;
  const isFromMarketplace = !!marketplaceTemplate && !editingServer;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('dev-tools');
  const [command, setCommand] = useState('npx');
  const [argsText, setArgsText] = useState('');
  const [configType, setConfigType] = useState<McpConfigType>('stdio');
  const [url, setUrl] = useState('');
  const [cwd, setCwd] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');

  // Cross-tool sync state (Phase 6)
  const [targets, setTargets] = useState<McpTargetInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [conflictResults, setConflictResults] = useState<McpWriteResult[] | null>(null);

  // Initialize form from editing server or marketplace template
  useEffect(() => {
    if (!open) return;

    if (editingServer) {
      setName(editingServer.name);
      setDescription(editingServer.description);
      setIcon(editingServer.icon || '');
      setCategory(editingServer.category);
      setCommand(editingServer.command);
      setArgsText(editingServer.args.join(' '));
      setConfigType(editingServer.configType);
      setUrl(editingServer.url || '');
      setCwd(editingServer.cwd || '');
      setEnvVars(
        Object.entries(editingServer.env).map(([key, value]) => ({ key, value })),
      );
    } else if (marketplaceTemplate) {
      setName(marketplaceTemplate.name);
      setDescription(marketplaceTemplate.description);
      setIcon(marketplaceTemplate.icon);
      setCategory(marketplaceTemplate.category);
      setCommand(marketplaceTemplate.command);
      setArgsText(marketplaceTemplate.args.join(' '));
      setConfigType(marketplaceTemplate.configType);
      setUrl(marketplaceTemplate.url || '');
      setCwd('');
      setEnvVars(
        marketplaceTemplate.envVars.map((ev) => ({ key: ev.key, value: '' })),
      );
    } else {
      // New blank server
      setName('');
      setDescription('');
      setIcon('plug');
      setCategory('dev-tools');
      setCommand('npx');
      setArgsText('');
      setConfigType('stdio');
      setUrl('');
      setCwd('');
      setEnvVars([]);
    }

    setErrors({});
    setTestResult(null);
    setTestMessage('');
  }, [open, editingServer?.id, marketplaceTemplate?.id]);

  // Load MCP config targets when dialog opens
  useEffect(() => {
    if (!open) return;
    const project = getCurrentProject();
    const projectPath = project?.path || null;
    setConflictResults(null);
    invoke<McpTargetInfo[]>('mcp_get_targets', { projectPath })
      .then((list) => {
        setTargets(list);
        const available = list.filter((t) => t.path).map((t) => t.toolId);
        // 编辑时沿用已保存的目标工具；新建或旧数据默认全选可用工具
        const saved =
          editingServer?.targetTools?.filter((id) => available.includes(id)) || [];
        setSelectedTools(saved.length > 0 ? saved : available);
      })
      .catch(() => setTargets([]));
  }, [open, editingServer?.id, getCurrentProject]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = '请输入名称';
    }
    if (!command.trim()) {
      newErrors.command = '请输入启动命令';
    }
    if (configType === 'sse' && !url.trim()) {
      newErrors.url = 'SSE 模式需要 URL';
    } else if (configType === 'sse' && url.trim() && !/^https?:\/\//i.test(url.trim())) {
      newErrors.url = 'URL 必须以 http:// 或 https:// 开头';
    }

    // Validate env var keys
    for (const ev of envVars) {
      if (ev.key && !ev.key.match(/^[A-Z_][A-Z0-9_]*$/i)) {
        newErrors.env = `环境变量名 "${ev.key}" 格式不正确`;
        break;
      }
    }

    // Check required env vars from marketplace template
    if (marketplaceTemplate && !editingServer) {
      for (const requiredEnv of marketplaceTemplate.envVars.filter((e) => e.required)) {
        const found = envVars.find((ev) => ev.key === requiredEnv.key);
        if (!found || !found.value.trim()) {
          newErrors.env = `请填写必填环境变量: ${requiredEnv.key}`;
          break;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string) => {
    const next = [...envVars];
    next[index] = { ...next[index], [field]: value };
    setEnvVars(next);
  };

  const buildEnvObject = (): Record<string, string> => {
    const env: Record<string, string> = {};
    for (const ev of envVars) {
      if (ev.key.trim()) {
        env[ev.key.trim()] = ev.value;
      }
    }
    return env;
  };

  const parseArgs = (): string[] => {
    if (!argsText.trim()) return [];
    // Simple split by spaces, respecting quoted strings
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current.trim()) {
          result.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      result.push(current.trim());
    }
    return result;
  };

  const handleTestConnection = async () => {
    if (!validate()) return;

    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      const result = await invoke<McpTestResult>('mcp_test_connection', {
        config: {
          name: name.trim(),
          command: command.trim(),
          args: parseArgs(),
          env: buildEnvObject(),
          cwd: cwd.trim() || undefined,
          configType,
          url: url.trim() || undefined,
        },
      });
      setTestResult(result.success ? 'success' : 'error');
      setTestMessage(
        result.hint || result.message || (result.success ? '连接测试成功' : '连接测试失败'),
      );
      if (!result.success && result.stderr) {
        setTestMessage((prev) => `${prev}\n${result.stderr}`);
      }
    } catch (e) {
      setTestResult('error');
      setTestMessage(`测试失败: ${String(e)}`);
    }

    setTesting(false);
  };

  const buildServerConfig = (): McpConnectionConfig => ({
    name: name.trim(),
    command: command.trim(),
    args: parseArgs(),
    env: buildEnvObject(),
    cwd: cwd.trim() || undefined,
    configType,
    url: url.trim() || undefined,
  });

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId],
    );
  };

  const toolNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of targets) m[t.toolId] = t.displayName;
    return m;
  }, [targets]);

  // 把 server 配置写入所有选中工具的配置文件；返回结果供调用方判断冲突。
  const writeToTargets = async (
    serverConfig: McpConnectionConfig,
    overwriteConflicts = false,
  ): Promise<McpWriteResult[]> => {
    if (selectedTools.length === 0) return [];
    const project = getCurrentProject();
    const projectPath = project?.path || null;
    setSyncing(true);
    try {
      const results = await invoke<McpWriteResult[]>('mcp_write_servers', {
        servers: [serverConfig],
        toolIds: selectedTools,
        projectPath,
        overwriteConflicts,
      });
      if (!overwriteConflicts) {
        const withConflicts = results.filter((r) => r.conflicts.length > 0);
        if (withConflicts.length > 0) {
          setConflictResults(results);
          return results;
        }
      }
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        onToast?.('error', `同步失败：${failed.map((r) => r.message).join('；')}`);
      } else {
        onToast?.('success', `已同步到 ${results.length} 个工具的配置`);
      }
      return results;
    } catch (e) {
      onToast?.('error', `同步配置失败：${String(e)}`);
      return [];
    } finally {
      setSyncing(false);
    }
  };

  // 保存到应用本地 + 写入目标工具；返回 null 表示存在待处理冲突（保持对话框打开）。
  const performSave = async (): Promise<McpServer | null> => {
    if (!validate()) return null;

    const env = buildEnvObject();
    const args = parseArgs();
    const serverConfig = buildServerConfig();

    let server: McpServer;
    if (editingServer) {
      updateServer(editingServer.id, {
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || undefined,
        category,
        command: command.trim(),
        args,
        env,
        configType,
        url: url.trim() || undefined,
        cwd: cwd.trim() || undefined,
        targetTools: selectedTools,
      });
      server = editingServer;
    } else if (marketplaceTemplate) {
      server = addServerFromMarketplace(marketplaceTemplate, env);
      updateServer(server.id, { targetTools: selectedTools });
    } else {
      server = addServer({
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || undefined,
        category,
        command: command.trim(),
        args,
        env,
        configType,
        url: url.trim() || undefined,
        cwd: cwd.trim() || undefined,
        source: 'user',
      });
      updateServer(server.id, { targetTools: selectedTools });
    }

    const results = await writeToTargets(serverConfig);
    if (results.some((r) => r.conflicts.length > 0)) {
      return null;
    }
    return server;
  };

  const handleSave = async () => {
    const server = await performSave();
    if (server) onClose();
  };

  const handleSaveAndStart = async () => {
    const server = await performSave();
    if (server) {
      setTimeout(() => startServer(server.id), 200);
      onClose();
    }
  };

  const handleOverwrite = async () => {
    if (!conflictResults) return;
    const serverConfig = buildServerConfig();
    const results = await writeToTargets(serverConfig, true);
    if (results.some((r) => r.conflicts.length > 0)) return;
    setConflictResults(null);
    onClose();
  };

  const handleCancelOverwrite = () => {
    setConflictResults(null);
    onToast?.('success', '已保存，未覆盖冲突的工具配置');
    onClose();
  };

  const dialogTitle = isEditing
    ? '编辑 MCP Server'
    : isFromMarketplace
    ? `添加 ${marketplaceTemplate?.name}`
    : '添加 MCP Server';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24 }}
              className="pointer-events-auto w-[560px] max-w-[90vw] max-h-[85vh] bg-trae-sidebar border border-trae-border rounded-xl shadow-hard-lg overflow-hidden flex flex-col"
            >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-trae-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-trae-accent/10 border border-trae-accent/20 flex items-center justify-center">
                  <Server className="w-4 h-4 text-trae-accent" />
                </div>
                <h3 className="text-trae-text font-semibold text-base">{dialogTitle}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basic info */}
              <div>
                <h4 className="text-sm font-medium text-trae-text mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-trae-accent rounded-full" />
                  基本信息
                </h4>
                <div className="space-y-3 pl-3">
                  {/* Name */}
                  <div>
                    <label className="block text-xs text-trae-text-secondary mb-1">
                      名称 <span className="text-trae-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My MCP Server"
                      className={`w-full px-3 py-2 bg-trae-bg border rounded-lg text-sm text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:ring-1 transition-colors ${
                        errors.name
                          ? 'border-trae-danger/50 focus:border-trae-danger focus:ring-trae-danger/30'
                          : 'border-trae-border focus:border-trae-accent/40 focus:ring-trae-accent/30'
                      }`}
                    />
                    {errors.name && (
                      <p className="text-xs text-trae-danger mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* Icon picker */}
                  <div>
                    <label className="block text-xs text-trae-text-secondary mb-1">图标</label>
                    <div className="grid grid-cols-8 gap-1.5">
                      {mcpIconNames.map((iconName) => (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => setIcon(iconName)}
                          title={iconName}
                          className={`w-8 h-8 flex items-center justify-center border transition-colors ${
                            icon === iconName
                              ? 'bg-trae-accent/20 border-trae-accent text-trae-accent'
                              : 'bg-trae-bg border-trae-border text-trae-text-secondary hover:text-trae-text hover:border-trae-accent/40'
                          }`}
                        >
                          <McpIcon name={iconName} className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-trae-text-secondary mb-1">描述</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="MCP Server 的功能描述..."
                      rows={2}
                      className="w-full px-3 py-2 bg-trae-bg border border-trae-border rounded-lg text-sm text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors resize-none"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs text-trae-text-secondary mb-1">分类</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-trae-bg border border-trae-border rounded-lg text-sm text-trae-text focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors cursor-pointer"
                    >
                      <option value="dev-tools">开发工具</option>
                      <option value="database">数据库</option>
                      <option value="browser">浏览器</option>
                      <option value="search">搜索</option>
                      <option value="productivity">办公协作</option>
                      <option value="filesystem">文件系统</option>
                      <option value="memory">记忆存储</option>
                      <option value="design">设计</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Connection config */}
              <div>
                <h4 className="text-sm font-medium text-trae-text mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-trae-accent rounded-full" />
                  连接配置
                </h4>
                <div className="space-y-3 pl-3">
                  {/* Config type toggle */}
                  <div className="flex items-center bg-trae-card/30 border border-trae-border rounded-md p-0.5 w-fit">
                    <button
                      onClick={() => setConfigType('stdio')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        configType === 'stdio'
                          ? 'bg-trae-accent/20 text-trae-accent'
                          : 'text-trae-text-secondary hover:text-trae-text'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      Stdio
                    </button>
                    <button
                      onClick={() => setConfigType('sse')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        configType === 'sse'
                          ? 'bg-trae-accent/20 text-trae-accent'
                          : 'text-trae-text-secondary hover:text-trae-text'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      SSE
                    </button>
                  </div>

                  {configType === 'stdio' && (
                    <>
                      {/* Command */}
                      <div>
                        <label className="block text-xs text-trae-text-secondary mb-1">
                          启动命令 <span className="text-trae-danger">*</span>
                        </label>
                        <input
                          type="text"
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          placeholder="npx / python / node..."
                          className={`w-full px-3 py-2 bg-trae-bg border rounded-lg text-sm font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:ring-1 transition-colors ${
                            errors.command
                              ? 'border-trae-danger/50 focus:border-trae-danger focus:ring-trae-danger/30'
                              : 'border-trae-border focus:border-trae-accent/40 focus:ring-trae-accent/30'
                          }`}
                        />
                        {errors.command && (
                          <p className="text-xs text-trae-danger mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.command}
                          </p>
                        )}
                      </div>

                      {/* Args */}
                      <div>
                        <label className="block text-xs text-trae-text-secondary mb-1">
                          参数
                        </label>
                        <input
                          type="text"
                          value={argsText}
                          onChange={(e) => setArgsText(e.target.value)}
                          placeholder="-y @modelcontextprotocol/server-github"
                          className="w-full px-3 py-2 bg-trae-bg border border-trae-border rounded-lg text-sm font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors"
                        />
                        <p className="text-[11px] text-trae-text-secondary/70 mt-1">
                          多个参数用空格分隔，带空格的值用引号包裹
                        </p>
                      </div>

                      {/* Working directory */}
                      <div>
                        <label className="block text-xs text-trae-text-secondary mb-1">
                          工作目录（可选）
                        </label>
                        <input
                          type="text"
                          value={cwd}
                          onChange={(e) => setCwd(e.target.value)}
                          placeholder="/path/to/working/dir"
                          className="w-full px-3 py-2 bg-trae-bg border border-trae-border rounded-lg text-sm font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors"
                        />
                      </div>
                    </>
                  )}

                  {configType === 'sse' && (
                    <div>
                      <label className="block text-xs text-trae-text-secondary mb-1">
                        SSE URL <span className="text-trae-danger">*</span>
                      </label>
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="http://localhost:3000/mcp/sse"
                        className={`w-full px-3 py-2 bg-trae-bg border rounded-lg text-sm font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:ring-1 transition-colors ${
                          errors.url
                            ? 'border-trae-danger/50 focus:border-trae-danger focus:ring-trae-danger/30'
                            : 'border-trae-border focus:border-trae-accent/40 focus:ring-trae-accent/30'
                        }`}
                      />
                      {errors.url && (
                        <p className="text-xs text-trae-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.url}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Environment variables */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-trae-text flex items-center gap-2">
                    <span className="w-1 h-4 bg-trae-accent rounded-full" />
                    环境变量
                  </h4>
                  <button
                    onClick={handleAddEnvVar}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-trae-text-secondary hover:text-trae-accent hover:bg-trae-accent/10 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加
                  </button>
                </div>
                <div className="space-y-2 pl-3">
                  {envVars.length === 0 ? (
                    <p className="text-xs text-trae-text-secondary/70 pl-1">
                      暂无环境变量配置
                    </p>
                  ) : (
                    envVars.map((ev, index) => {
                      // Check if this is a required env var from marketplace
                      const isRequired = marketplaceTemplate?.envVars.find(
                        (e) => e.key === ev.key,
                      )?.required;
                      const hasValue = ev.value.trim() !== '';

                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={ev.key}
                              onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                              placeholder="变量名"
                              disabled={isFromMarketplace && !!marketplaceTemplate?.envVars.find((e) => e.key === ev.key)}
                              className="w-full px-3 py-2 bg-trae-bg border border-trae-border rounded-lg text-xs font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div className="flex-[1.5] min-w-0">
                            <input
                              type="text"
                              value={ev.value}
                              onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                              placeholder={isRequired ? '必填' : '值'}
                              className={`w-full px-3 py-2 bg-trae-bg border rounded-lg text-xs font-mono text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:ring-1 transition-colors ${
                                isRequired && !hasValue
                                  ? 'border-trae-danger/40 focus:border-trae-danger focus:ring-trae-danger/30'
                                  : 'border-trae-border focus:border-trae-accent/40 focus:ring-trae-accent/30'
                              }`}
                            />
                          </div>
                          <button
                            onClick={() => handleRemoveEnvVar(index)}
                            disabled={isFromMarketplace && !!marketplaceTemplate?.envVars.find((e) => e.key === ev.key)}
                            className="p-2 rounded-lg text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                  {errors.env && (
                    <p className="text-xs text-trae-danger flex items-center gap-1 pt-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.env}
                    </p>
                  )}
                </div>
              </div>

              {/* Target tools (Phase 6 跨工具同步) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-trae-text flex items-center gap-2">
                    <span className="w-1 h-4 bg-trae-accent rounded-full" />
                    目标工具
                  </h4>
                  <span className="text-[11px] text-trae-text-secondary/70">
                    保存时同步写入所选工具的 MCP 配置
                  </span>
                </div>
                <div className="pl-3 space-y-2">
                  {targets.length === 0 ? (
                    <p className="text-xs text-trae-text-secondary/70">
                      正在检测可用的工具配置...
                    </p>
                  ) : (
                    targets.map((t) => {
                      const checked = selectedTools.includes(t.toolId);
                      const disabled = !t.path;
                      return (
                        <label
                          key={t.toolId}
                          className={`flex items-center gap-2.5 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                            checked
                              ? 'bg-trae-accent/10 border-trae-accent/30'
                              : 'bg-trae-card/20 border-trae-border hover:bg-trae-card/40'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleTool(t.toolId)}
                            className="w-3.5 h-3.5 accent-trae-accent"
                          />
                          <ToolIcon id={t.toolId} className="w-4 h-4" />
                          <span className="text-xs text-trae-text flex-1 truncate">
                            {t.displayName}
                          </span>
                          {disabled ? (
                            <span className="text-[10px] text-trae-text-secondary/60 shrink-0">
                              需要项目路径
                            </span>
                          ) : t.exists ? (
                            <span className="text-[10px] text-trae-text-secondary/70 shrink-0">
                              {t.serverNames.length > 0
                                ? `已配置 ${t.serverNames.length} 个`
                                : '已检测到配置'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-trae-text-secondary/60 shrink-0">
                              将新建配置文件
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Conflict warning (Phase 6) */}
              {conflictResults && (
                <div className="pl-3">
                  <div className="p-3 rounded-lg border border-trae-warning/40 bg-trae-warning/10">
                    <div className="flex items-center gap-2 text-sm font-medium text-trae-warning mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      检测到配置冲突
                    </div>
                    <p className="text-xs text-trae-text-secondary mb-3">
                      以下工具中已存在同名 MCP Server 且配置不同，直接保存会覆盖原配置：
                    </p>
                    <div className="space-y-1.5 mb-3">
                      {conflictResults
                        .filter((r) => r.conflicts.length > 0)
                        .map((r) => (
                          <div key={r.toolId} className="text-xs text-trae-text">
                            <span className="text-trae-accent font-medium">
                              {toolNameMap[r.toolId] || r.toolId}
                            </span>
                            <span className="text-trae-text-secondary">
                              {' · '}
                              {r.conflicts.map((c) => c.serverName).join(', ')}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleOverwrite}
                        disabled={syncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-warning/20 text-trae-warning hover:bg-trae-warning/30 border border-trae-warning/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        覆盖写入
                      </button>
                      <button
                        onClick={handleCancelOverwrite}
                        disabled={syncing}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Test connection */}
              <div>
                <h4 className="text-sm font-medium text-trae-text mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-trae-accent rounded-full" />
                  连接测试
                </h4>
                <div className="pl-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text border border-trae-border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        测试中...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        测试连接
                      </>
                    )}
                  </button>
                  {testResult && (
                    <div
                      className={`mt-3 p-3 rounded-lg border ${
                        testResult === 'success'
                          ? 'bg-trae-success/10 border-trae-success/30'
                          : 'bg-trae-danger/10 border-trae-danger/30'
                      }`}
                    >
                      <div
                        className={`flex items-center gap-2 text-sm font-medium ${
                          testResult === 'success' ? 'text-trae-success' : 'text-trae-danger'
                        }`}
                      >
                        {testResult === 'success' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        {testResult === 'success' ? '测试成功' : '测试失败'}
                      </div>
                      <p className="text-xs mt-1 text-trae-text-secondary">{testMessage}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-trae-border bg-trae-card/30 shrink-0">
              <button
                onClick={onClose}
                disabled={syncing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={syncing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                保存
              </button>
              {!isEditing && (
                <button
                  onClick={handleSaveAndStart}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-trae-accent/25 text-trae-accent hover:bg-trae-accent/35 transition-all border border-trae-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  保存并启动
                </button>
              )}
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
