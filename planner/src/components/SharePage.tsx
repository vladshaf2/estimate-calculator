import { useEffect, useMemo, useState } from 'react';
import { emptySnapshot, type ProdBlock, type ProdMedia, type ProdRevision, type ProdScene, type ProdVersion, type Snapshot } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { STATUS_COLOR, blockLabels, linkInfo, mediaOf, revisionsOf, scenesOf, unitsOf, versionsOf, type Unit } from '../lib/prod';
import { LangSwitch, ThemeSwitch } from './bits';

/** What the prod-share Edge Function returns. Internal fields (AI notes, assignees, team revisions) are not included. */
interface ShareMedia extends Omit<ProdMedia, 'path' | 'thumb_path' | 'deleted_at' | 'size'> { src: string | null; thumb: string | null }
interface ShareData {
  project: { name: string; client: string };
  allow_comments: boolean;
  scenes: Omit<ProdScene, 'deleted_at'>[];
  blocks: Omit<ProdBlock, 'deleted_at' | 'ai_note' | 'assignee_id'>[];
  versions: ProdVersion[];
  media: ShareMedia[];
  revisions: ProdRevision[];
}

const FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/prod-share';
const NAME_KEY = 'planner.shareName';

async function call(body: Record<string, unknown>) {
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_KEY }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

/** Turn the response into the planner's data shape so the board helpers (units, labels…) work as is. */
function toSnapshot(d: ShareData): Snapshot {
  const s = emptySnapshot();
  d.scenes.forEach((x) => (s.prod_scenes[x.id] = { ...x, deleted_at: null }));
  d.blocks.forEach((x) => (s.prod_blocks[x.id] = { ...x, ai_note: '', assignee_id: null, deleted_at: null }));
  d.versions.forEach((x) => (s.prod_versions[x.id] = x));
  d.media.forEach((x) => (s.prod_media[x.id] = { ...x, path: null, thumb_path: null, size: null, deleted_at: null }));
  d.revisions.forEach((x) => (s.prod_revisions[x.id] = x));
  return s;
}

