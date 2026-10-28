import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, ChangeHandler } from './backend';
import { SERVER_FIELDS, TABLES, emptySnapshot, type ProdShare, type Snapshot, type TableName, type Tables } from './types';

function clean<T extends object>(row: T): Partial<T> {
  const out = { ...row } as Record<string, unknown>;
  for (const f of SERVER_FIELDS) delete out[f];
  return out as Partial<T>;
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  return {
    kind: 'supabase',

    async getSessionEmail() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email?.toLowerCase() ?? null;
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user.email?.toLowerCase() ?? null));
      return () => data.subscription.unsubscribe();
    },

    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
    },

    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async loadAll() {
      const snap = emptySnapshot();
      // The API returns at most 1000 rows per request: page through bigger tables.
      const PAGE = 1000;
      await Promise.all(TABLES.map(async (table) => {
        const target = snap[table] as Record<string, unknown>;
        for (let from = 0; ; from += PAGE) {
          const res = await sb.from(table).select('*').order('id').range(from, from + PAGE - 1);
          if (res.error) throw res.error;
          for (const row of res.data as { id: string }[]) target[row.id] = row;
          if (res.data.length < PAGE) break;
        }
      }));
      return snap as Snapshot;
    },

    subscribe(onChange: ChangeHandler, onReconnect) {
      let wasDown = false;
      const channel = sb
        .channel('planner-db')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          const table = payload.table as TableName;
          if (!TABLES.includes(table)) return;
          if (payload.eventType === 'DELETE') onChange(table, 'delete', payload.old as { id: string });
          else onChange(table, 'upsert', payload.new as { id: string });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (wasDown) onReconnect();
            wasDown = false;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            wasDown = true;
          }
        });
      // Catch up after the phone/laptop wakes up or the tab comes back.
      const onVisible = () => { if (document.visibilityState === 'visible') onReconnect(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onReconnect);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onReconnect);
        sb.removeChannel(channel);
      };
    },

    async insert<K extends TableName>(table: K, row: Partial<Tables[K]> & { id: string }) {
      const { data, error } = await sb.from(table).insert(clean(row) as never).select().single();
      if (error) throw error;
      return data as Tables[K];
    },

    async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
      const { data, error } = await sb.from(table).update(clean(patch) as never).eq('id', id).select().single();
      if (error) throw error;
      return data as Tables[K];
    },

    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
    },

    prodShares: {
      async list(projectId) {
        const { data, error } = await sb.from('prod_shares').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        if (error) throw error;
        return data as ProdShare[];
      },
      async create(projectId) {
        const { data, error } = await sb.from('prod_shares').insert({ project_id: projectId }).select('*').single();
        if (error) throw error;
        return data as ProdShare;
      },
      async update(token, patch) {
        const { error } = await sb.from('prod_shares').update(patch).eq('token', token);
        if (error) throw error;
      },
    },

    files: {
      async upload(path, file, contentType) {
        const { error } = await sb.storage.from('prod').upload(path, file, { contentType, upsert: false, cacheControl: '31536000' });
        if (error) throw error;
      },
      async urls(paths) {
        if (!paths.length) return {};
        const { data, error } = await sb.storage.from('prod').createSignedUrls(paths, 6 * 3600);
        if (error) throw error;
        const out: Record<string, string> = {};
        for (const x of data || []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl;
        return out;
      },
      async remove(paths) {
        if (!paths.length) return;
        const { error } = await sb.storage.from('prod').remove(paths);
        if (error) throw error;
      },
    },

    push: {
      async publicKey() {
        const { data, error } = await sb.rpc('push_public_key');
        if (error) throw error;
        return (data as string | null) || null;
      },
      async save(sub) {
        const { error } = await sb.rpc('push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: sub.keys?.p256dh, p_auth: sub.keys?.auth, p_ua: navigator.userAgent });
        if (error) throw error;
      },
      async test() {
        const { error } = await sb.rpc('push_test');
        if (error) throw error;
      },
    },
  };
}
