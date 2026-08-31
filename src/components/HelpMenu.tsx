import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { clampToViewport } from '../lib/menuPosition';

export interface HelpMenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  separator?: boolean;
  onClick: () => void;
}

interface HelpMenuProps {
  open: boolean;
  items: HelpMenuItem[];
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const MENU_WIDTH = 288; // w-72
const ITEM_HEIGHT = 36; // py-2 + text-sm line-height
const SEPARATOR_HEIGHT = 13; // my-1.5 + h-px
const PADDING = 12; // py-1.5

export function HelpMenu({ open, items, onClose, anchorRef }: HelpMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // pointerdown fires before mousedown, so it beats the titlebar drag-region
    // handler which intercepts mousedown and stops propagation in Tauri.
    window.addEventListener('pointerdown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuHeight =
      items.reduce((acc, it) => acc + (it.separator ? SEPARATOR_HEIGHT : ITEM_HEIGHT), 0) + PADDING;
    setPos(clampToViewport(rect.left, rect.bottom + 4, MENU_WIDTH, menuHeight));
  }, [open, anchorRef, items]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          data-tauri-drag-region="false"
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 26 }}
          className="fixed z-[100] w-72 py-1.5 bg-trae-sidebar border border-trae-border rounded-lg shadow-hard-lg"
          style={{ left: pos.left, top: pos.top }}
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-trae-text hover:bg-trae-accent/10 hover:text-trae-accent transition-colors"
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] text-trae-text-secondary/60 font-mono shrink-0">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
