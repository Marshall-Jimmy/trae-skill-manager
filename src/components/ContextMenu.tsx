import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  danger?: boolean;
  separator?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 184;
const ITEM_HEIGHT = 32;
const SEPARATOR_HEIGHT = 13;

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const menuHeight =
    items.reduce((acc, it) => acc + (it.separator ? SEPARATOR_HEIGHT : ITEM_HEIGHT), 0) + 12;
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    const handleResize = () => onClose();
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 26 }}
      className="fixed z-[100] w-48 py-1.5 bg-trae-sidebar border border-trae-border rounded-lg shadow-hard-lg"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="my-1.5 h-px bg-trae-border" />
        ) : (
          <button
            key={item.id}
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
              item.danger
                ? 'text-trae-danger hover:bg-trae-danger/10'
                : 'text-trae-text hover:bg-trae-accent/10 hover:text-trae-accent'
            }`}
          >
            {item.icon && <item.icon className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        ),
      )}
    </motion.div>
  );
}
