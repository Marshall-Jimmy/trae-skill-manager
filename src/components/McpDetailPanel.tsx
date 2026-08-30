import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Play,
  Square,
  RotateCcw,
  Settings,
  Trash2,
  AlertCircle,
  Clock,
  Hash,
  Folder,
  Globe,
  Terminal,
  Cpu,
  Layers,
} from 'lucide-react';
import { useMcpStore } from '../store/mcpStore';
import type { McpServer } from '../types';

type DetailTab = 'overview' | 'config' | 'logs';

interface McpDetailPanelProps {
  server: McpServer | null;
  onClose: () => void;
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

const tabContentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, mass: 1, stiffness: 200, damping: 24 },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export function McpDetailPanel({ server, onClose }: McpDetailPanelProps) {
  const { startServer, stopServer, restartServer, removeServer, openConfigDialog } = useMcpStore();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [server?.logs?.length, activeTab]);

  // Reset tab when server changes
  useEffect(() => {
    setActiveTab('overview');
  }, [server?.id]);

  if (!server) return null;

  const isRunning = server.status === 'running';
  const isError = server.status === 'error';

  const handleStart = () => startServer(server.id);
  const handleStop = () => stopServer(server.id);
  const handleRestart = () => restartServer(server.id);
  const handleEdit = () => {
    openConfigDialog(server, null);
  };
  const handleRemove = () => {
    if (confirm(`确定要删除 ${server.name} 吗？`)) {
      removeServer(server.id);
      onClose();
    }
  };

  const tabs: { key: DetailTab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: '概览', icon: Cpu },
    { key: 'config', label: '配置', icon: Settings },
    { key: 'logs', label: '日志', icon: Terminal },
  ];

  return (
    <AnimatePresence>
      {server && (
        <>
          {/* Backdrop */}
          <motion.div
            key="mcp-detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="mcp-detail-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '30%', opacity: 0 }}
            transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 25 }}
            className="fixed top-0 right-0 z-50 w-[460px] h-screen bg-trae-sidebar border-l border-trae-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-trae-border shrink-0">
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-trae-card/60 border border-trae-border flex items-center justify-center text-xl shrink-0">
                    {server.icon || '🔌'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-trae-text font-semibold text-lg truncate">{server.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isRunning
                            ? 'bg-trae-success/10 text-trae-success border border-trae-success/30'
                            : isError
                            ? 'bg-trae-danger/10 text-trae-danger border border-trae-danger/30'
                            : 'bg-trae-card/50 text-trae-text-secondary border border-trae-border'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning
                              ? 'bg-trae-success animate-pulse'
                              : isError
                              ? 'bg-trae-danger'
                              : 'bg-trae-text-secondary'
                          }`}
                        />
                        {isRunning ? '运行中' : isError ? '错误' : '已停止'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-accent/10 text-trae-accent">
                        {server.configType.toUpperCase()}
                      </span>
                    </div>
                  </div>
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
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-trae-accent'
                      : 'text-trae-text-secondary hover:text-trae-text'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="mcp-detail-tab-indicator"
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
                    {/* Description */}
                    {server.description && (
                      <div className="mb-5">
                        <p className="text-sm text-trae-text/80 leading-relaxed">
                          {server.description}
                        </p>
                      </div>
                    )}

                    {/* Status banner */}
                    {isError && server.errorMessage && (
                      <div className="mb-4 p-3 bg-trae-danger/10 border border-trae-danger/30 rounded-lg">
                        <div className="flex items-center gap-2 text-trae-danger text-sm font-medium">
                          <AlertCircle className="w-4 h-4" />
                          运行错误
                        </div>
                        <p className="text-xs text-trae-danger/70 mt-1 font-mono">
                          {server.errorMessage}
                        </p>
                      </div>
                    )}

                    {/* Meta info grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Category */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Layers className="w-3 h-3" />
                          分类
                        </div>
                        <p className="text-xs text-trae-text font-medium capitalize">
                          {server.category}
                        </p>
                      </div>

                      {/* Status */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Cpu className="w-3 h-3" />
                          状态
                        </div>
                        <p
                          className={`text-xs font-medium ${
                            isRunning
                              ? 'text-trae-success'
                              : isError
                              ? 'text-trae-danger'
                              : 'text-trae-text-secondary'
                          }`}
                        >
                          {isRunning ? '运行中' : isError ? '错误' : '已停止'}
                        </p>
                      </div>

                      {/* Source */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Globe className="w-3 h-3" />
                          来源
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {server.source === 'marketplace' ? '市场' : '自定义'}
                        </p>
                      </div>

                      {/* Connection type */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Terminal className="w-3 h-3" />
                          连接类型
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {server.configType.toUpperCase()}
                        </p>
                      </div>

                      {/* Added at */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Clock className="w-3 h-3" />
                          添加时间
                        </div>
                        <p className="text-xs text-trae-text font-medium">
                          {formatTimeAgo(server.installedAt)}
                        </p>
                      </div>

                      {/* PID (if running) */}
                      {isRunning && server.pid && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Hash className="w-3 h-3" />
                            进程 PID
                          </div>
                          <p className="text-xs text-trae-text font-mono">
                            {server.pid}
                          </p>
                        </div>
                      )}

                      {/* Last used */}
                      {server.lastUsedAt && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Clock className="w-3 h-3" />
                            最后使用
                          </div>
                          <p className="text-xs text-trae-text font-medium">
                            {formatTimeAgo(server.lastUsedAt)}
                          </p>
                        </div>
                      )}

                      {/* Working directory */}
                      {server.cwd && (
                        <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3 col-span-2">
                          <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                            <Folder className="w-3 h-3" />
                            工作目录
                          </div>
                          <p className="text-xs text-trae-text font-mono truncate" title={server.cwd}>
                            {server.cwd}
                          </p>
                        </div>
                      )}

                      {/* Server ID */}
                      <div className="bg-trae-card/30 border border-trae-border rounded-lg p-3 col-span-2">
                        <div className="flex items-center gap-1.5 text-trae-text-secondary text-[11px] mb-1">
                          <Hash className="w-3 h-3" />
                          服务器 ID
                        </div>
                        <p className="text-xs text-trae-text font-mono truncate" title={server.id}>
                          {server.id}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'config' && (
                  <motion.div
                    key="tab-config"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full overflow-y-auto px-5 py-4"
                  >
                    {/* Command section */}
                    <div className="mb-5">
                      <h3 className="text-sm font-medium text-trae-text mb-2 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-trae-text-secondary" />
                        启动命令
                      </h3>
                      <div className="bg-trae-bg border border-trae-border rounded-lg p-3">
                        <code className="text-xs text-trae-accent font-mono break-all">
                          {server.command}{' '}
                          {server.args.length > 0 && server.args.join(' ')}
                        </code>
                      </div>
                    </div>

                    {/* Environment variables */}
                    <div className="mb-5">
                      <h3 className="text-sm font-medium text-trae-text mb-2">环境变量</h3>
                      {Object.keys(server.env).length === 0 ? (
                        <p className="text-xs text-trae-text-secondary">
                          未配置环境变量
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {Object.entries(server.env).map(([key, value]) => (
                            <div
                              key={key}
                              className="bg-trae-card/30 border border-trae-border rounded-lg p-2.5"
                            >
                              <div className="text-xs text-trae-text-secondary font-mono mb-0.5">
                                {key}
                              </div>
                              <div className="text-xs text-trae-text font-mono truncate" title={value}>
                                {value ? (
                                  value.length > 20 ? `${value.slice(0, 10)}****${value.slice(-4)}` : value
                                ) : (
                                  <span className="text-trae-text-secondary/50 italic">未设置</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* URL for SSE */}
                    {server.configType === 'sse' && server.url && (
                      <div className="mb-5">
                        <h3 className="text-sm font-medium text-trae-text mb-2 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-trae-text-secondary" />
                          SSE URL
                        </h3>
                        <div className="bg-trae-bg border border-trae-border rounded-lg p-3">
                          <code className="text-xs text-trae-accent font-mono break-all">
                            {server.url}
                          </code>
                        </div>
                      </div>
                    )}

                    {/* Edit button */}
                    <button
                      onClick={handleEdit}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20"
                    >
                      <Settings className="w-4 h-4" />
                      编辑配置
                    </button>
                  </motion.div>
                )}

                {activeTab === 'logs' && (
                  <motion.div
                    key="tab-logs"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full flex flex-col"
                  >
                    {/* Log header */}
                    <div className="px-5 py-3 flex items-center justify-between border-b border-trae-border shrink-0">
                      <span className="text-xs text-trae-text-secondary">
                        {server.logs?.length || 0} 条日志
                      </span>
                      {isRunning && (
                        <span className="flex items-center gap-1 text-xs text-trae-success">
                          <span className="w-1.5 h-1.5 rounded-full bg-trae-success animate-pulse" />
                          实时输出
                        </span>
                      )}
                    </div>

                    {/* Log content */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-xs bg-trae-bg/50">
                      {!server.logs || server.logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-trae-text-secondary">
                          <Terminal className="w-8 h-8 mb-2 opacity-40" />
                          <p className="text-xs">暂无日志输出</p>
                          <p className="text-[11px] mt-1 opacity-70">
                            启动服务器后将在此显示输出
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {server.logs.map((line, i) => (
                            <div
                              key={i}
                              className={`break-all leading-relaxed ${
                                line.includes('[stderr]') || line.includes('Error') || line.includes('error')
                                  ? 'text-trae-danger/80'
                                  : line.includes('[MCP]')
                                  ? 'text-trae-accent/80'
                                  : 'text-trae-text-secondary'
                              }`}
                            >
                              {line}
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer: action buttons */}
            <div className="shrink-0 px-5 py-4 border-t border-trae-border space-y-2 bg-trae-sidebar">
              {/* Error message */}
              {isError && server.errorMessage && (
                <div className="px-3 py-2 rounded-lg bg-trae-danger/10 border border-trae-danger/20 text-xs text-trae-danger">
                  {server.errorMessage}
                </div>
              )}

              {/* Primary actions */}
              <div className="flex gap-2">
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-danger/15 text-trae-danger hover:bg-trae-danger/25 transition-all border border-trae-danger/20"
                  >
                    <Square className="w-4 h-4" />
                    停止
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20"
                  >
                    <Play className="w-4 h-4" />
                    启动
                  </button>
                )}
                <button
                  onClick={handleRestart}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                >
                  <RotateCcw className="w-4 h-4" />
                  重启
                </button>
              </div>

              {/* Secondary actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleEdit}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary hover:bg-trae-card/50 hover:text-trae-text transition-all border border-trae-border"
                >
                  <Settings className="w-3.5 h-3.5" />
                  编辑配置
                </button>
                <button
                  onClick={handleRemove}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-trae-card/30 text-trae-text-secondary hover:text-trae-danger hover:bg-trae-danger/10 hover:border-trae-danger/30 transition-all border border-trae-border"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
