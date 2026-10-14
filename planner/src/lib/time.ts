// Time-zone helpers built on Intl (IANA zones, DST-safe). No fixed offsets anywhere.

export const PRAGUE = 'Europe/Prague';
export const ALMATY = 'Asia/Almaty';
export type Zone = typeof PRAGUE | typeof ALMATY;

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): Parts {
  const p: Record<string, number> = {};
  for (const x of partsFormatter(tz).formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** Offset of `tz` from UTC at the given instant, in minutes (Prague summer = +120). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Local wall-clock date + time in `tz` → UTC ISO string. */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t).toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC ISO → { date: 'YYYY-MM-DD', time: 'HH:mm' } in `tz` (for form inputs). */
export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso), tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Calendar day key 'YYYY-MM-DD' of an instant, in `tz`. */
export function dayKey(iso: string | Date, tz: string = PRAGUE): string {
  return utcToZoned(typeof iso === 'string' ? iso : iso.toISOString(), tz).date;
}

/** Add whole days to a 'YYYY-MM-DD' key. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday for a 'YYYY-MM-DD' key. */
export function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key));
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01';
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

function locale(lang: string) { return lang === 'ru' ? 'ru-RU' : 'en-GB'; }

/** "18:00" in tz. */
export function fmtTime(iso: string, tz: string): string {
  return utcToZoned(iso, tz).time;
}

/** "14 Oct" / "14 окт." for a day key. */
export function fmtDay(key: string, lang: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale(lang), { ...opts, timeZone: 'UTC' });
}

export function fmtMonth(key: string, lang: string): string {
  return fmtDay(key, lang, { month: 'long', year: 'numeric' });
}

export function weekdayNames(lang: string): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmtDay(addDays('2024-01-01', i), lang, { weekday: 'short' }));
}