/** Public page of a production board for the client: #/share/<token>. */
export function SharePage({ token }: { token: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ShareData | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } });
  useEffect(() => { call({ token }).then(setData, (e) => setErr(String((e as Error).message))); }, [token]);
  useEffect(() => { if (data) document.title = data.project.name + ' — Chiefs'; }, [data]);
  const db = useMemo(() => (data ? toSnapshot(data) : null), [data]);
  const src = useMemo(() => new Map((data?.media || []).map((m) => [m.id, m])), [data]);
  const saveName = (v: string) => { setName(v); try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } };

  const addRevision = async (versionId: string, text: string) => {
    const r = await call({ token, action: 'revise', version_id: versionId, text, name });
    setData((d) => {
      if (!d) return d;
      const v = d.versions.find((x) => x.id === versionId);
      return { ...d, revisions: [...d.revisions, r.revision], blocks: d.blocks.map((b) => (v && b.id === v.block_id ? { ...b, status: 'review' } : b)) };
    });
  };

  return (
    <div className="share-page">
      <header className="share-top">
        <span className="logo-mark" />
        <span className="grow" />
        <ThemeSwitch compact />
        <LangSwitch />
      </header>
      {!data && !err && <div className="center muted">{t('common.loading')}</div>}
      {err && <div className="center"><div className="empty" data-share-error>{err === 'not_found' ? t('pshare.gone') : t('pshare.loadErr')}</div></div>}
      {data && db && (
        <main className="share-main prod">
          <div className="prod-hero">
            <div>
              <div className="lbl">{t('pshare.kicker')}</div>
              <h1>{data.project.name}</h1>
              {data.project.client && <p className="muted">{data.project.client}</p>}
            </div>
          </div>
          <p className="muted share-hint">{data.allow_comments ? t('pshare.hint') : t('pshare.hintRead')}</p>
          {data.allow_comments && (
            <div className="share-name">
              <label className="lbl" htmlFor="share-name">{t('pshare.yourName')}</label>
              <input id="share-name" type="text" value={name} maxLength={100} onChange={(e) => saveName(e.target.value)} placeholder={t('pshare.namePh')} data-share-name />
            </div>
          )}
          <div className="prod-main">
            {scenesOf(db, Object.values(db.prod_scenes)[0]?.project_id || '').map((s, i) => (
              <section className="scene" key={s.id} data-scene={s.id}>
                <header className="scene-h">
                  <span className="scene-n">{i + 1}</span>
                  <div className="grow">
                    <div className="scene-title-ro">{s.title || t('prod.untitledScene')}</div>
                    {s.description && <div className="scene-desc-ro muted">{s.description}</div>}
                  </div>
                </header>
                <div className="blocks">
                  {unitsOf(db, s.id).map((u) => (
                    <ShareRow key={u.lead.id} db={db} unit={u} labels={blockLabels(db, s.id, i + 1)} src={src} canComment={data.allow_comments} name={name} onRevise={addRevision} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <footer className="share-foot faint small">Chiefs · AI production studio</footer>
        </main>
      )}
    </div>
  );
}

function ShareRow({ db, unit, labels, src, canComment, name, onRevise }: {
  db: Snapshot; unit: Unit; labels: Record<string, string>; src: Map<string, ShareMedia>; canComment: boolean; name: string; onRevise: (versionId: string, text: string) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const block = unit.lead;
  const versions = versionsOf(db, block.id);
  const [vSel, setVSel] = useState<string | null>(null);
  const version = versions.find((v) => v.id === vSel) || versions[versions.length - 1] || null;
  const media = version ? mediaOf(db, version.id) : [];
  const revs = version ? revisionsOf(db, version.id) : [];
  const [viewer, setViewer] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const grouped = unit.members.length > 1;
  const send = async () => {
    if (!version || !text.trim()) return;
    if (!name.trim()) { setErr(t('pshare.needName')); document.getElementById('share-name')?.focus(); return; }
    setBusy(true); setErr('');
    try { await onRevise(version.id, text.trim()); setText(''); } catch { setErr(t('pshare.sendErr')); } finally { setBusy(false); }
  };
  return (
    <div className={'block share st-' + block.status} data-block={block.id}>
      <div className="b-text">
        <div className="b-head">
          <span className="b-label num">{unit.members.map((m) => labels[m.id]).join(' + ')}</span>
          <span className="status-pill ro" style={{ ['--sc' as string]: STATUS_COLOR[block.status] }} data-status={block.status}><span className="dot" />{t(('prod.st.' + block.status) as TKey)}</span>
        </div>
        {unit.members.map((m) => (
          <div key={m.id} className={grouped ? 'member' : ''}>
            {grouped && <span className="m-label num faint">{labels[m.id]}</span>}
            <div className="ro-text">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="b-gens">
        <div className="b-gens-h">
          <span className="lbl">{t('prod.col.gens')}</span>
          <div className="vtabs">
            {versions.map((v) => <button key={v.id} className={version?.id === v.id ? 'on' : ''} onClick={() => setVSel(v.id)} data-version={v.number}>V{v.number}</button>)}
          </div>
        </div>
        {media.length ? (
          <div className="media-grid">
            {media.map((m, i) => {
              const x = src.get(m.id);
              const link = m.kind === 'link' && m.url ? linkInfo(m.url) : null;
              const img = x?.thumb || (m.kind === 'image' ? x?.src || m.url : null) || (link?.kind === 'youtube' ? link.thumb : link?.kind === 'image' ? m.url : null);
              return (
                <button key={m.id} className={'tile ' + m.kind} onClick={() => setViewer(i)} title={m.name} data-media={m.id}>
                  {img ? <img src={img} alt={m.name} loading="lazy" /> : m.kind === 'video' && x?.src ? <video src={x.src + '#t=0.5'} muted preload="metadata" playsInline /> : <span className="link-face">{link?.kind === 'drive' ? '▲ Drive' : '🔗'}<small>{m.name}</small></span>}
                  {(m.kind === 'video' || link?.kind === 'youtube' || link?.kind === 'video' || link?.kind === 'drive') && <span className="play">▶</span>}
                </button>
              );
            })}
          </div>
        ) : <div className="faint small">{t('pshare.noGens')}</div>}
      </div>
      <div className="b-revs">
        <span className="lbl">{version ? t('pshare.revFor', { v: version.number }) : t('prod.col.revs')}</span>
        <div className="revs">
          {revs.map((r) => (
            <div key={r.id} className={'rev' + (r.done ? ' done' : '')} data-rev={r.id}>
              <span className="rev-check" aria-hidden="true">{r.done ? '✓' : '•'}</span>
              <div className="grow">
                <div className="rev-text">{r.text}</div>
                <div className="rev-meta faint">{r.client_name} · {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }) : ''}{r.done ? ' · ' + t('pshare.fixed') : ''}</div>
              </div>
            </div>
          ))}
          {canComment && version && (
            <div className="rev-add">
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} placeholder={t('pshare.revPh')} data-rev-input
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn sm primary" onClick={send} disabled={busy || !text.trim()} data-rev-add>{t('pshare.send')}</button>
            </div>
          )}
          {err && <div className="acc-err small" role="alert">{err}</div>}
        </div>
      </div>
      {viewer !== null && media[viewer] && <ShareViewer items={media} src={src} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function ShareViewer({ items, src, index, onIndex, onClose }: { items: ProdMedia[]; src: Map<string, ShareMedia>; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const m = items[index];
  const full = src.get(m.id)?.src || (m.kind !== 'link' ? m.url : null);
  const link = m.kind === 'link' && m.url ? linkInfo(m.url) : null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [index, items.length, onClose, onIndex]);
  return (
    <div className="lightbox" role="dialog" aria-label={m.name} onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="grow nowrap ell">{m.name} <span className="faint">· {index + 1} / {items.length}</span></span>
        {(full || m.url) && <a className="btn sm" href={(m.kind === 'link' ? m.url : full) || ''} target="_blank" rel="noreferrer">{m.kind === 'link' ? t('prod.openLink') : t('prod.download')}</a>}
        <button className="btn sm" onClick={onClose} aria-label={t('detail.close')}>✕</button>
      </div>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {m.kind === 'image' && full && <img src={full} alt={m.name} />}
        {m.kind === 'video' && full && <video src={full} controls autoPlay playsInline />}
        {link && (link.kind === 'drive' || link.kind === 'youtube') && <iframe src={link.embed} title={m.name} allow="autoplay; fullscreen" allowFullScreen />}
        {link?.kind === 'image' && <img src={m.url!} alt={m.name} />}
        {link?.kind === 'video' && <video src={m.url!} controls autoPlay playsInline />}
        {link?.kind === 'other' && <a className="btn primary" href={m.url!} target="_blank" rel="noreferrer">↗ {t('prod.openOn', { h: link.host })}</a>}
      </div>
      {index > 0 && <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} aria-label="←">‹</button>}
      {index < items.length - 1 && <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} aria-label="→">›</button>}
    </div>
  );
}
