import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { useSkillStore } from '../store/skillStore';
import { Checkbox } from './Checkbox';
import {
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Coins,
  FileWarning,
  Gauge,
  Loader2,
} from 'lucide-react';
import type { SkillDiagnosisResult, TelemetryConfig } from '../types';

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-trae-success';
  if (score >= 60) return 'text-amber-400';
  return 'text-trae-danger';
}

function StatCard({
  label,
  value,
  color,
  delay,
}: {
  label: string;
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24, delay }}
      className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm"
    >
      <p className="text-xs text-trae-text-secondary mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </motion.div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  delay,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', mass: 1, stiffness: 200, damping: 24, delay }}
      className="bg-trae-card/30 border border-trae-border rounded-lg p-4 shadow-hard-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-trae-accent" />
        <h2 className="text-sm text-trae-text font-medium">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

export function DiagnosisPage() {
  const activeToolId = useSkillStore((s) => s.activeToolId);
  const [result, setResult] = useState<SkillDiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryConfig>({ enabled: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<SkillDiagnosisResult>('diagnose_skills', {
        toolId: activeToolId,
      });
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeToolId]);

  const loadTelemetry = useCallback(async () => {
    try {
      const config = await invoke<TelemetryConfig>('get_telemetry_config');
      setTelemetry(config);
    } catch {
      // 读取失败保持默认关闭
    }
  }, []);

  useEffect(() => {
    load();
    loadTelemetry();
  }, [load, loadTelemetry]);

  const toggleTelemetry = async () => {
    const next = { enabled: !telemetry.enabled };
    try {
      await invoke('set_telemetry_config', { config: next });
      setTelemetry(next);
    } catch {
      // 写入失败保持原状态
    }
  };

  const maxTokens = Math.max(
    ...(result?.tokenCost.topSkills.map((s) => s.tokens) ?? []),
    1,
  );

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center bg-trae-card/40 border border-trae-border rounded-lg shadow-hard-sm">
            <Stethoscope className="w-5 h-5 text-trae-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-trae-text leading-tight">
              技能健康度诊断
            </h1>
            <p className="text-xs text-trae-text-secondary mt-0.5">
              本地扫描技能目录，评估 token 成本、冲突、僵尸技能与质量
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-trae-text-secondary cursor-pointer select-none">
            <Checkbox checked={telemetry.enabled} onChange={toggleTelemetry} size="sm" />
            启用埋点
          </label>
          <motion.button
            onClick={load}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-trae-text bg-trae-card/40 border border-trae-border shadow-hard-sm hover:border-trae-border-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading && !result ? (
          <div className="h-full flex flex-col items-center justify-center text-trae-text-secondary">
            <Loader2 className="w-8 h-8 mb-3 animate-spin text-trae-accent" />
            <p className="text-sm">正在扫描技能目录...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-trae-danger">
            <AlertTriangle className="w-8 h-8 mb-3" />
            <p className="text-sm">{error}</p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="技能总数" value={result.summary.total} color="text-trae-text" delay={0} />
              <StatCard label="健康" value={result.summary.healthy} color="text-trae-success" delay={0.05} />
              <StatCard label="警告" value={result.summary.warnings} color="text-amber-400" delay={0.1} />
              <StatCard label="错误" value={result.summary.errors} color="text-trae-danger" delay={0.15} />
            </div>

            {/* Token cost panel */}
            <Panel title="Token 成本" icon={Coins} delay={0.05}>
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div>
                  <p className="text-xs text-trae-text-secondary">总 Token</p>
                  <p className="text-lg font-semibold text-trae-text">
                    {formatTokens(result.tokenCost.totalTokens)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-trae-text-secondary">技能数</p>
                  <p className="text-lg font-semibold text-trae-text">
                    {result.tokenCost.skillCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-trae-text-secondary">文件数</p>
                  <p className="text-lg font-semibold text-trae-text">
                    {result.tokenCost.fileCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-trae-text-secondary">平均 / 技能</p>
                  <p className="text-lg font-semibold text-trae-text">
                    {formatTokens(result.tokenCost.avgTokensPerSkill)}
                  </p>
                </div>
              </div>
              {result.tokenCost.topSkills.length > 0 ? (
                <div className="space-y-2">
                  {result.tokenCost.topSkills.map((skill) => (
                    <div key={skill.name} className="flex items-center gap-3">
                      <span className="text-xs text-trae-text w-40 truncate shrink-0">
                        {skill.name}
                      </span>
                      <div className="flex-1 h-1.5 bg-trae-bg border border-trae-border rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-trae-accent transition-all duration-500"
                          style={{
                            width: `${(skill.tokens / maxTokens) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-trae-text-secondary w-12 text-right shrink-0">
                        {formatTokens(skill.tokens)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-trae-text-secondary">暂无技能数据</p>
              )}
            </Panel>

            {/* Conflict panel */}
            <Panel title="冲突检测" icon={AlertTriangle} delay={0.1}>
              {result.conflicts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-trae-success">
                  <CheckCircle2 className="w-4 h-4" />
                  未发现冲突
                </div>
              ) : (
                <div className="space-y-3">
                  {result.conflicts.map((conflict) => (
                    <div key={conflict.name}>
                      <p className="text-xs font-medium text-trae-danger mb-1">
                        {conflict.name}
                      </p>
                      <ul className="space-y-1">
                        {conflict.paths.map((path) => (
                          <li
                            key={path}
                            className="text-xs text-trae-text-secondary font-mono break-all"
                          >
                            {path}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Zombie panel */}
            <Panel title="僵尸技能" icon={FileWarning} delay={0.15}>
              {result.zombies.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-trae-success">
                  <CheckCircle2 className="w-4 h-4" />
                  未发现僵尸技能
                </div>
              ) : (
                <div className="space-y-2">
                  {result.zombies.map((zombie) => (
                    <div
                      key={zombie.path}
                      className="flex items-start gap-2 border border-trae-border bg-trae-bg/40 rounded-lg px-3 py-2"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-trae-danger mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-trae-text font-medium">{zombie.name}</p>
                        <p className="text-xs text-trae-text-secondary font-mono break-all mt-0.5">
                          {zombie.path}
                        </p>
                        <p className="text-xs text-trae-danger mt-0.5">{zombie.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Quality panel */}
            <Panel title="质量评分" icon={Gauge} delay={0.2}>
              {result.quality.length === 0 ? (
                <p className="text-xs text-trae-text-secondary">暂无有效技能</p>
              ) : (
                <div className="space-y-3">
                  {result.quality.map((item) => (
                    <div
                      key={item.path}
                      className="border border-trae-border bg-trae-bg/40 rounded-lg px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-sm text-trae-text font-medium truncate">
                          {item.name}
                        </span>
                        <span
                          className={`text-sm font-semibold ml-auto shrink-0 ${scoreColor(item.score)}`}
                        >
                          {item.score}
                        </span>
                      </div>
                      <p className="text-xs text-trae-text-secondary font-mono break-all mb-1.5">
                        {item.path}
                      </p>
                      {item.issues.length > 0 ? (
                        <ul className="space-y-1">
                          {item.issues.map((issue) => (
                            <li key={issue.code} className="flex items-start gap-1.5 text-xs">
                              <span className="text-trae-danger shrink-0">{issue.code}</span>
                              <span className="text-trae-text-secondary">{issue.message}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-trae-success">无问题</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DiagnosisPage;
