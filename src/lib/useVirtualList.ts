import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Windowed list virtualization for a single-column scroll container.
 *
 * Only renders the items inside the viewport (plus `overscan` on each side),
 * so a 1000+ item list keeps a tiny DOM footprint and scrolls smoothly.
 * Row heights are estimated (fixed per view mode); overscan absorbs the
 * small drift when a card's real height differs from the estimate.
 */
export function useVirtualList(
  itemCount: number,
  itemHeight: number,
  overscan = 8,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, []);

  // Reset scroll when the list shrinks/grows or the row height changes
  // (e.g. search results change or the user switches grid/list view).
  const resetScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan,
  );
  const totalHeight = itemCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  return { containerRef, startIndex, endIndex, totalHeight, offsetY, resetScroll };
}
