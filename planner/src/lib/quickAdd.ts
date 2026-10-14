// One-line quick add: "Battle reel #reel @igor fri 18:00 !!" → title + fields.
// Unrecognised words stay in the title, so nothing typed is ever lost.
import type { Platform, Snapshot, Task } from '../data/types';
import { ALMATY, PRAGUE, addDays, dayKey, startOfWeek, utcToZoned, weekday, zonedToUtc, type Zone } from './time';

export type ChipKind = 'type' | 'status' | 'project' | 'workspace' | 'assignee' | 'priority' | 'date' | 'platform' | 'zone';
export interface QuickChip { kind: ChipKind; id?: string; raw: string }

export interface QuickParse {
  title: string;
  work_type_ids: string[];
  status_id?: string;
  project_id?: string;
  workspace_id?: string;
  assignee_id?: string;
  priority?: 0 | 1 | 2 | 3;
  platform?: Platform;
  date?: string; // YYYY-MM-DD in `zone`
  time?: string; // HH:mm in `zone`
  zone: Zone;
  chips: QuickChip[];
}

export interface QuickCtx { db: Snapshot; meId: string | null; now: Date }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s_-]+/g, '');
const strip = (s: string) => s.replace(/[.,;:!?)]+$/, '');

const ZONES: Record<string, Zone> = { ala: ALMATY, almaty: ALMATY, алм: ALMATY, алматы: ALMATY, prg: PRAGUE, prague: PRAGUE, прага: PRAGUE, праге: PRAGUE };
const PLATFORMS: Record<string, Platform> = {
  instagram: 'instagram', insta: 'instagram', ig: 'instagram', инста: 'instagram', инстаграм: 'instagram',
  tiktok: 'tiktok', tt: 'tiktok', тикток: 'tiktok', youtube: 'youtube', yt: 'youtube', ютуб: 'youtube', shorts: 'youtube',
};
const PRIORITIES: Record<string, 1 | 2 | 3> = {
  low: 1, medium: 2, med: 2, high: 3, низкий: 1, низ: 1, средний: 2, сред: 2, высокий: 3, выс: 3, срочно: 3, urgent: 3, '1': 1, '2': 2, '3': 3,
};
const DAY_WORDS: Record<string, number> = { today: 0, tod: 0, сегодня: 0, tomorrow: 1, tmr: 1, tom: 1, завтра: 1, послезавтра: 2 };
// 0 = Monday. Russian accusative forms ("в среду") included.
const WEEKDAYS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
  пн: 0, пон: 0, понедельник: 0, вт: 1, вторник: 1, ср: 2, среда: 2, среду: 2, чт: 3, четверг: 3, пт: 4, пятница: 4, пятницу: 4, сб: 5, суббота: 5, субботу: 5, вс: 6, воскресенье: 6, вскр: 6,
};
const NEXT = new Set(['next', 'след', 'следующий', 'следующая', 'следующую', 'следующее', 'следующей']);
const PREPS = new Set(['on', 'at', 'by', 'в', 'во', 'к', 'до']);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function monthOf(w: string): number {
  if (w.length < 3) return -1;
  const en = MONTHS.findIndex((m) => w.startsWith(m));
  return en >= 0 ? en : MONTHS_RU.findIndex((m) => w.startsWith(m)); // "мар" is checked before "ма"(й/я)
}

const pad = (n: number) => String(n).padStart(2, '0');
const validDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/** dd.mm with no year → this year, or next year if it already passed. */
function dayMonth(d: number, m: number, y: number | null, today: string): string | null {
  const year = y ?? Number(today.slice(0, 4));
  if (!validDate(year, m, d)) return null;
  const key = `${year}-${pad(m)}-${pad(d)}`;
  return y == null && key < today ? `${year + 1}-${pad(m)}-${pad(d)}` : key;
}

