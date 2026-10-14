import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { NO_FILTERS, SMART_LISTS, countList, type Filters, type ListRef } from '../lib/smart';
import { PRAGUE, dayKey, zonedToUtc } from '../lib/time';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { FilterBar } from './FilterBar';
import { ListView } from './ListView';
import { SettingsView } from './SettingsView';
import { TaskDetail } from './TaskDetail';
import { LangSwitch, ThemeSwitch, newId } from './bits';

export type View = 'list' | 'board' | 'calendar' | 'settings';
const VIEWS: View[] = ['list', 'board', 'calendar', 'settings'];

interface Ui {
  view: View; setView(v: View): void;
  list: ListRef; setList(l: ListRef): void;
  filters: Filters; setFilters(f: Filters): void;
  search: string;
  showDone: boolean; setShowDone(v: boolean): void;
  openTask(id: string | null): void;
  openId: string | null;
  /** Creates a task with defaults that fit the current list, returns it. */
  addTask(title: string, extra?: Partial<Task>): Task | null;
  listTitle: string;
}
const UiCtx = createContext<Ui | null>(null);
export function useUi(): Ui { const v = useContext(UiCtx); if (!v) throw new Error('no ui'); return v; }

const SMART_ICONS: Record<string, string> = { today: '☀', overdue: '⏰', needs_fix: '🛠', client_review: '⏳', posts_week: '📣', mine: '👤', all: '☰' };

function parseHash(): { view: View; list: ListRef; task: string | null } {
  const [, v, l, task] = location.hash.split('/');
  const view = VIEWS.includes(v as View) ? (v as View) : 'list';
  let list: ListRef = { kind: 'smart', id: 'today' };
  if (l) {
    const [kind, id] = decodeURIComponent(l).split(':');
    if (kind === 'smart' && SMART_LISTS.includes(id as never)) list = { kind: 'smart', id: id as never };
    else if ((kind === 'workspace' || kind === 'project') && id) list = { kind, id };
  }
  return { view, list, task: task ? decodeURIComponent(task) : null };
}

