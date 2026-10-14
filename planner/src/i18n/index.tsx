import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import ru from './ru.json';
import type { Lang } from '../data/types';

type Value = string | Record<string, string>;
const DICTS: Record<Lang, Record<string, Value>> = { en, ru };
export type TKey = keyof typeof en;

const LS = 'planner.lang';
function initialLang(): Lang {
  try { const v = localStorage.getItem(LS); if (v === 'en' || v === 'ru') return v; } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && /^en/i.test(navigator.language) ? 'en' : 'ru';
}

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let v: Value | undefined = DICTS[lang][key] ?? DICTS.en[key];
  if (v === undefined) { console.error('i18n: missing key', key); return key; }
  if (typeof v !== 'string') {
    const n = Number(vars?.n ?? 0);
    const cat = new Intl.PluralRules(lang === 'ru' ? 'ru' : 'en').select(n);
    v = v[cat] ?? v.other;
  }
  return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : v;
}

interface I18n {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: TKey, vars?: Record<string, string | number>): string;
  /** Picks name_en / name_ru of a record. */
  nm(x: { name_en: string; name_ru: string } | null | undefined): string;
}
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(LS, l); } catch { /* ignore */ } document.documentElement.lang = l; }, []);
  const value = useMemo<I18n>(() => ({
    lang, setLang,
    t: (key, vars) => translate(lang, key, vars),
    nm: (x) => (x ? (lang === 'ru' ? x.name_ru || x.name_en : x.name_en || x.name_ru) : ''),
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}