function parseTime(w: string): string | null {
  let m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(w);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = /^(1[0-2]|0?[1-9])(?::([0-5]\d))?(am|pm)$/.exec(w);
  if (m) return `${pad((+m[1] % 12) + (m[3] === 'pm' ? 12 : 0))}:${m[2] || '00'}`;
  m = /^([01]?\d|2[0-3])(?:h|ч)$/.exec(w);
  if (m) return `${pad(+m[1])}:00`;
  return null;
}

function nameMatch<T extends { id: string; key?: string | null; name_en?: string; name_ru?: string; name?: string }>(rows: T[], q: string): T | undefined {
  const names = (r: T) => [r.key, r.name_en, r.name_ru, r.name].filter(Boolean).map((x) => norm(x as string));
  return rows.find((r) => names(r).includes(q)) || (q.length >= 3 ? rows.find((r) => names(r).some((n) => n.startsWith(q))) : undefined);
}

export function parseQuick(input: string, { db, meId, now }: QuickCtx): QuickParse {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const used = new Array(words.length).fill(false);
  const out: QuickParse = { title: '', work_type_ids: [], zone: PRAGUE, chips: [] };
  const take = (i: number, n: number, chip: QuickChip) => { for (let k = i; k < i + n; k++) used[k] = true; out.chips.push(chip); };
  const lw = (i: number) => (i < words.length ? strip(words[i]).toLowerCase().replace(/ё/g, 'е') : '');

  // Zone first: it decides what "today" means for the rest.
  words.forEach((w, i) => {
    const z = /^\+(.+)$/.exec(lw(i));
    if (z && ZONES[z[1]]) { out.zone = ZONES[z[1]]; take(i, 1, { kind: 'zone', id: out.zone, raw: w }); }
  });
  const today = dayKey(now, out.zone);

  const types = Object.values(db.work_types), statuses = Object.values(db.statuses);
  const projects = Object.values(db.projects).filter((p) => !p.archived), workspaces = Object.values(db.workspaces);
  const members = Object.values(db.members);

  for (let i = 0; i < words.length; i++) {
    if (used[i]) continue;
    const w = lw(i), raw = words[i];

    if (w.length > 1 && w.startsWith('#')) {
      const q = norm(w.slice(1));
      const p = PLATFORMS[q];
      if (p && !out.platform) { out.platform = p; take(i, 1, { kind: 'platform', id: p, raw }); continue; }
      const wt = nameMatch(types, q);
      if (wt) { if (!out.work_type_ids.includes(wt.id)) out.work_type_ids.push(wt.id); take(i, 1, { kind: 'type', id: wt.id, raw }); continue; }
      const st = nameMatch(statuses, q);
      if (st && !out.status_id) { out.status_id = st.id; take(i, 1, { kind: 'status', id: st.id, raw }); continue; }
      const pr = nameMatch(projects, q);
      if (pr && !out.project_id) { out.project_id = pr.id; out.workspace_id = pr.workspace_id; take(i, 1, { kind: 'project', id: pr.id, raw }); continue; }
      const ws = nameMatch(workspaces, q);
      if (ws && !out.workspace_id) { out.workspace_id = ws.id; take(i, 1, { kind: 'workspace', id: ws.id, raw }); continue; }
      continue;
    }

    if (w.length > 1 && w.startsWith('@') && !out.assignee_id) {
      const q = norm(w.slice(1));
      const m = ['me', 'я', 'мне', 'меня'].includes(q) && meId ? members.find((x) => x.id === meId)
        : members.find((x) => [x.name_en, x.name_ru, x.email.split('@')[0]].some((n) => norm(n) === q))
          || (q.length >= 2 ? members.find((x) => [x.name_en, x.name_ru].some((n) => norm(n).startsWith(q))) : undefined);
      if (m) { out.assignee_id = m.id; take(i, 1, { kind: 'assignee', id: m.id, raw }); }
      continue;
    }

    if (/^!{1,3}$/.test(raw) && out.priority == null) { out.priority = raw.length as 1 | 2 | 3; take(i, 1, { kind: 'priority', raw }); continue; }
    if (w.startsWith('!') && PRIORITIES[w.slice(1)] && out.priority == null) { out.priority = PRIORITIES[w.slice(1)]; take(i, 1, { kind: 'priority', raw }); continue; }

    // Dates and times. A preposition ("on", "в") is eaten only together with what follows it.
    const prep = PREPS.has(w) ? 1 : 0;
    const j = i + prep;
    if (j >= words.length || used[j]) continue;
    const x = lw(j);
    if (!out.date) {
      let date: string | null = null, n = 1;
      if (x in DAY_WORDS) date = addDays(today, DAY_WORDS[x]);
      else if (NEXT.has(x) && lw(j + 1) in WEEKDAYS) { date = addDays(startOfWeek(today), 7 + WEEKDAYS[lw(j + 1)]); n = 2; }
      else if (x in WEEKDAYS) date = addDays(today, (WEEKDAYS[x] - weekday(today) + 7) % 7);
      else {
        let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
        if (m && validDate(+m[1], +m[2], +m[3])) date = m[0];
        else if ((m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(x))) {
          date = dayMonth(+m[1], +m[2], m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, today);
        } else if (/^\d{1,2}$/.test(x) && monthOf(lw(j + 1)) >= 0) { date = dayMonth(+x, monthOf(lw(j + 1)) + 1, null, today); n = 2; }
        else if (monthOf(x) >= 0 && /^\d{1,2}$/.test(lw(j + 1))) { date = dayMonth(+lw(j + 1), monthOf(x) + 1, null, today); n = 2; }
      }
      if (date) { out.date = date; take(i, prep + n, { kind: 'date', raw: words.slice(i, j + n).join(' ') }); i = j + n - 1; continue; }
    }
    if (!out.time) {
      let time = parseTime(x);
      // "в 18" / "at 6": a bare hour counts only after a preposition.
      if (!time && prep && /^([01]?\d|2[0-3])$/.test(x)) time = `${pad(+x)}:00`;
      if (time) { out.time = time; take(i, prep + 1, { kind: 'date', raw: words.slice(i, j + 1).join(' ') }); i = j; continue; }
    }
  }

  // A time with no date: today, or tomorrow if that moment has already passed.
  if (out.time && !out.date) out.date = zonedToUtc(today, out.time, out.zone) < now.toISOString() ? addDays(today, 1) : today;
  // Zone chip is only meaningful next to a time.
  if (!out.time) out.chips = out.chips.filter((c) => c.kind !== 'zone');

  out.title = words.filter((_, i) => !used[i]).join(' ');
  if (!out.title) out.title = input.trim();
  return out;
}

