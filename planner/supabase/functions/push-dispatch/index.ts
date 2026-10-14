// push-dispatch: sends queued Web Push notifications (private.notification_outbox).
// Woken every minute by pg_cron (private.kick_push) with a shared secret from private.push_config.
// VAPID keys are generated on first run and kept in private.push_config; the public half is read by
// the app through public.push_public_key(). Deployed with verify_jwt = false: the secret is the auth.
import postgres from 'npm:postgres@3.4.5';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const CONTACT = 'mailto:chiefs.prod.ai@gmail.com';

async function cfg(key: string): Promise<string | null> {
  const r = await sql`select value from private.push_config where key = ${key}`;
  return r[0]?.value ?? null;
}

let app: webpush.ApplicationServer | null = null;
async function server(): Promise<webpush.ApplicationServer> {
  if (app) return app;
  let jwk = await cfg('vapid_jwk');
  if (!jwk) {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    const pub = await webpush.exportApplicationServerKey(keys);
    await sql`insert into private.push_config (key, value) values
      ('vapid_jwk', ${JSON.stringify(await webpush.exportVapidKeys(keys))}), ('vapid_public', ${pub})
      on conflict (key) do nothing`;
    jwk = await cfg('vapid_jwk'); // another run may have won the race
  }
  app = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: await webpush.importVapidKeys(JSON.parse(jwk!)) });
  return app;
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const secret = await cfg('dispatch_secret');
  if (!secret || !same(req.headers.get('x-dispatch-secret') || '', secret)) return new Response('forbidden', { status: 403 });
  const as = await server();

  // Claim a batch; attempts++ first so a crash can't loop forever on one row.
  const rows = await sql`
    update private.notification_outbox set attempts = attempts + 1
    where id in (select id from private.notification_outbox
                 where sent_at is null and send_after <= now() and attempts < 5
                 order by id limit 100 for update skip locked)
    returning id, member_id, kind, dedup, title, body, url`;

  let delivered = 0;
  for (const n of rows) {
    const subs = await sql`select s.id, s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
      join public.members m on lower(m.email) = s.email where m.id = ${n.member_id}`;
    let ok = 0, err = '';
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.kind === 'test' ? 'test' : n.dedup });
    for (const s of subs) {
      try {
        await as.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }).pushTextMessage(payload, { ttl: 6 * 3600 });
        ok++;
        await sql`update public.push_subscriptions set last_ok_at = now() where id = ${s.id}`;
      } catch (e) {
        const status = (e as { response?: Response }).response?.status;
        if (status === 404 || status === 410) await sql`delete from public.push_subscriptions where id = ${s.id}`;
        else err = String(status || e);
      }
    }
    delivered += ok;
    // Retry only when every device failed for a temporary reason.
    if (ok || !err) await sql`update private.notification_outbox set sent_at = now(), error = ${subs.length ? null : 'no devices'} where id = ${n.id}`;
    else await sql`update private.notification_outbox set error = ${err.slice(0, 300)} where id = ${n.id}`;
  }
  await sql`delete from private.notification_outbox where created_at < now() - interval '30 days'`;
  return Response.json({ claimed: rows.length, delivered });
});
