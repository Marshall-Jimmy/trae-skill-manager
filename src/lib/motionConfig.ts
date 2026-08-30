// ─── Global Motion Speed Config ───────────────────────────────────────────
// Persisted in localStorage, shared via a simple global event bus

export type MotionSpeed = 'slow' | 'normal' | 'fast' | 'instant';

const STORAGE_KEY = 'trae-skill-manager-motion-config';
const CONFIG_VERSION = 1;

export interface MotionConfigState {
  speed: MotionSpeed;
  enabled: boolean;
}

const defaultConfig: MotionConfigState = {
  speed: 'normal',
  enabled: true,
};

const VALID_SPEEDS: MotionSpeed[] = ['slow', 'normal', 'fast', 'instant'];

// Speed multipliers applied to animation durations
export const SPEED_MULTIPLIERS: Record<MotionSpeed, number> = {
  slow: 1.6,
  normal: 1.0,
  fast: 0.5,
  instant: 0.0,
};

function isValidMotionConfig(value: unknown): value is MotionConfigState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<MotionConfigState>;
  if (typeof v.enabled !== 'boolean') return false;
  if (!v.speed || !VALID_SPEEDS.includes(v.speed as MotionSpeed)) return false;
  return true;
}

export function loadMotionConfig(): MotionConfigState {
  try {
    if (typeof window === 'undefined') return { ...defaultConfig };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // version migration placeholder: if parsed.version is missing/older, apply migrations here
      if (isValidMotionConfig(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { ...defaultConfig };
}

export function saveMotionConfig(config: MotionConfigState): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...config, version: CONFIG_VERSION }),
    );
  } catch {
    // ignore: privacy mode / quota exceeded
  }
}

// ─── Global event bus for cross-component config updates ──────────────────
const MOTION_CHANGE_EVENT = 'trae-motion-config-change';

export function notifyMotionConfigChanged(): void {
  window.dispatchEvent(new CustomEvent(MOTION_CHANGE_EVENT));
}

export function onMotionConfigChanged(handler: () => void): () => void {
  window.addEventListener(MOTION_CHANGE_EVENT, handler);
  return () => window.removeEventListener(MOTION_CHANGE_EVENT, handler);
}

// ─── Spring Config Types ──────────────────────────────────────────────────

export interface SpringConfig {
  type: 'spring';
  mass: number;
  stiffness: number;
  damping: number;
}

// ─── Spring Config Helpers ────────────────────────────────────────────────

/**
 * Apply speed multiplier to a spring config.
 */
export function applySpeed(
  config: SpringConfig,
  speed: MotionSpeed,
): SpringConfig {
  if (speed === 'instant') {
    return { ...config, stiffness: 800, damping: 40 };
  }
  const mult = SPEED_MULTIPLIERS[speed];
  return {
    ...config,
    stiffness: Math.round(config.stiffness / mult),
    damping: Math.round(config.damping / Math.sqrt(mult)),
  };
}

// ─── Preset Spring Configs ────────────────────────────────────────────────

export const springPresets = {
  fast: { type: 'spring' as const, mass: 1, stiffness: 400, damping: 28 },
  medium: { type: 'spring' as const, mass: 1, stiffness: 280, damping: 25 },
  gentle: { type: 'spring' as const, mass: 1, stiffness: 180, damping: 22 },
  snappy: { type: 'spring' as const, mass: 1, stiffness: 500, damping: 30 },
};

// ─── React Hook ───────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';

export function useMotionConfig() {
  const [config, setConfigState] = useState<MotionConfigState>(loadMotionConfig);

  // Listen for cross-component changes via custom event and storage (cross-window)
  useEffect(() => {
    const localHandler = () => setConfigState(loadMotionConfig());
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConfigState(loadMotionConfig());
    };
    const unsubLocal = onMotionConfigChanged(localHandler);
    window.addEventListener('storage', storageHandler);
    return () => {
      unsubLocal();
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const updateConfig = useCallback((partial: Partial<MotionConfigState>) => {
    setConfigState((prev) => {
      const speed: MotionSpeed =
        partial.speed && VALID_SPEEDS.includes(partial.speed as MotionSpeed)
          ? (partial.speed as MotionSpeed)
          : prev.speed;
      const next: MotionConfigState = {
        enabled: typeof partial.enabled === 'boolean' ? partial.enabled : prev.enabled,
        speed,
      };
      saveMotionConfig(next);
      notifyMotionConfigChanged();
      return next;
    });
  }, []);

  const setSpeed = useCallback(
    (speed: MotionSpeed) => updateConfig({ speed }),
    [updateConfig],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => updateConfig({ enabled }),
    [updateConfig],
  );

  const getTransition = useCallback(
    (preset: keyof typeof springPresets): SpringConfig => {
      if (!config.enabled) {
        return { type: 'spring', mass: 1, stiffness: 800, damping: 40 };
      }
      return applySpeed(springPresets[preset], config.speed);
    },
    [config],
  );

  return {
    config,
    setSpeed,
    setEnabled,
    getTransition,
  };
}
