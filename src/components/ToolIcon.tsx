import traeSvg from '../assets/icons/trae.svg?raw';
import claudeCodeSvg from '../assets/icons/claude-code.svg?raw';
import cursorSvg from '../assets/icons/cursor.svg?raw';
import codexSvg from '../assets/icons/codex.svg?raw';

// 官方品牌图标（lobe-icons 静态 SVG），按工具 id 映射。
const toolIconMap: Record<string, string> = {
  trae: traeSvg,
  'claude-code': claudeCodeSvg,
  cursor: cursorSvg,
  codex: codexSvg,
};

export function ToolIcon({ id, className }: { id: string; className?: string }) {
  const svgContent = toolIconMap[id] || traeSvg;
  return (
    <span
      className={`inline-flex shrink-0 [&>svg]:w-full [&>svg]:h-full ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