/** Fields for the new task. With a platform the date is the publish time, otherwise the due date. */
export function quickToTask(p: QuickParse): Partial<Task> {
  const t: Partial<Task> = {};
  if (p.work_type_ids.length) t.work_type_ids = p.work_type_ids;
  if (p.status_id) t.status_id = p.status_id;
  if (p.project_id) t.project_id = p.project_id;
  if (p.workspace_id) t.workspace_id = p.workspace_id;
  if (p.assignee_id) t.assignee_id = p.assignee_id;
  if (p.priority != null) t.priority = p.priority;
  if (p.platform) t.platform = p.platform;
  if (p.date) {
    if (p.platform) t.publish_at = zonedToUtc(p.date, p.time || '12:00', p.zone);
    else if (p.time) { t.due_at = zonedToUtc(p.date, p.time, p.zone); t.due_all_day = false; }
    else { t.due_at = zonedToUtc(p.date, '00:00', PRAGUE); t.due_all_day = true; }
  }
  return t;
}

/** When the parsed date lands, as Prague wall-clock (for the preview chip). */
export function quickWhen(p: QuickParse): { date: string; time: string } | null {
  if (!p.date) return null;
  if (!p.time) return { date: p.date, time: '' };
  return utcToZoned(zonedToUtc(p.date, p.time, p.zone), PRAGUE);
}
