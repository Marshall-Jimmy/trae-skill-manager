// 主题与强调色工具：App.tsx 与 SettingsPage 共用。
// 强调色以 "r,g,b" 三元组写入 --trae-accent / --trae-accent-deep CSS 变量，
// tailwind 的 trae-accent 系列颜色均引用这两个变量，实现一处改、全局生效。

import { useEffect, useState } from 'react';

export interface AccentPreset {
  name: string;
  hex: string;
  triplet: string;
  deep: string;
}

export function tripletToHex(triplet: string): string {
  const [r, g, b] = triplet.split(',').map((s) => parseInt(s.trim(), 10));
  const h = (n: number) =>
    Number.isNaN(n) ? '00' : Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// 组件内读取当前生效的强调色（浅色下已被 applyAccent 压暗），用于 SVG/Canvas 等
// 无法直接用 tailwind class 的渲染场景。
export function getAccentHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--trae-accent').trim();
  return v ? tripletToHex(v) : '#00ff88';
}

// 订阅 body 的 theme-light 类，返回当前是否浅色主题，供组件随主题切换重渲染。
export function useIsLight(): boolean {
  const [isLight, setIsLight] = useState(() => document.body.classList.contains('theme-light'));
  useEffect(() => {
    const update = () => setIsLight(document.body.classList.contains('theme-light'));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: '荧光绿', hex: '#00ff88', triplet: '0,255,136', deep: '0,204,106' },
  { name: '蓝色', hex: '#3b82f6', triplet: '59,130,246', deep: '37,99,235' },
  { name: '紫色', hex: '#a855f7', triplet: '168,85,247', deep: '147,51,234' },
  { name: '橙色', hex: '#f97316', triplet: '249,115,22', deep: '234,88,12' },
  { name: '青色', hex: '#06b6d4', triplet: '6,182,212', deep: '8,145,178' },
  { name: '粉色', hex: '#ec4899', triplet: '236,72,153', deep: '219,39,119' },
];

export function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// 浅色下把强调色压暗，使文字/图标在白底上可读（body.theme-light 不再写死强调色）
function darkenTriplet(triplet: string, factor: number): string {
  const [r, g, b] = triplet.split(',').map((v) => {
    const n = parseInt(v.trim(), 10);
    return Number.isNaN(n) ? 0 : n;
  });
  const scale = (v: number) => Math.max(0, Math.round(v * factor));
  return `${scale(r)},${scale(g)},${scale(b)}`;
}

let currentAccent: string | undefined;

export function applyAccent(accentColor?: string) {
  currentAccent = accentColor;
  const root = document.documentElement;
  const isLight = document.body.classList.contains('theme-light');
  if (!accentColor) {
    root.style.removeProperty('--trae-accent');
    root.style.removeProperty('--trae-accent-deep');
    return;
  }
  const triplet = accentColor.startsWith('#') ? hexToTriplet(accentColor) : accentColor;
  root.style.setProperty('--trae-accent', isLight ? darkenTriplet(triplet, 0.55) : triplet);
  root.style.setProperty('--trae-accent-deep', isLight ? darkenTriplet(triplet, 0.42) : triplet);
}

export function applyTheme(theme: string) {
  const oldHandler = (window as any).__themeHandler;
  if (oldHandler) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', oldHandler);
    (window as any).__themeHandler = undefined;
  }

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        document.body.classList.remove('theme-light');
      } else {
        document.body.classList.add('theme-light');
      }
      // 主题切换后重算强调色（浅色下自动取深色变体）
      if (currentAccent) applyAccent(currentAccent);
    };
    handler(prefersDark);
    prefersDark.addEventListener('change', handler);
    (window as any).__themeHandler = handler;
  } else if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
  }

  if (currentAccent) applyAccent(currentAccent);
}
