import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus,
  Search,
  RefreshCw,
  Server,
  X,
  Grid3X3,
  Code,
  Database,
  Globe,
  Briefcase,
  Folder,
  Brain,
  Palette,
  Sparkles,
  TrendingUp,
  Download,
  Upload,
} from 'lucide-react';
import { useMcpStore } from '../store/mcpStore';
import { mcpCategories, getMcpServersByCategory, searchMcpServers } from '../lib/mcpMarketplace';
import { McpServerCard, McpMarketplaceCard } from './McpServerCard';
import { McpDetailPanel } from './McpDetailPanel';
import { McpConfigDialog } from './McpConfigDialog';
import type { McpServer, McpMarketplaceServer } from '../types';

const categoryIcons: Record<string, React.ElementType> = {
  all: Grid3X3,
  'dev-tools': Code,
  database: Database,
  browser: Globe,
  search: Search,
  productivity: Briefcase,
  filesystem: Folder,
  memory: Brain,
  design: Palette,
};

export function McpPage() {
  const {
    servers,
    loadServers,
    startServer,
    stopServer,
    restartServer,
    removeServer,
    addServer,
    openConfigDialog,
    configDialogOpen,
    closeConfigDialog,
    detailServer,
    setDetailServer,
    getRunningCount,
    isServerInstalled,
  } = useMcpStore();

  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Filtered marketplace servers
  const filteredMarketplaceServers = useMemo(() => {
    let result = getMcpServersByCategory(activeCategory);
    if (marketplaceSearch.trim()) {
      result = searchMcpServers(marketplaceSearch);
    }
    // Sort by stars descending
    return [...result].sort((a, b) => b.stars - a.stars);
  }, [activeCategory, marketplaceSearch]);

  // Stats
  const stats = useMemo(() => {
    const total = servers.length;
    const running = getRunningCount();
    const stopped = servers.filter((s) => s.status === 'stopped').length;
    const errored = servers.filter((s) => s.status === 'error').length;
    return { total, running, stopped, errored };
  }, [servers, getRunningCount]);

  // Handlers
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

  const handleStart = (id: string) => {
    startServer(id);
    const server = servers.find((s) => s.id === id);
    showToast('success', `${server?.name} 已启动`);
  };

  const handleStop = (id: string) => {
    stopServer(id);
    const server = servers.find((s) => s.id === id);
    showToast('success', `${server?.name} 已停止`);
  };

  const handleRestart = (id: string) => {
    restartServer(id);
    const server = servers.find((s) => s.id === id);
    showToast('success', `${server?.name} 正在重启`);
  };

  const handleEdit = (server: McpServer) => {
    openConfigDialog(server, null);
  };

  const handleRemove = (id: string) => {
    const server = servers.find((s) => s.id === id);
    if (!server) return;
    if (!confirm(`确定要删除 ${server.name} 吗？`)) return;
    removeServer(id);
    showToast('success', `${server.name} 已删除`);
  };

  const handleShowDetail = (server: McpServer) => {
    setDetailServer(server);
  };

  const handleCloseDetail = () => {
    setDetailServer(null);
  };

  const handleAddFromMarketplace = (template: McpMarketplaceServer) => {
    openConfigDialog(null, template);
  };

  const handleAddCustom = () => {
    openConfigDialog(null, null);
  };

  const handleRefresh = () => {
    loadServers();
    showToast('success', '已刷新');
  };

  const handleExport = async () => {
    if (servers.length === 0) {
      showToast('error', '没有可导出的 MCP Server');
      return;
    }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        title: '导出 MCP 配置',
        defaultPath: `mcp-config_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      await invoke('mcp_export_config', { servers, exportPath: path });
      showToast('success', `已导出 ${servers.length} 个 MCP Server`);
    } catch (e) {
      showToast('error', `导出失败: ${String(e)}`);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          const imported = Array.isArray(data.servers) ? data.servers : [];
          let count = 0;
          for (const s of imported) {
            if (s && s.name && s.command) {
              addServer({
                name: s.name,
                description: s.description || '',
                icon: s.icon || 'plug',
                category: s.category || 'other',
                command: s.command,
                args: Array.isArray(s.args) ? s.args : [],
                env: s.env && typeof s.env === 'object' ? s.env : {},
                cwd: s.cwd || undefined,
                configType: s.configType === 'sse' ? 'sse' : 'stdio',
                url: s.url || undefined,
                source: s.source === 'marketplace' ? 'marketplace' : 'user',
              });
              count++;
            }
          }
          showToast(count > 0 ? 'success' : 'error', count > 0 ? `已导入 ${count} 个 MCP Server` : '导入文件中没有有效的 MCP Server');
        } catch (err) {
          showToast('error', `导入失败: ${String(err)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Top trending servers for "热门推荐"
  const trendingServers = useMemo(() => {
    return filteredMarketplaceServers.slice(0, 6);
  }, [filteredMarketplaceServers]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-8">
          {/* ===== Configured Servers Section ===== */}
          <section className="mb-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-trae-text flex items-center gap-2">
                  <Server className="w-6 h-6 text-trae-accent" />
                  MCP 管理中心
                </h1>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <span className="text-sm text-trae-text-secondary">
                    总计 <span className="text-trae-text font-medium">{stats.total}</span> 个
                  </span>
                  <span className="text-sm text-trae-text-secondary">
                    运行中{' '}
                    <span className="text-trae-success font-medium">{stats.running}</span> 个
                  </span>
                  <span className="text-sm text-trae-text-secondary">
                    已停止{' '}
                    <span className="text-trae-text-secondary font-medium">{stats.stopped}</span> 个
                  </span>
                  {stats.errored > 0 && (
                    <span className="text-sm text-trae-text-secondary">
                      错误{' '}
                      <span className="text-trae-danger font-medium">{stats.errored}</span> 个
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={handleExport}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="导出 MCP 配置"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出
                </motion.button>
                <motion.button
                  onClick={handleImport}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="导入 MCP 配置"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  导入
                </motion.button>
                <motion.button
                  onClick={handleRefresh}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  刷新
                </motion.button>
                <motion.button
                  onClick={handleAddCustom}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20 shadow-hard-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加 MCP Server
                </motion.button>
              </div>
            </div>

            {/* Configured servers list */}
            {servers.length === 0 ? (
              <div className="bg-trae-card/20 border border-dashed border-trae-border rounded-xl p-10 text-center shadow-hard-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-trae-accent/10 border border-trae-accent/20 flex items-center justify-center">
                  <Server className="w-8 h-8 text-trae-accent" />
                </div>
                <h3 className="text-trae-text font-medium text-base mb-2">
                  还没有配置 MCP Server
                </h3>
                <p className="text-sm text-trae-text-secondary mb-5 max-w-md mx-auto">
                  MCP (Model Context Protocol) Servers 可以为 AI Agent 提供外部工具能力。
                  从下方市场选择一个热门 Server 添加，或手动配置自定义 Server。
                </p>
                <div className="flex items-center justify-center gap-3">
                  <motion.button
                    onClick={handleAddCustom}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-trae-accent/15 text-trae-accent hover:bg-trae-accent/25 transition-all border border-trae-accent/20"
                  >
                    <Plus className="w-4 h-4" />
                    手动添加
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {servers.map((server, index) => (
                  <McpServerCard
                    key={server.id}
                    server={server}
                    onStart={handleStart}
                    onStop={handleStop}
                    onRestart={handleRestart}
                    onEdit={handleEdit}
                    onRemove={handleRemove}
                    onShowDetail={handleShowDetail}
                    index={index}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Divider */}
          <div className="h-px bg-trae-border mb-8" />

          {/* ===== Marketplace Section ===== */}
          <section>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-trae-text flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-trae-accent" />
                  MCP 市场
                </h2>
                <p className="text-sm text-trae-text-secondary mt-1">
                  发现热门 MCP Server，一键添加到你的配置
                </p>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-trae-text-secondary" />
              <input
                type="text"
                value={marketplaceSearch}
                onChange={(e) => setMarketplaceSearch(e.target.value)}
                placeholder="搜索 MCP Server..."
                className="w-full pl-10 pr-4 py-2.5 bg-trae-card/30 border border-trae-border rounded-lg text-sm text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/40 focus:ring-1 focus:ring-trae-accent/30 transition-colors"
              />
              {marketplaceSearch && (
                <button
                  onClick={() => setMarketplaceSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-trae-text-secondary hover:text-trae-text transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {mcpCategories.map((cat) => {
                const Icon = categoryIcons[cat.id] || Grid3X3;
                const isActive = activeCategory === cat.id;
                return (
                  <motion.button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-trae-accent/15 text-trae-accent border border-trae-accent/20'
                        : 'bg-trae-card/30 text-trae-text-secondary border border-trae-border hover:bg-trae-card/50 hover:text-trae-text'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cat.name}
                  </motion.button>
                );
              })}
            </div>

            {/* Trending / Featured section (only on "all" tab with no search) */}
            {activeCategory === 'all' && !marketplaceSearch && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-trae-text mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-trae-accent" />
                  热门推荐
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trendingServers.slice(0, 3).map((server, index) => (
                    <McpMarketplaceCard
                      key={server.id}
                      server={server}
                      installed={isServerInstalled(server.id)}
                      onAdd={handleAddFromMarketplace}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Marketplace grid */}
            <div>
              {activeCategory === 'all' && !marketplaceSearch && (
                <h3 className="text-sm font-medium text-trae-text mb-3">全部 Server</h3>
              )}
              {filteredMarketplaceServers.length === 0 ? (
                <div className="bg-trae-card/20 border border-dashed border-trae-border rounded-xl p-8 text-center shadow-hard-sm">
                  <Search className="w-10 h-10 mx-auto mb-3 text-trae-text-secondary/50" />
                  <p className="text-sm text-trae-text-secondary">
                    没有找到匹配的 MCP Server
                  </p>
                  <p className="text-xs text-trae-text-secondary/70 mt-1">
                    试试其他关键词或分类
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredMarketplaceServers.map((server, index) => (
                    <McpMarketplaceCard
                      key={server.id}
                      server={server}
                      installed={isServerInstalled(server.id)}
                      onAdd={handleAddFromMarketplace}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer info */}
            <div className="mt-8 p-4 bg-trae-card/20 border border-trae-border rounded-xl shadow-hard-sm">
              <h4 className="text-sm font-medium text-trae-text mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-trae-accent" />
                关于 MCP (Model Context Protocol)
              </h4>
              <p className="text-xs text-trae-text-secondary leading-relaxed">
                MCP 是一个开放协议，用于将外部工具、数据源和服务连接到 AI 模型。
                通过 MCP Server，AI Agent 可以获得操作文件系统、查询数据库、
                调用外部 API 等能力。配置的 Server 将在 Agent 运行时提供工具调用接口。
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Detail Panel */}
      <McpDetailPanel server={detailServer} onClose={handleCloseDetail} />

      {/* Config Dialog */}
      <McpConfigDialog open={configDialogOpen} onClose={closeConfigDialog} />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', mass: 1, stiffness: 250, damping: 22 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-hard z-50 ${
              toast.type === 'success'
                ? 'bg-trae-success/20 text-trae-success border border-trae-success/30'
                : 'bg-trae-danger/20 text-trae-danger border border-trae-danger/30'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
