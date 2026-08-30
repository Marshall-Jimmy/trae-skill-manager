/**
 * Apple-level Motion Presets for TRAE Skill Manager
 *
 * Physics-based spring animations following Apple's design language.
 * All animations use GPU-accelerated properties (transform, opacity) only.
 */

import type { Transition } from 'motion/react';

// ─── Apple Standard Easing ──────────────────────────────────────────────
// cubic-bezier(0.32, 0.72, 0, 1) — Apple's signature ease-out curve
export const APPLE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

// ─── Spring Presets ───────────────────────────────────────────────────────

/** Default spring: balanced, versatile (Apple standard) */
export const springDefault: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 200,
  damping: 22,
};

/** Gentle spring: for subtle UI state changes */
export const springGentle: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 180,
  damping: 25,
};

/** Snappy spring: for quick feedback (buttons, toggles) */
export const springSnappy: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 250,
  damping: 20,
};

/** Bouncy spring: for playful elements */
export const springBouncy: Transition = {
  type: 'spring',
  mass: 0.8,
  stiffness: 220,
  damping: 15,
};

// ─── Duration Presets (for tween-based animations) ──────────────────────

export const durationFast = 0.2;
export const durationNormal = 0.35;
export const durationSlow = 0.5;

// ─── Transition Presets ──────────────────────────────────────────────────

/** Standard fade + slight scale (modals, panels) */
export const transitionScaleIn: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 220,
  damping: 24,
};

/** Fade only (tooltips, badges) */
export const transitionFade: Transition = {
  duration: durationNormal,
  ease: APPLE_EASE,
};

/** Slide from right (side panels) */
export const transitionSlideRight: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 200,
  damping: 25,
};

/** Slide from bottom (dropdowns, sheets) */
export const transitionSlideUp: Transition = {
  type: 'spring',
  mass: 1,
  stiffness: 200,
  damping: 24,
};

// ─── Stagger Presets (for list items) ────────────────────────────────────

/** Stagger delay between list items */
export const staggerDelay = 0.04;

/** Stagger container variants */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.05,
    },
  },
};

/** Stagger item variants (fade up) */
export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      mass: 1,
      stiffness: 200,
      damping: 24,
    },
  },
};

// ─── Page Transition Variants ────────────────────────────────────────────

/** Window entry: zoom + fade (macOS app launch feel) */
export const windowEntry = {
  initial: { opacity: 0, scale: 0.92, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring' as const,
      mass: 1,
      stiffness: 180,
      damping: 22,
    },
  },
};

/** Modal backdrop: fade + blur */
export const modalBackdrop = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: durationNormal, ease: APPLE_EASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: durationFast, ease: APPLE_EASE },
  },
};

/** Modal content: scale up + fade */
export const modalContent = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitionScaleIn,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 5,
    transition: { duration: durationFast, ease: APPLE_EASE },
  },
};

/** Side panel: slide from right */
export const sidePanel = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: transitionSlideRight,
  },
  exit: {
    x: '30%',
    opacity: 0,
    transition: { duration: durationFast, ease: APPLE_EASE },
  },
};

// ─── Hover Animation Presets ─────────────────────────────────────────────

/** Button hover: subtle lift + scale */
export const hoverLift = {
  whileHover: {
    y: -1,
    scale: 1.02,
    transition: { type: 'spring' as const, mass: 1, stiffness: 400, damping: 25 },
  },
  whileTap: {
    scale: 0.98,
    transition: { type: 'spring' as const, mass: 1, stiffness: 500, damping: 30 },
  },
};

/** Card hover: gentle lift */
export const hoverCard = {
  whileHover: {
    y: -2,
    transition: { type: 'spring' as const, mass: 1, stiffness: 300, damping: 25 },
  },
};

// ─── Sidebar Variants ───────────────────────────────────────────────────

/** Sidebar menu item expand */
export const menuExpand = {
  collapsed: { height: 0, opacity: 0, overflow: 'hidden' as const },
  expanded: {
    height: 'auto',
    opacity: 1,
    overflow: 'hidden' as const,
    transition: {
      type: 'spring' as const,
      mass: 1,
      stiffness: 200,
      damping: 25,
    },
  },
};
