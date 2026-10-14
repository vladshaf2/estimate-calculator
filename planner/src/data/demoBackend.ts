// Demo backend: same behaviour as Supabase but stored in this browser (localStorage).
// Tabs of the same browser sync through BroadcastChannel, which mimics realtime between two users.
import type { Backend, ChangeHandler } from './backend';
import { emptySnapshot, type Snapshot, type TableName, type Tables, type Task } from './types';
import { zonedToUtc, dayKey, addDays, PRAGUE } from '../lib/time';

const KEY = 'planner.demo.v1';
const MEMBERS = [
  { id: 'demo_vlad', email: 'vlad@demo', name_en: 'Vlad', name_ru: 'Влад', color: '#e9b54a', lang: 'ru' as const },
  { id: 'demo_igor', email: 'igor@demo', name_en: 'Igor', name_ru: 'Игорь', color: '#60a5fa', lang: 'ru' as const },
];

export function seed(): Snapshot {
  const s = emptySnapshot();
  const now = new Date().toISOString();
  MEMBERS.forEach((m) => (s.members[m.id] = { ...m, created_at: now }));
  [['clients', 'Clients', 'Клиенты', '#e9b54a'], ['content', 'Chiefs Content', 'Контент Chiefs', '#d92030']].forEach(([key, en, ru, color], i) =>
    (s.workspaces['ws_' + key] = { id: 'ws_' + key, key, name_en: en, name_ru: ru, color, position: i, created_at: now }));
  ([['idea', 'Idea', 'Идея', '#8d8d96', false], ['discussion', 'Discussion', 'В обсуждении', '#a78bfa', false], ['in_progress', 'In progress', 'В работе', '#60a5fa', false],
    ['needs_fix', 'Needs fix', 'Поправить', '#f97316', false], ['client_review', 'Client review', 'На согласовании', '#e9b54a', false],
    ['done', 'Done', 'Готово', '#58c493', true], ['published', 'Published', 'Опубликовано', '#2dd4bf', true]] as const).forEach(([key, en, ru, color, done], i) =>
    (s.statuses['st_' + key] = { id: 'st_' + key, key, name_en: en, name_ru: ru, color, position: i, is_done: done, created_at: now }));
  ([['video', 'Video', 'Видео', '#ef4444'], ['photo', 'Photo', 'Фото', '#f59e0b'], ['edit', 'Edit', 'Эдит', '#ec4899'], ['video_editing', 'Video editing', 'Монтаж', '#8b5cf6'],
    ['previz', 'Previz', 'Превиз', '#06b6d4'], ['sound', 'Sound', 'Звук', '#22c55e'], ['reel', 'Reel', 'Рилс', '#f43f5e'], ['post', 'Post', 'Пост', '#3b82f6'], ['story', 'Story', 'Сторис', '#eab308']] as const)
    .forEach(([key, en, ru, color], i) => (s.work_types['wt_' + key] = { id: 'wt_' + key, key, name_en: en, name_ru: ru, color, position: i, created_at: now }));
  s.projects.pr_nova = { id: 'pr_nova', workspace_id: 'ws_clients', name: 'Nova Records — music video', client: 'Nova Records', color: '#a78bfa', archived: false, created_at: now };
  s.projects.pr_reels = { id: 'pr_reels', workspace_id: 'ws_content', name: 'Chiefs reels', client: '', color: '#d92030', archived: false, created_at: now };
  const today = dayKey(new Date(), PRAGUE);
  const t = (id: string, p: Partial<Task>): Task => ({
    id, title: '', notes: '', workspace_id: 'ws_clients', project_id: null, status_id: 'st_idea', work_type_ids: [], assignee_id: null, priority: 0,
    due_at: null, due_all_day: true, remind_at: null, platform: null, publish_at: null, hook: '', caption: '', links: [], checklist: [], sort_order: 0,
    created_by: null, created_at: now, updated_at: now, completed_at: null, ...p,
  });
  [
    t('demo_t1', { title: 'Storyboard for the music video', project_id: 'pr_nova', status_id: 'st_in_progress', work_type_ids: ['wt_previz'], assignee_id: 'demo_vlad', priority: 2, due_at: zonedToUtc(today, '00:00', PRAGUE) }),
    t('demo_t2', { title: 'Client feedback on draft v2', project_id: 'pr_nova', status_id: 'st_client_review', work_type_ids: ['wt_video'], assignee_id: 'demo_igor', due_at: zonedToUtc(addDays(today, 2), '00:00', PRAGUE) }),
    t('demo_t3', { title: 'Fix lip-sync in shot 4', project_id: 'pr_nova', status_id: 'st_needs_fix', work_type_ids: ['wt_video_editing', 'wt_sound'], assignee_id: 'demo_vlad', priority: 3, due_at: zonedToUtc(addDays(today, -1), '00:00', PRAGUE) }),
    t('demo_t4', { title: 'Battle reel', workspace_id: 'ws_content', project_id: 'pr_reels', status_id: 'st_in_progress', work_type_ids: ['wt_reel', 'wt_video'], assignee_id: 'demo_igor', platform: 'instagram', publish_at: zonedToUtc(addDays(today, 1), '18:00', PRAGUE), hook: 'Two AI directors, one brief', checklist: [{ id: 'c1', text: 'Cut', done: true }, { id: 'c2', text: 'Subtitles', done: false }] }),
  ].forEach((x) => (s.tasks[x.id] = x));
  return s;
}

