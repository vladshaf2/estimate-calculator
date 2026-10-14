import { useState } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { useI18n } from '../i18n';
import { isDone, visibleTasks } from '../lib/smart';
import { ALMATY, PRAGUE, addDays, addMonths, dayKey, fmtDay, fmtMonth, fmtTime, startOfMonth, startOfWeek, weekdayNames } from '../lib/time';
import { useUi } from './Shell';

interface Item { task: Task; kind: 'due' | 'post'; at: string; time: string | null }

function itemsByDay(tasks: Task[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  const add = (k: string, it: Item) => { const a = map.get(k) || []; a.push(it); map.set(k, a); };
  for (const t of tasks) {
    if (t.due_at) add(dayKey(t.due_at, PRAGUE), { task: t, kind: 'due', at: t.due_at, time: t.due_all_day ? null : fmtTime(t.due_at, PRAGUE) });
    if (t.publish_at) add(dayKey(t.publish_at, PRAGUE), { task: t, kind: 'post', at: t.publish_at, time: fmtTime(t.publish_at, PRAGUE) });
  }
  for (const a of map.values()) a.sort((x, y) => (x.time || '') < (y.time || '') ? -1 : 1);
  return map;
}

function Ev({ it, full }: { it: Item; full?: boolean }) {
  const { db } = useStore();
  const { t } = useI18n();
  const { openTask } = useUi();
  const status = it.task.status_id ? db.statuses[it.task.status_id] : null;
  const done = isDone(it.task, db);
  return (
    <button className={'ev' + (done ? ' done' : '')} style={{ ['--c' as string]: status?.color }} onClick={() => openTask(it.task.id)} data-ev={it.task.id}
      title={it.task.title}>
      {it.kind === 'post' ? '📣 ' : ''}{it.time && <span className="tm">{it.time}</span>}{it.task.title}
      {full && it.kind === 'post' && <span className="zones">{t('tz.prague')} {fmtTime(it.at, PRAGUE)} · {t('tz.almaty')} {fmtTime(it.at, ALMATY)}</span>}
    </button>
  );
}

export function CalendarView() {
  const { db, me } = useStore();
  const { t, lang } = useI18n();
  const { list, filters, search } = useUi();
  const today = dayKey(new Date(), PRAGUE);
  const [mode, setMode] = useState<'month' | 'week'>(() => (window.innerWidth < 860 ? 'week' : 'month'));
  const [anchor, setAnchor] = useState(today);
  // "Today" / "Overdue" are date lists themselves — on a calendar they make more sense as "everything".
  const scope = list.kind === 'smart' && (list.id === 'today' || list.id === 'overdue') ? { kind: 'smart' as const, id: 'all' as const } : list;
  const tasks = visibleTasks({ db, now: new Date(), meId: me?.id || null }, scope, filters, search, true);
  const byDay = itemsByDay(tasks);
  const names = weekdayNames(lang);

  const move = (n: number) => setAnchor(mode === 'month' ? addMonths(startOfMonth(anchor), n) : addDays(anchor, 7 * n));
  const weekStart = startOfWeek(anchor);
  const title = mode === 'month' ? fmtMonth(anchor, lang) : `${fmtDay(weekStart, lang)} – ${fmtDay(addDays(weekStart, 6), lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <>
      <div className="cal-h">
        <button className="icon-btn" onClick={() => move(-1)} aria-label={t('cal.prev')}>‹</button>
        <button className="icon-btn" onClick={() => move(1)} aria-label={t('cal.next')}>›</button>
        <h2>{title}</h2>
        <button className="btn sm" onClick={() => setAnchor(today)}>{t('cal.today')}</button>
        <span className="grow" />
        <div className="seg">
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>{t('cal.month')}</button>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>{t('cal.week')}</button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '-4px 2px 10px' }}>{t('cal.hint')}</p>
      {mode === 'month' ? (
        <div className="month">
          {names.map((n) => <div key={n} className="wd">{n}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(startOfMonth(anchor)), i)).map((k) => {
            const items = byDay.get(k) || [];
            const other = k.slice(0, 7) !== anchor.slice(0, 7);
            return (
              <div key={k} className={'day' + (other ? ' other' : '') + (k === today ? ' today' : '')} data-day={k}>
                <span className="dn">{Number(k.slice(8))}</span>
                {items.slice(0, 3).map((it) => <Ev key={it.kind + it.task.id} it={it} />)}
                {items.length > 3 && <div className="more">{t('cal.more', { n: items.length - 3 })}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((k, i) => {
            const items = byDay.get(k) || [];
            return (
              <div key={k} className={'wcol' + (k === today ? ' today' : '')} data-day={k}>
                <div className="wcol-h">{names[i]}, {fmtDay(k, lang)}</div>
                {items.length ? items.map((it) => <Ev key={it.kind + it.task.id} it={it} full />) : <div className="faint" style={{ fontSize: 12 }}>{t('cal.nothing')}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
