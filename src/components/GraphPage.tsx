import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  X,
  Download,
  Loader2,
} from 'lucide-react';
import { useSkillStore, getSkillCategory } from '../store/skillStore';
import { CATEGORIES, type RemoteSkill, type LocalSkill, type SkillCategory } from '../types';

// ─── Graph types ───────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  description: string;
  source: string;
  installs: number;
  stars: number;
  tags: string[];
  category: SkillCategory;
  radius: number;
  isRemote: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  fixed: boolean;
}

interface GraphEdge {
  source: number;
  target: number;
}

interface InteractionState {
  mode: 'pan' | 'node';
  nodeIndex: number | null;
  startX: number;
  startY: number;
  startPan: { x: number; y: number };
  moved: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  all: '#94a3b8',
  'dev-tools': '#00ff88',
  office: '#3b82f6',
  data: '#a855f7',
  creative: '#f97316',
  social: '#06b6d4',
  system: '#ec4899',
  'ai-enhanced': '#facc15',
  more: '#94a3b8',
};

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

const MAX_NODES = 150;
const SIM_STEPS = 300;
const STEPS_PER_FRAME = 2;
const MAX_EDGES = 4000;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// LocalSkill lacks the fields getSkillCategory reads, so bridge it.
function toRemoteLike(skill: LocalSkill): RemoteSkill {
  return {
    id: skill.manifestId ?? skill.name,
    slug: skill.name,
    name: skill.name,
    source: skill.source ?? '',
    installs: 0,
    url: '',
    installUrl: '',
    sourceType: 'local',
    isDuplicate: false,
    description: skill.description,
    tags: skill.tags,
  };
}

function buildGraph(
  skills: (RemoteSkill | LocalSkill)[],
  width: number,
  height: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const weights: number[] = [];

  for (const skill of skills) {
    const isRemote = 'installs' in skill;
    const remote = isRemote ? (skill as RemoteSkill) : null;
    const local = isRemote ? null : (skill as LocalSkill);

    const id = remote ? remote.id : (local!.manifestId ?? local!.name);
    const name = remote ? remote.name : local!.name;
    const description = remote
      ? (remote.description ?? remote.repoDescription ?? '')
      : local!.description;
    const source = remote ? remote.source : (local!.source ?? '');
    const installs = remote ? remote.installs : 0;
    const stars = remote ? (remote.stars ?? 0) : 0;
    const tags = remote ? (remote.tags ?? []) : (local!.tags ?? []);
    const category = remote
      ? getSkillCategory(remote)
      : getSkillCategory(toRemoteLike(local!));

    const weight = Math.max(installs, stars);
    weights.push(weight);
    nodes.push({
      id,
      name,
      description,
      source,
      installs,
      stars,
      tags,
      category,
      radius: 4,
      isRemote,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0,
      fixed: false,
    });
  }

  // Node size: log-normalized by installs/stars, mapped to 4-14px.
  const minW = Math.min(...weights, 0);
  const maxW = Math.max(...weights, 1);
  const minLog = Math.log(minW + 1);
  const maxLog = Math.log(maxW + 1);
  const span = maxLog - minLog || 1;
  for (let i = 0; i < nodes.length; i++) {
    const t = (Math.log(weights[i] + 1) - minLog) / span;
    nodes[i].radius = 4 + 10 * t;
  }

  // Initial circle layout with small jitter to break symmetric metastable states.
  const cx = width / 2;
  const cy = height / 2;
  const ring = Math.min(width, height) / 2 - 40;
  nodes.forEach((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    n.x = cx + Math.cos(angle) * ring + (Math.random() - 0.5) * 20;
    n.y = cy + Math.sin(angle) * ring + (Math.random() - 0.5) * 20;
  });

  // Edges: shared source repo, or >=2 shared tags.
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let connected = a.source !== '' && a.source === b.source;
      if (!connected && a.tags.length > 0 && b.tags.length > 0) {
        let shared = 0;
        for (const t of a.tags) if (b.tags.includes(t)) shared++;
        connected = shared >= 2;
      }
      if (connected) {
        edges.push({ source: i, target: j });
        // Cap edges so dense graphs keep SVG rendering cheap.
        if (edges.length >= MAX_EDGES) return { nodes, edges };
      }
    }
  }

  return { nodes, edges };
}

// ─── Force simulation ──────────────────────────────────────────────────────

function stepSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const n = nodes.length;
  if (n === 0) return;
  const k = 6000 / n;
  const spring = 0.002;
  const center = 0.008;
  const damping = 0.85;
  const maxVel = 2;

  for (const node of nodes) {
    node.fx = 0;
    node.fy = 0;
  }

  // Coulomb repulsion between every pair.
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist2 = dx * dx + dy * dy + 1;
      const dist = Math.sqrt(dist2);
      const force = k / dist2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.fx += fx;
      a.fy += fy;
      b.fx -= fx;
      b.fy -= fy;
    }
  }

  // Spring attraction along edges.
  for (const e of edges) {
    const a = nodes[e.source];
    const b = nodes[e.target];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = dist * spring;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.fx += fx;
    a.fy += fy;
    b.fx -= fx;
    b.fy -= fy;
  }

  // Center gravity keeps the graph in view.
  for (const node of nodes) {
    node.fx += (width / 2 - node.x) * center;
    node.fy += (height / 2 - node.y) * center;
  }

  // Integrate with damping + velocity clamp for stability.
  for (const node of nodes) {
    if (node.fixed) continue;
    node.vx = (node.vx + node.fx) * damping;
    node.vy = (node.vy + node.fy) * damping;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > maxVel) {
      node.vx = (node.vx / speed) * maxVel;
      node.vy = (node.vy / speed) * maxVel;
    }
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(16, Math.min(width - 16, node.x));
    node.y = Math.max(16, Math.min(height - 16, node.y));
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function GraphPage() {
  const remoteSkills = useSkillStore((s) => s.remoteSkills);
  const localSkills = useSkillStore((s) => s.localSkills);
  const remoteLoading = useSkillStore((s) => s.remoteLoading);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 900, height: 600 });
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const interactionRef = useRef<InteractionState | null>(null);
  const loadAttemptedRef = useRef(false);

  const [positions, setPositions] = useState<{ x: number; y: number }[]>([]);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  // Prefer remote skills (richer fields), fall back to local ones.
  const skills = useMemo(() => {
    const list = remoteSkills.length > 0 ? remoteSkills : localSkills;
    const sorted = [...list].sort((a, b) => {
      const aw = 'installs' in a ? (a as RemoteSkill).installs : 0;
      const bw = 'installs' in b ? (b as RemoteSkill).installs : 0;
      return bw - aw;
    });
    return sorted.slice(0, MAX_NODES);
  }, [remoteSkills, localSkills]);

  // Graph page is usually visited before Discover, so seed remote data once.
  useEffect(() => {
    if (remoteSkills.length === 0 && !remoteLoading && !loadAttemptedRef.current) {
      loadAttemptedRef.current = true;
      useSkillStore.getState().loadRemoteSkills('browse');
    }
  }, [remoteSkills.length, remoteLoading]);

  // Track container size for layout center gravity.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) sizeRef.current = { width: r.width, height: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startSimulation = useCallback(
    (nodes: GraphNode[], edges: GraphEdge[], steps = SIM_STEPS) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      let stepCount = 0;
      let frame = 0;
      const loop = () => {
        const { width, height } = sizeRef.current;
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          stepSimulation(nodes, edges, width, height);
          stepCount++;
        }
        // Throttle React sync to ~30fps; positions live in refs meanwhile.
        frame++;
        if (frame % 2 === 0) {
          setPositions(nodes.map((n) => ({ x: n.x, y: n.y })));
        }
        if (stepCount < steps) {
          rafRef.current = requestAnimationFrame(loop);
        } else {
          setPositions(nodes.map((n) => ({ x: n.x, y: n.y })));
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    },
    [],
  );

  // Build graph + run layout whenever the skill data changes.
  useEffect(() => {
    if (skills.length === 0) {
      nodesRef.current = [];
      edgesRef.current = [];
      setPositions([]);
      setStats({ nodes: 0, edges: 0 });
      return;
    }
    const { width, height } = sizeRef.current;
    const { nodes, edges } = buildGraph(skills, width, height);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setSelected(null);
    setInstallMsg(null);
    setPositions(nodes.map((n) => ({ x: n.x, y: n.y })));
    setStats({ nodes: nodes.length, edges: edges.length });
    startSimulation(nodes, edges);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [skills, startSimulation]);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const mx = cx ?? (rect ? rect.width / 2 : 0);
    const my = cy ?? (rect ? rect.height / 2 : 0);
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * factor));
    // Keep the world point under the cursor fixed while scaling.
    const wx = (mx - panRef.current.x) / scaleRef.current;
    const wy = (my - panRef.current.y) / scaleRef.current;
    panRef.current = { x: mx - wx * newScale, y: my - wy * newScale };
    scaleRef.current = newScale;
    setPan(panRef.current);
    setScale(newScale);
  }, []);

  // Native (non-passive) wheel listener so zoom can preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const resetView = useCallback(() => {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const relayout = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const { width, height } = sizeRef.current;
    const cx = width / 2;
    const cy = height / 2;
    const ring = Math.min(width, height) / 2 - 40;
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      n.x = cx + Math.cos(angle) * ring + (Math.random() - 0.5) * 20;
      n.y = cy + Math.sin(angle) * ring + (Math.random() - 0.5) * 20;
      n.vx = 0;
      n.vy = 0;
      n.fixed = false;
    });
    setSelected(null);
    startSimulation(nodes, edgesRef.current);
  }, [startSimulation]);

  // Window-level move/up so dragging keeps working outside the SVG.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = interactionRef.current;
      if (!it) return;
      const dx = e.clientX - it.startX;
      const dy = e.clientY - it.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) it.moved = true;

      if (it.mode === 'pan') {
        panRef.current = { x: it.startPan.x + dx, y: it.startPan.y + dy };
        setPan(panRef.current);
      } else if (it.mode === 'node' && it.nodeIndex != null) {
        const node = nodesRef.current[it.nodeIndex];
        if (node) {
          node.x += dx / scaleRef.current;
          node.y += dy / scaleRef.current;
          node.vx = 0;
          node.vy = 0;
          it.startX = e.clientX;
          it.startY = e.clientY;
          setPositions(nodesRef.current.map((n) => ({ x: n.x, y: n.y })));
        }
      }
    };

    const onUp = () => {
      const it = interactionRef.current;
      if (it?.mode === 'node' && it.nodeIndex != null) {
        const node = nodesRef.current[it.nodeIndex];
        if (node) {
          node.fixed = false;
          if (!it.moved) setSelected({ ...node });
          // Let neighbors settle around the dropped node.
          if (!rafRef.current) startSimulation(nodesRef.current, edgesRef.current, 80);
        }
      }
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [startSimulation]);

  const handleBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    interactionRef.current = {
      mode: 'pan',
      nodeIndex: null,
      startX: e.clientX,
      startY: e.clientY,
      startPan: panRef.current,
      moved: false,
    };
  };

  const handleNodePointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const node = nodesRef.current[index];
    if (!node) return;
    node.fixed = true;
    interactionRef.current = {
      mode: 'node',
      nodeIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      startPan: panRef.current,
      moved: false,
    };
  };

  const handleInstall = async () => {
    if (!selected || !selected.isRemote) return;
    setInstalling(true);
    setInstallMsg(null);
    const res = await useSkillStore.getState().installSkill(selected.source, selected.name);
    setInstalling(false);
    setInstallMsg(res.success ? '安装成功' : `安装失败：${res.message}`);
  };

  const legendCategories = useMemo(() => {
    const present = new Set(nodesRef.current.map((n) => n.category));
    return CATEGORIES.filter((c) => c.id !== 'all' && present.has(c.id));
  }, [stats]);

  return (
    <div className="h-full flex flex-col p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-trae-text">技能关系图</h1>
          <p className="text-xs text-trae-text-secondary mt-1">
            {stats.nodes > 0
              ? `共 ${stats.nodes} 个技能，${stats.edges} 条关联 · 滚轮缩放，拖拽节点或画布`
              : '技能之间的同源与标签关联'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={relayout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重新布局
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => zoomBy(1.2)}
            title="放大"
            className="flex items-center px-2.5 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => zoomBy(1 / 1.2)}
            title="缩小"
            className="flex items-center px-2.5 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={resetView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/40 transition-all border border-trae-border"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            复位
          </motion.button>
        </div>
      </div>

      {/* Graph area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-trae-card/30 border border-trae-border rounded-lg shadow-hard-sm"
      >
        {skills.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-trae-text-secondary">
            {remoteLoading ? (
              <>
                <Loader2 className="w-5 h-5 text-trae-accent animate-spin mb-3" />
                <p className="text-sm">加载中...</p>
              </>
            ) : (
              <>
                <Network className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">暂无技能数据</p>
                <p className="text-xs mt-1">请先在发现页加载技能，或安装本地技能</p>
              </>
            )}
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={handleBackgroundPointerDown}
              onPointerLeave={() => {
                setHovered(null);
                setTooltip(null);
              }}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
                {/* Edges */}
                <g>
                  {edgesRef.current.map((e, i) => {
                    const a = positions[e.source];
                    const b = positions[e.target];
                    if (!a || !b) return null;
                    const na = nodesRef.current[e.source];
                    const nb = nodesRef.current[e.target];
                    const highlighted =
                      hovered != null && (na?.id === hovered || nb?.id === hovered);
                    return (
                      <line
                        key={i}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={highlighted ? '#00ff88' : '#6b7280'}
                        strokeOpacity={highlighted ? 0.5 : 0.15}
                        strokeWidth={highlighted ? 1.5 : 1}
                      />
                    );
                  })}
                </g>
                {/* Nodes */}
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  {positions.map((p, i) => {
                    const node = nodesRef.current[i];
                    if (!node) return null;
                    const isHovered = hovered === node.id;
                    const isSelected = selected?.id === node.id;
                    const color = CATEGORY_COLORS[node.category];
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${p.x}, ${p.y})`}
                        onPointerDown={(e) => handleNodePointerDown(e, i)}
                        onPointerEnter={() => setHovered(node.id)}
                        onPointerMove={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (rect) {
                            setTooltip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              name: node.name,
                            });
                          }
                        }}
                        onPointerLeave={() => {
                          setHovered((h) => (h === node.id ? null : h));
                          setTooltip(null);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle
                          r={node.radius + (isHovered ? 3 : 0)}
                          fill={color}
                          fillOpacity={isHovered ? 1 : 0.85}
                          stroke={isHovered || isSelected ? '#ffffff' : '#0a0a0f'}
                          strokeWidth={isHovered || isSelected ? 2 : 1}
                        />
                        {node.radius >= 8 && (
                          <text
                            y={node.radius + 12}
                            textAnchor="middle"
                            fill="#f0f0f5"
                            fontSize={9}
                            opacity={0.75}
                          >
                            {node.name.length > 14 ? `${node.name.slice(0, 14)}…` : node.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </motion.g>
              </g>
            </svg>

            {/* Legend */}
            {legendCategories.length > 0 && (
              <div className="absolute left-4 bottom-4 z-10 bg-trae-card/80 backdrop-blur border border-trae-border rounded-lg p-3 shadow-hard-sm">
                <p className="text-[11px] text-trae-text-secondary mb-2">分类图例</p>
                <div className="flex flex-col gap-1.5">
                  {legendCategories.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: CATEGORY_COLORS[c.id] }}
                      />
                      <span className="text-[11px] text-trae-text-secondary">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-20 pointer-events-none px-2 py-1 bg-trae-card border border-trae-border rounded text-xs text-trae-text shadow-hard-sm"
                style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
              >
                {tooltip.name}
              </div>
            )}

            {/* Detail panel */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ x: 320, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 320, opacity: 0 }}
                  transition={{ type: 'spring', mass: 1, stiffness: 260, damping: 28 }}
                  className="absolute right-0 top-0 bottom-0 w-80 bg-trae-card/95 backdrop-blur border-l border-trae-border p-4 overflow-y-auto z-30 shadow-hard"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-trae-text break-all leading-snug">
                      {selected.name}
                    </h3>
                    <button
                      onClick={() => setSelected(null)}
                      className="shrink-0 p-1 rounded text-trae-text-secondary hover:text-trae-text hover:bg-trae-card-hover transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-trae-text-secondary leading-relaxed mb-4">
                    {selected.description || '暂无描述'}
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-trae-text-secondary shrink-0">分类</span>
                      <span className="flex items-center gap-1.5 text-trae-text text-right">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: CATEGORY_COLORS[selected.category] }}
                        />
                        {CATEGORY_LABELS[selected.category] ?? selected.category}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-trae-text-secondary shrink-0">来源</span>
                      <span className="text-trae-text text-right break-all">
                        {selected.source || '未知'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-trae-text-secondary shrink-0">安装量</span>
                      <span className="text-trae-text">{formatCount(selected.installs)}</span>
                    </div>
                    {selected.isRemote && (
                      <div className="flex justify-between gap-2">
                        <span className="text-trae-text-secondary shrink-0">Stars</span>
                        <span className="text-trae-text">{formatCount(selected.stars)}</span>
                      </div>
                    )}
                  </div>

                  {selected.tags.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] text-trae-text-secondary mb-2">标签</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-trae-accent/10 border border-trae-accent/20 text-trae-accent text-[11px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5">
                    {selected.isRemote ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleInstall}
                        disabled={installing}
                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg text-xs font-medium bg-trae-accent/15 text-trae-accent border border-trae-accent/30 hover:bg-trae-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {installing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        {installing ? '安装中...' : '安装'}
                      </motion.button>
                    ) : (
                      <div className="w-full px-3 py-2 rounded-lg text-xs text-center text-trae-text-secondary border border-trae-border bg-trae-card/50">
                        已安装（本地技能）
                      </div>
                    )}
                    {installMsg && (
                      <p
                        className={`mt-2 text-xs ${
                          installMsg.startsWith('安装成功') ? 'text-trae-success' : 'text-trae-danger'
                        }`}
                      >
                        {installMsg}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

export default GraphPage;
