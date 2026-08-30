'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

interface TerminalViewerProps {
  outputLines: string[];
  status: 'running' | 'success' | 'error' | 'idle';
}

export function TerminalViewer({ outputLines, status }: TerminalViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [outputLines]);

  const statusConfig = {
    idle: { text: '就绪', color: 'text-trae-text-secondary', dot: 'bg-trae-text-secondary/40' },
    running: { text: '安装中...', color: 'text-trae-success', dot: 'bg-trae-success animate-pulse' },
    success: { text: '安装完成', color: 'text-trae-success', dot: 'bg-trae-success' },
    error: { text: '安装失败', color: 'text-trae-danger', dot: 'bg-trae-danger' },
  };

  const currentStatus = statusConfig[status];

  return (
    <div className="rounded-lg border border-trae-border overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-trae-card/60 border-b border-trae-border">
        <Terminal className="w-3.5 h-3.5 text-trae-text-secondary" />
        <span className="text-xs text-trae-text-secondary font-medium">终端输出</span>
      </div>

      {/* Output area */}
      <div
        ref={containerRef}
        aria-live="polite"
        aria-atomic="false"
        className="bg-trae-bg h-48 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {outputLines.length === 0 ? (
          <span className="text-trae-text-secondary/50">等待输出...</span>
        ) : (
          outputLines.map((line, i) => (
            <div key={i} className="text-trae-text/80 whitespace-pre-wrap break-all">
              {line || '\u00A0'}
            </div>
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-trae-card/40 border-t border-trae-border">
        <span className={`w-2 h-2 rounded-full ${currentStatus.dot}`} />
        <span className={`text-xs ${currentStatus.color}`}>{currentStatus.text}</span>
      </div>
    </div>
  );
}