export function Shell() {
  const store = useStore();
  const { db, me, backend, online, toasts } = store;
  const { t, nm } = useI18n();
  const init = useMemo(parseHash, []);
  const [view, setView] = useState<View>(init.view);
  const [list, setListState] = useState<ListRef>(init.list);
  const [openId, setOpenId] = useState<string | null>(init.task);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = `#/${view}/${encodeURIComponent(list.kind + ':' + list.id)}${openId ? '/' + encodeURIComponent(openId) : ''}`;
    if (location.hash !== h) {
      const sameScreen = location.hash.split('/').slice(0, 3).join('/') === h.split('/').slice(0, 3).join('/');
      if (sameScreen) history.replaceState(null, '', h); else history.pushState(null, '', h);
    }
  }, [view, list, openId]);

  // Browser back/forward and edited links.
  useEffect(() => {
    const onHash = () => { const h = parseHash(); setView(h.view); setListState(h.list); setOpenId(h.task); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setList = useCallback((l: ListRef) => { setListState(l); setMenu(false); setView((v) => (v === 'settings' ? 'list' : v)); }, []);

  const listTitle = list.kind === 'smart' ? t(('smart.' + list.id) as TKey)
    : list.kind === 'workspace' ? nm(db.workspaces[list.id]) : (db.projects[list.id]?.name || '');

  const addTask = useCallback((title: string, extra: Partial<Task> = {}): Task | null => {
    const clean = title.trim();
    if (!clean) return null;
    const statuses = Object.values(db.statuses).sort((a, b) => a.position - b.position);
    const byKey = (k: string) => statuses.find((s) => s.key === k);
    const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);
    const project = list.kind === 'project' ? db.projects[list.id] : null;
    let workspaceId = project?.workspace_id || (list.kind === 'workspace' ? list.id : '') || workspaces[0]?.id || '';
    if (!list.kind.startsWith('p') && filters.workspaces.length === 1) workspaceId = filters.workspaces[0];
    const now = new Date().toISOString();
    const today = dayKey(new Date(), PRAGUE);
    const task: Task = {
      id: newId(), title: clean.slice(0, 500), notes: '', workspace_id: workspaceId, project_id: project?.id || (filters.projects.length === 1 ? filters.projects[0] : null),
      status_id: (list.kind === 'smart' && (list.id === 'needs_fix' || list.id === 'client_review') ? byKey(list.id) : byKey('idea'))?.id || statuses.find((s) => !s.is_done)?.id || null,
      work_type_ids: filters.types.slice(), assignee_id: list.kind === 'smart' && list.id === 'mine' ? me?.id || null : filters.assignees[0] || null,
      priority: 0, due_at: list.kind === 'smart' && (list.id === 'today' || list.id === 'overdue') ? zonedToUtc(today, '00:00', PRAGUE) : null, due_all_day: true,
      remind_at: null, platform: null, publish_at: null, hook: '', caption: '', links: [], checklist: [], sort_order: Date.now(),
      created_by: null, created_at: now, updated_at: now, completed_at: null, ...extra,
    };
    if (!task.workspace_id) return null;
    store.create('tasks', task);
    return task;
  }, [db, list, filters, me, store]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape') { if (openId) setOpenId(null); else if (typing) el.blur(); setMenu(false); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
        e.preventDefault();
        setView('list'); setOpenId(null);
        window.setTimeout(() => document.getElementById('quick-add')?.focus(), 30);
      } else if (['1', '2', '3', '4'].includes(e.key)) setView(VIEWS[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const ctx = { db, now: new Date(), meId: me?.id || null };
  const ui: Ui = { view, setView, list, setList, filters, setFilters, search, showDone, setShowDone, openTask: setOpenId, openId, addTask, listTitle };
  const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);

  return (
    <UiCtx.Provider value={ui}>
      <div className="app">
        <div className={'scrim' + (menu ? ' open' : '')} onClick={() => setMenu(false)} />
        <aside className={'sidebar' + (menu ? ' open' : '')}>
          <div className="brand"><span className="logo-mark" /><small>Planner</small></div>
          <nav className="side-scroll">
            <div className="side-h">{t('side.lists')}</div>
            {SMART_LISTS.map((id) => {
              const n = countList(ctx, { kind: 'smart', id });
              const on = list.kind === 'smart' && list.id === id && view !== 'settings';
              return (
                <button key={id} className={'side-item' + (on ? ' on' : '')} onClick={() => setList({ kind: 'smart', id })} data-list={id}>
                  <span className="ic">{SMART_ICONS[id]}</span>{t(('smart.' + id) as TKey)}
                  {n > 0 && <span className={'count' + (id === 'overdue' ? ' alert' : '')}>{n}</span>}
                </button>
              );
            })}
            <div className="side-h">{t('side.workspaces')}</div>
            {workspaces.map((w) => (
              <div key={w.id}>
                <button className={'side-item' + (list.kind === 'workspace' && list.id === w.id && view !== 'settings' ? ' on' : '')} onClick={() => setList({ kind: 'workspace', id: w.id })}>
                  <span className="ic" style={{ color: w.color }}>●</span>{nm(w)}
                  <span className="count">{countList(ctx, { kind: 'workspace', id: w.id }) || ''}</span>
                </button>
                {Object.values(db.projects).filter((p) => p.workspace_id === w.id && !p.archived).sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <button key={p.id} className={'side-item sub' + (list.kind === 'project' && list.id === p.id && view !== 'settings' ? ' on' : '')} onClick={() => setList({ kind: 'project', id: p.id })}>
                    <span style={{ color: p.color }}>▪</span> {p.name}
                    <span className="count">{countList(ctx, { kind: 'project', id: p.id }) || ''}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <button className={'btn sm' + (view === 'settings' ? ' on' : '')} onClick={() => { setView('settings'); setMenu(false); }}>⚙ {t('nav.settings')}</button>
            <span className="grow" />
            <ThemeSwitch compact />
            <LangSwitch />
          </div>
        </aside>

        <main className="main">
          {backend.kind === 'demo' && <div className="banner">{t('banner.demo')}</div>}
          {!online && <div className="banner off">{t('banner.offline')}</div>}
          <div className="topbar">
            <button className="icon-btn menu-btn" aria-label={t('side.menu')} onClick={() => setMenu(true)}>☰</button>
            <div className="seg" role="tablist">
              {(['list', 'board', 'calendar'] as const).map((v, i) => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} title={`${t(('nav.' + v) as TKey)} (${i + 1})`} data-view={v}>{t(('nav.' + v) as TKey)}</button>
              ))}
            </div>
            <span className="spacer" />
            <input ref={searchRef} className="search" type="search" placeholder={t('search.ph')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('search.ph')} />
          </div>
          <div className="content">
            {view !== 'settings' && (
              <div className="page-h">
                <h1>{listTitle}</h1>
              </div>
            )}
            {view !== 'settings' && <FilterBar />}
            {view === 'list' && <ListView />}
            {view === 'board' && <BoardView />}
            {view === 'calendar' && <CalendarView />}
            {view === 'settings' && <SettingsView />}
          </div>
          {view !== 'settings' && (
            <button className="fab" aria-label={t('new.task')} onClick={() => { const task = addTask(t('new.task')); if (task) setOpenId(task.id); }}>+</button>
          )}
        </main>
      </div>
      {openId && db.tasks[openId] && <TaskDetail id={openId} onClose={() => setOpenId(null)} />}
      <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className={'toast ' + x.kind}>{x.text}</div>)}</div>
    </UiCtx.Provider>
  );
}
