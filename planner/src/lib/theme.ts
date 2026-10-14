import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'planner.theme';
const META = { light: '#f5f4f0', dark: '#0a0a0b' };

export function readTheme(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'auto') return v; } catch { /* ignore */ }
  return 'auto';
}

function systemLight(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches;
}

/** Applies the choice to <html data-theme> and the browser/status-bar colour. */
export function applyTheme(choice: ThemeChoice): void {
  const resolved = choice === 'auto' ? (systemLight() ? 'light' : 'dark') : choice;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[resolved]);
}

export const ThemeCtx = createContext<[ThemeChoice, (c: ThemeChoice) => void]>(['auto', () => {}]);
export function useThemeChoice() { return useContext(ThemeCtx); }

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(choice);
    if (choice !== 'auto' || typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('auto');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);
  const set = useCallback((c: ThemeChoice) => {
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
    setChoice(c);
  }, []);
  return [choice, set];
}
