import { create } from 'zustand';
import type { McpServer, McpMarketplaceServer, McpServerStatus } from '../types';
import { getMcpMarketplaceServerById } from '../lib/mcpMarketplace';

// ─── Storage key ──────────────────────────────────────────────────────────

const MCP_SERVERS_KEY = 'trae-skill-manager-mcp-servers';
const MAX_LOG_LINES = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────

function loadMcpServers(): McpServer[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(MCP_SERVERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => s && typeof s === 'object' && s.id);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveMcpServers(servers: McpServer[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(servers));
  } catch {
    // ignore
  }
}

function generateId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── State ────────────────────────────────────────────────────────────────

interface McpState {
  servers: McpServer[];
  selectedServerId: string | null;
  detailServer: McpServer | null;
  configDialogOpen: boolean;
  editingServer: McpServer | null;
  marketplaceTemplate: McpMarketplaceServer | null;
  loading: boolean;
  error: string | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────

interface McpActions {
  loadServers: () => void;
  addServer: (server: Omit<McpServer, 'id' | 'installedAt' | 'status'>) => McpServer;
  addServerFromMarketplace: (template: McpMarketplaceServer, envOverrides?: Record<string, string>) => McpServer;
  updateServer: (id: string, updates: Partial<McpServer>) => void;
  removeServer: (id: string) => void;
  setSelectedServer: (id: string | null) => void;
  setDetailServer: (server: McpServer | null) => void;
  openConfigDialog: (server?: McpServer | null, template?: McpMarketplaceServer | null) => void;
  closeConfigDialog: () => void;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  appendLog: (id: string, line: string, type: 'stdout' | 'stderr') => void;
  clearLogs: (id: string) => void;
  getRunningCount: () => number;
  getServerById: (id: string) => McpServer | undefined;
  isServerInstalled: (marketplaceId: string) => boolean;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useMcpStore = create<McpState & McpActions>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────

  servers: [],
  selectedServerId: null,
  detailServer: null,
  configDialogOpen: false,
  editingServer: null,
  marketplaceTemplate: null,
  loading: false,
  error: null,

  // ── Actions ────────────────────────────────────────────────────────────

  loadServers: () => {
    const servers = loadMcpServers();
    // Reset all running statuses to stopped on load (processes don't survive app restart)
    const normalized = servers.map((s) =>
      s.status === 'running'
        ? { ...s, status: 'stopped' as McpServerStatus, pid: undefined }
        : s,
    );
    set({ servers: normalized });
    saveMcpServers(normalized);
  },

  addServer: (server) => {
    const newServer: McpServer = {
      ...server,
      id: generateId(),
      installedAt: Date.now(),
      status: 'stopped',
      logs: [],
    };
    const next = [...get().servers, newServer];
    set({ servers: next });
    saveMcpServers(next);
    return newServer;
  },

  addServerFromMarketplace: (template, envOverrides) => {
    const env: Record<string, string> = {};
    for (const ev of template.envVars) {
      if (envOverrides && envOverrides[ev.key] !== undefined) {
        env[ev.key] = envOverrides[ev.key];
      } else {
        env[ev.key] = '';
      }
    }

    const newServer: McpServer = {
      id: generateId(),
      name: template.name,
      description: template.description,
      icon: template.icon,
      category: template.category,
      command: template.command,
      args: [...template.args],
      env,
      status: 'stopped',
      configType: template.configType,
      url: template.url,
      source: 'marketplace',
      installedAt: Date.now(),
      logs: [],
    };

    const next = [...get().servers, newServer];
    set({ servers: next });
    saveMcpServers(next);
    return newServer;
  },

  updateServer: (id, updates) => {
    const next = get().servers.map((s) =>
      s.id === id ? { ...s, ...updates } : s,
    );
    set({ servers: next });
    saveMcpServers(next);

    // Update detail server if it's the one being edited
    const { detailServer } = get();
    if (detailServer && detailServer.id === id) {
      const updated = next.find((s) => s.id === id);
      if (updated) {
        set({ detailServer: updated });
      }
    }
  },

