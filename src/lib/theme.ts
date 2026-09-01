// 主题与强调色工具：App.tsx 与 SettingsPage 共用。
// 强调色以 "r,g,b" 三元组写入 --trae-accent / --trae-accent-deep CSS 变量，
// tailwind 的 trae-accent 系列颜色均引用这两个变量，实现一处改、全局生效。

export interface AccentPreset {
  name: string;
  hex: string;
  triplet: string;
  deep: string;
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

export function applyAccent(accentColor?: string) {
  const root = document.documentElement;
  if (!accentColor) {
    root.style.removeProperty('--trae-accent');
    root.style.removeProperty('--trae-accent-deep');
    return;
  }
  const triplet = accentColor.startsWith('#') ? hexToTriplet(accentColor) : accentColor;
  root.style.setProperty('--trae-accent', triplet);
  root.style.setProperty('--trae-accent-deep', triplet);
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
    };
    handler(prefersDark);
    prefersDark.addEventListener('change', handler);
    (window as any).__themeHandler = handler;
  } else if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
  }
}
