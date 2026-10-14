import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Backend } from './backend';
import { emptySnapshot, type Member, type Snapshot, type TableName, type Tables } from './types';

type Action =
  | { type: 'load'; db: Snapshot }
  | { type: 'upsert'; table: TableName; row: { id: string } }
  | { type: 'delete'; table: TableName; id: string };

function reducer(db: Snapshot, a: Action): Snapshot {
  switch (a.type) {
    case 'load': return a.db;
    case 'upsert': {
      const prev = (db[a.table] as Record<string, object>)[a.row.id];
      return { ...db, [a.table]: { ...db[a.table], [a.row.id]: { ...(prev || {}), ...a.row } } };
    }
    case 'delete': {
      const next = { ...db, [a.table]: { ...db[a.table] } };
      delete (next[a.table] as Record<string, unknown>)[a.id];
      // Mirror the database's "on delete set null" so the UI is consistent before the server echo arrives.
      if (a.table === 'statuses' || a.table === 'projects' || a.table === 'members') {
        const col = a.table === 'statuses' ? 'status_id' : a.table === 'projects' ? 'project_id' : 'assignee_id';
        const tasks = { ...next.tasks };
        for (const t of Object.values(tasks)) if (t[col] === a.id) tasks[t.id] = { ...t, [col]: null };
        next.tasks = tasks;
      }
      return next;
    }
  }
}

export interface Toast { id: number; text: string; kind: 'info' | 'error' }

interface StoreValue {
  backend: Backend;
  db: Snapshot;
  loaded: boolean;
  me: Member | null;
  email: string;
  online: boolean;
  create<K extends TableName>(table: K, row: Tables[K]): void;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>, opts?: { debounce?: boolean }): void;
  remove(table: TableName, id: string): void;
  reload(): Promise<void>;
  toasts: Toast[];
  toast(text: string, kind?: 'info' | 'error'): void;
}

const Ctx = createContext<StoreValue | null>(null);
export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

const cacheKey = (b: Backend, email: string) => `planner.cache.${b.kind}.${email}`;

export function StoreProvider({ backend, email, children }: { backend: Backend; email: string; children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, () => {
    try { const raw = localStorage.getItem(cacheKey(backend, email)); if (raw) return { ...emptySnapshot(), ...JSON.parse(raw) } as Snapshot; } catch { /* ignore */ }
    return emptySnapshot();
  });
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;
  /** Rows with local changes still in flight: realtime echoes for them are ignored to avoid flicker. */
  const pending = useRef(new Map<string, number>());
  /** Rows being typed into (debounced edits not sent yet): same rule. */
  const typing = useRef(new Set<string>());
  const queued = useRef(new Map<string, { table: TableName; id: string; patch: Record<string, unknown>; timer: number }>());

  const toast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2600);
  }, []);

  const reload = useCallback(async () => {
    try {
      const snap = await backend.loadAll();
      dispatch({ type: 'load', db: snap });
      setLoaded(true);
    } catch (e) {
      setLoaded(true);
      if (navigator.onLine) toast(String((e as Error).message || e), 'error');
    }
  }, [backend, toast]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => backend.subscribe((table, type, row) => {
    if (pending.current.get(row.id) || typing.current.has(row.id)) return;
    if (type === 'delete') dispatch({ type: 'delete', table, id: row.id });
    else dispatch({ type: 'upsert', table, row });
  }, () => { reload(); }), [backend, reload]);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Offline cache of the last loaded data.
  useEffect(() => {
    const h = window.setTimeout(() => { try { localStorage.setItem(cacheKey(backend, email), JSON.stringify(db)); } catch { /* ignore */ } }, 400);
    return () => window.clearTimeout(h);
  }, [db, backend, email]);

  const track = useCallback(async <T,>(id: string, op: () => Promise<T>): Promise<T | undefined> => {
    pending.current.set(id, (pending.current.get(id) || 0) + 1);
    try {
      return await op();
    } catch (e) {
      toast(String((e as Error).message || e), 'error');
      reload();
      return undefined;
    } finally {
      const n = (pending.current.get(id) || 1) - 1;
      if (n <= 0) pending.current.delete(id); else pending.current.set(id, n);
    }
  }, [toast, reload]);

  const flush = useCallback((key: string) => {
    const q = queued.current.get(key);
    if (!q) return;
    queued.current.delete(key);
    window.clearTimeout(q.timer);
    typing.current.delete(q.id);
    track(q.id, async () => {
      const row = await backend.update(q.table, q.id, q.patch as never);
      if ((pending.current.get(q.id) || 0) <= 1 && !queued.current.has(key)) dispatch({ type: 'upsert', table: q.table, row: row as { id: string } });
      return row;
    });
  }, [backend, track]);

  // Send debounced edits before the page goes away.
  useEffect(() => {
    const flushAll = () => { for (const k of Array.from(queued.current.keys())) flush(k); };
    window.addEventListener('pagehide', flushAll);
    return () => { window.removeEventListener('pagehide', flushAll); flushAll(); };
  }, [flush]);

  const value = useMemo<StoreValue>(() => {
    const me = Object.values(db.members).find((m) => m.email.toLowerCase() === email.toLowerCase()) || null;
    return {
      backend, db, loaded, me, email, online, toasts, toast, reload,
      create(table, row) {
        dispatch({ type: 'upsert', table, row: row as { id: string } });
        track(row.id, async () => {
          const saved = await backend.insert(table, row as never);
          dispatch({ type: 'upsert', table, row: saved as { id: string } });
          return saved;
        });
      },
      update(table, id, patch, opts) {
        dispatch({ type: 'upsert', table, row: { id, ...patch } as { id: string } });
        const key = table + ':' + id;
        const q = queued.current.get(key);
        const merged = { ...(q?.patch || {}), ...patch } as Record<string, unknown>;
        if (q) window.clearTimeout(q.timer);
        if (opts?.debounce) {
          typing.current.add(id); // hold echoes while typing
          const timer = window.setTimeout(() => flush(key), 600);
          queued.current.set(key, { table, id, patch: merged, timer });
        } else {
          queued.current.set(key, { table, id, patch: merged, timer: 0 });
          flush(key);
        }
      },
      remove(table, id) {
        const key = table + ':' + id;
        const q = queued.current.get(key);
        if (q) { window.clearTimeout(q.timer); queued.current.delete(key); }
        typing.current.delete(id);
        dispatch({ type: 'delete', table, id });
        track(id, () => backend.remove(table, id));
      },
    };
  }, [backend, db, loaded, email, online, toasts, toast, reload, track, flush]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
