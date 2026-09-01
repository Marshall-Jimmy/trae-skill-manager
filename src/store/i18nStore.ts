import { create } from 'zustand';

export type UiLang = 'zh' | 'en';
export type LangSetting = 'zh' | 'en' | 'system';

const STORAGE_KEY = 'trae-skill-manager-language';

function detectSystemLang(): UiLang {
  try {
    const nav = navigator.language || 'zh-CN';
    return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

function loadSetting(): LangSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'zh' || raw === 'en' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

interface I18nState {
  setting: LangSetting;
  lang: UiLang;
  setSetting: (s: LangSetting) => void;
}

export const useI18nStore = create<I18nState>((set) => {
  const initial = loadSetting();
  return {
    setting: initial,
    lang: initial === 'system' ? detectSystemLang() : initial,
    setSetting: (s) => {
      try {
        localStorage.setItem(STORAGE_KEY, s);
      } catch {
        // ignore
      }
      set({ setting: s, lang: s === 'system' ? detectSystemLang() : s });
    },
  };
});

// 订阅语言变化，保证组件在语言切换时重渲染
export function useLang(): UiLang {
  return useI18nStore((s) => s.lang);
}