export function createDemoBackend(asMember = 'demo_vlad'): Backend {
  let snap: Snapshot = (() => {
    try { const raw = localStorage.getItem(KEY); if (raw) return { ...emptySnapshot(), ...JSON.parse(raw) }; } catch { /* ignore */ }
    return seed();
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* ignore */ } };
  save();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('planner-demo') : null;
  let handler: ChangeHandler | null = null;
  const me = MEMBERS.find((m) => m.id === asMember) || MEMBERS[0];

  function emit(table: TableName, type: 'upsert' | 'delete', row: { id: string }) {
    bc?.postMessage({ table, type, row });
    handler?.(table, type, row as never);
  }
  /** Mimics the database trigger: updated_at + completed_at. */
  function touch(table: TableName, row: Record<string, unknown>, prev?: Record<string, unknown>) {
    const now = new Date().toISOString();
    row.updated_at = now;
    if (!prev) row.created_at = row.created_at || now;
    if (table === 'tasks' && (!prev || prev.status_id !== row.status_id)) {
      const done = !!(row.status_id && snap.statuses[row.status_id as string]?.is_done);
      row.completed_at = done ? (row.completed_at || now) : null;
    }
  }

  return {
    kind: 'demo',
    async getSessionEmail() { return me.email; },
    onAuthChange() { return () => {}; },
    async sendCode() {},
    async verifyCode() {},
    async signOut() { localStorage.removeItem(KEY); location.reload(); },
    async loadAll() {
      try { const raw = localStorage.getItem(KEY); if (raw) snap = { ...emptySnapshot(), ...JSON.parse(raw) }; } catch { /* ignore */ }
      return structuredClone(snap);
    },
    subscribe(onChange) {
      handler = null; // own changes are applied optimistically by the store; only other tabs need events
      const onMsg = (e: MessageEvent) => {
        const { table, type, row } = e.data as { table: TableName; type: 'upsert' | 'delete'; row: { id: string } };
        const target = snap[table] as Record<string, unknown>;
        if (type === 'delete') delete target[row.id]; else target[row.id] = row;
        onChange(table, type, row as never);
      };
      bc?.addEventListener('message', onMsg);
      return () => bc?.removeEventListener('message', onMsg);
    },
    async insert<K extends TableName>(table: K, row: Partial<Tables[K]> & { id: string }) {
      const full = { ...row } as Record<string, unknown>;
      if (table === 'tasks') full.created_by = full.created_by ?? me.id;
      touch(table, full);
      (snap[table] as Record<string, unknown>)[row.id] = full;
      save(); emit(table, 'upsert', full as { id: string });
      return structuredClone(full) as unknown as Tables[K];
    },
    async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
      const target = snap[table] as unknown as Record<string, Record<string, unknown>>;
      const prev = target[id];
      if (!prev) throw new Error('Not found');
      const next = { ...prev, ...patch } as Record<string, unknown>;
      touch(table, next, prev);
      target[id] = next;
      save(); emit(table, 'upsert', next as { id: string });
      return structuredClone(next) as unknown as Tables[K];
    },
    async remove(table, id) {
      delete (snap[table] as Record<string, unknown>)[id];
      if (table === 'statuses') Object.values(snap.tasks).forEach((t) => { if (t.status_id === id) t.status_id = null; });
      save(); emit(table, 'delete', { id });
    },
  };
}
