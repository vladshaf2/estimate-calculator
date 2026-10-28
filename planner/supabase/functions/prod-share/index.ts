// prod-share: public, read-only view of a production board for a client, plus client revisions.
// Access is by the share token only (verify_jwt = false). Internal fields (AI notes, assignees, team
// revisions) are never returned; files come back as signed URLs valid for 6 hours.
import postgres from 'npm:postgres@3.4.5';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TOKEN = /^[0-9a-f]{32}$/;
const UUID = /^[0-9a-f-]{36}$/i;

async function sign(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/prod`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 6 * 3600, paths: chunk }),
    });
    if (!res.ok) throw new Error('sign failed: ' + res.status);
    for (const x of (await res.json()) as { path: string; signedURL?: string; error?: string }[]) {
      if (x.signedURL) out[x.path] = `${SB_URL}/storage/v1${x.signedURL}`;
    }
  }
  return out;
}

async function share(token: string) {
  const r = await sql`select s.*, p.name, p.client from public.prod_shares s join public.projects p on p.id = s.project_id where s.token = ${token} and not s.revoked`;
  return r[0] || null;
}

async function load(token: string) {
  const s = await share(token);
  if (!s) return json({ error: 'not_found' }, 404);
  const pid = s.project_id;
  await sql`update public.prod_shares set views = views + 1, last_viewed_at = now() where token = ${token}`;
  const [scenes, blocks, versions, media, revisions] = await Promise.all([
    sql`select id, project_id, position, title, description, created_at from public.prod_scenes where project_id = ${pid} and deleted_at is null`,
    sql`select id, project_id, scene_id, position, text, status, group_id, created_at from public.prod_blocks where project_id = ${pid} and deleted_at is null`,
    sql`select id, project_id, block_id, number, created_at from public.prod_versions where project_id = ${pid}`,
    sql`select id, project_id, version_id, kind, path, thumb_path, url, name, mime, position, created_at from public.prod_media where project_id = ${pid} and deleted_at is null`,
    sql`select id, project_id, version_id, text, done, client_name, created_at from public.prod_revisions where project_id = ${pid} and client_name is not null`,
  ]);
  const paths = media.flatMap((m) => [m.path, m.thumb_path]).filter(Boolean) as string[];
  const urls = paths.length ? await sign(paths) : {};
  return json({
    project: { name: s.name, client: s.client }, allow_comments: s.allow_comments,
    scenes, blocks, versions, revisions,
    media: media.map(({ path, thumb_path, ...m }) => ({ ...m, src: path ? urls[path] || null : null, thumb: thumb_path ? urls[thumb_path] || null : null })),
  });
}

async function revise(token: string, body: Record<string, unknown>) {
  const s = await share(token);
  if (!s) return json({ error: 'not_found' }, 404);
  if (!s.allow_comments) return json({ error: 'comments_off' }, 403);
  const versionId = String(body.version_id || ''), text = String(body.text || '').trim(), name = String(body.name || '').trim();
  if (!UUID.test(versionId) || !text || text.length > 2000 || !name || name.length > 100) return json({ error: 'bad_request' }, 400);
  const v = await sql`select v.id, v.block_id from public.prod_versions v join public.prod_blocks b on b.id = v.block_id
    where v.id = ${versionId} and v.project_id = ${s.project_id} and b.deleted_at is null`;
  if (!v.length) return json({ error: 'not_found' }, 404);
  const recent = await sql`select count(*)::int as n from public.prod_revisions where project_id = ${s.project_id} and client_name is not null and created_at > now() - interval '1 hour'`;
  if (recent[0].n >= 60) return json({ error: 'too_many' }, 429);
  const row = await sql`insert into public.prod_revisions (project_id, version_id, text, client_name)
    values (${s.project_id}, ${versionId}, ${text}, ${name}) returning id, project_id, version_id, text, done, client_name, created_at`;
  await sql`update public.prod_blocks set status = 'review' where id = ${v[0].block_id} and status <> 'review'`;
  return json({ revision: row[0] });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const token = String(body.token || '');
  if (!TOKEN.test(token)) return json({ error: 'not_found' }, 404);
  try {
    return body.action === 'revise' ? await revise(token, body) : await load(token);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