  removeServer: (id) => {
    const server = get().servers.find((s) => s.id === id);
    // Stop first if running
    if (server && server.status === 'running') {
      // TODO: actual process termination via Rust backend
      // For MVP, just mark as stopped
    }
    const next = get().servers.filter((s) => s.id !== id);
    set({ servers: next });
    saveMcpServers(next);

    // Clear detail panel if it was showing this server
    const { detailServer, selectedServerId } = get();
    if (detailServer?.id === id) {
      set({ detailServer: null });
    }
    if (selectedServerId === id) {
      set({ selectedServerId: null });
    }
  },

  setSelectedServer: (id) => {
    set({ selectedServerId: id });
  },

  setDetailServer: (server) => {
    set({ detailServer: server });
  },

  openConfigDialog: (server = null, template = null) => {
    set({
      configDialogOpen: true,
      editingServer: server,
      marketplaceTemplate: template,
    });
  },

  closeConfigDialog: () => {
    set({
      configDialogOpen: false,
      editingServer: null,
      marketplaceTemplate: null,
    });
  },

  startServer: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server) return;

    // TODO: Actual process management via Tauri/Rust backend
    // For MVP, simulate the start process with status transitions
    // In production, use @tauri-apps/plugin-shell's Command API or a Rust command

    // Simulate: mark as running after a short delay
    get().updateServer(id, { status: 'running', errorMessage: undefined, logs: [] });

    // Simulate initial log output
    setTimeout(() => {
      get().appendLog(id, `[MCP] Starting ${server.name}...`, 'stdout');
      get().appendLog(id, `[MCP] Command: ${server.command} ${server.args.join(' ')}`, 'stdout');
      get().appendLog(id, `[MCP] Server started successfully (stdio mode)`, 'stdout');
      get().appendLog(id, `[MCP] Ready to receive requests`, 'stdout');
    }, 500);

    // Note: Real implementation would be something like:
    // const child = new Command(server.command, server.args, { env: server.env, cwd: server.cwd });
    // child.on('close', () => { ... });
    // child.stdout.on('data', (data) => { ... });
    // child.spawn();
  },

  stopServer: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server) return;

    // TODO: Actual process termination via Tauri/Rust backend
    // For MVP, simulate stopping

    get().appendLog(id, `[MCP] Stopping server...`, 'stdout');

    setTimeout(() => {
      get().updateServer(id, { status: 'stopped', pid: undefined });
      get().appendLog(id, `[MCP] Server stopped`, 'stdout');
    }, 300);
  },

  restartServer: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server) return;

    await get().stopServer(id);

    setTimeout(() => {
      get().startServer(id);
    }, 500);
  },

  appendLog: (id, line, type) => {
    const servers = get().servers;
    const server = servers.find((s) => s.id === id);
    if (!server) return;

    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const prefix = type === 'stderr' ? '[stderr]' : '[stdout]';
    const logLine = `[${timestamp}] ${prefix} ${line}`;

    const currentLogs = server.logs || [];
    const newLogs = [...currentLogs, logLine].slice(-MAX_LOG_LINES);

    const next = servers.map((s) =>
      s.id === id ? { ...s, logs: newLogs } : s,
    );
    set({ servers: next });

    // Update detail server if open
    const { detailServer } = get();
    if (detailServer?.id === id) {
      const updated = next.find((s) => s.id === id);
      if (updated) {
        set({ detailServer: updated });
      }
    }
  },

  clearLogs: (id) => {
    const next = get().servers.map((s) =>
      s.id === id ? { ...s, logs: [] } : s,
    );
    set({ servers: next });

    const { detailServer } = get();
    if (detailServer?.id === id) {
      const updated = next.find((s) => s.id === id);
      if (updated) {
        set({ detailServer: updated });
      }
    }
  },

  getRunningCount: () => {
    return get().servers.filter((s) => s.status === 'running').length;
  },

  getServerById: (id) => {
    return get().servers.find((s) => s.id === id);
  },

  isServerInstalled: (marketplaceId) => {
    // Check if a server from marketplace is already added by matching name
    const template = getMcpMarketplaceServerById(marketplaceId);
    if (!template) return false;
    return get().servers.some(
      (s) => s.name === template.name && s.source === 'marketplace',
    );
  },
}));
