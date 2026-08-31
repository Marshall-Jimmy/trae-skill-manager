export interface ClampedPos {
  left: number;
  top: number;
}

export function clampToViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  margin = 8,
): ClampedPos {
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.max(margin, Math.min(left, maxLeft)),
    top: Math.max(margin, Math.min(top, maxTop)),
  };
}
