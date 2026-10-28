import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { PROD_STATUSES, type ProdBlock, type ProdMedia, type ProdRevision, type ProdScene, type ProdStatus, type ProdVersion, type Project, type Task } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { MAX_UPLOAD, extOf, forgetFiles, makeThumb, useFileUrl } from '../lib/files';
import { NEXT_STATUS, STATUS_COLOR, blocksOf, exportCsv, linkInfo, mediaKindOf, mediaOf, nextPos, projectStats, revisionsOf, scenesOf, versionsOf } from '../lib/prod';
import { parseScript } from '../lib/script';
import { Avatar, newId } from './bits';
import { useUi } from './Shell';

const now = () => new Date().toISOString();

/** Production tab: the list of production projects, or one project's board. */
export function ProdView() {
  const { db } = useStore();
  const { prod } = useUi();
  const project = prod.project ? db.projects[prod.project] : null;
  return project ? <ProdBoard project={project} sceneId={prod.scene} /> : <ProdIndex />;
}

/* ---------------------------------------------------------------- index */

function ProdIndex() {
  const { db } = useStore();
  const { t } = useI18n();
  const { setProd } = useUi();
  const [creating, setCreating] = useState(false);
  const projects = Object.values(db.projects).filter((p) => p.production && !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="prod">
      <div className="prod-hero">
        <div>
          <h1>{t('prod.title')}</h1>
          <p className="muted">{t('prod.subtitle')}</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)} data-prod-new>＋ {t('prod.newProject')}</button>
      </div>
      <div className="prod-grid">
        {projects.map((p, i) => <ProjectCard key={p.id} project={p} n={i + 1} onOpen={() => setProd({ project: p.id, scene: null })} />)}
        <button className="prod-card new" onClick={() => setCreating(true)}>
          <span className="plus">＋</span>
          <b>{t('prod.newStory')}</b>
          <span className="muted">{t('prod.newStoryHint')}</span>
        </button>
      </div>
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function initials(name: string) {
  return name.split(/[\s—–-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '★';
}

function ProjectCard({ project, n, onOpen }: { project: Project; n: number; onOpen: () => void }) {
  const { db } = useStore();
  const { t } = useI18n();
  const s = projectStats(db, project.id);
  return (
    <button className="prod-card" onClick={onOpen} data-prod-card={project.id}>
      <div className="cover" style={{ ['--c' as string]: project.color }}>
        <span className="k">PROJECT / {String(n).padStart(2, '0')}</span>
        <span className="big">{initials(project.name)}</span>
        <span className="go">↗</span>
      </div>
      <div className="body">
        <b className="name">{project.name}</b>
        {project.client && <span className="muted">{project.client}</span>}
        <StatusBar counts={s.byStatus} total={s.blocks} />
        <span className="meta muted">{t('prod.cardMeta', { s: s.scenes, b: s.blocks, g: s.generations })}</span>
      </div>
    </button>
  );
}

function StatusBar({ counts, total }: { counts: Record<ProdStatus, number>; total: number }) {
  return (
    <div className="sbar" aria-hidden="true">
      {total > 0 && (['done', 'review', 'progress', 'todo'] as ProdStatus[]).map((s) => counts[s] > 0 && <span key={s} style={{ width: (counts[s] / total) * 100 + '%', background: STATUS_COLOR[s] }} />)}
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const { db, create, update } = useStore();
  const { t, nm } = useI18n();
  const { setProd } = useUi();
  const candidates = Object.values(db.projects).filter((p) => !p.production && !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);
  const [mode, setMode] = useState<'new' | 'existing'>(candidates.length ? 'existing' : 'new');
  const [existing, setExisting] = useState(candidates[0]?.id || '');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [ws, setWs] = useState(workspaces.find((w) => w.key === 'clients')?.id || workspaces[0]?.id || '');
  const submit = () => {
    if (mode === 'existing') {
      if (!existing) return;
      update('projects', existing, { production: true });
      setProd({ project: existing, scene: null });
    } else {
      if (!name.trim() || !ws) return;
      const id = newId();
      create('projects', { id, workspace_id: ws, name: name.trim().slice(0, 200), client: client.trim().slice(0, 200), color: db.workspaces[ws]?.color || '#e9b54a', archived: false, production: true });
      setProd({ project: id, scene: null });
    }
    onClose();
  };
  return (
    <Modal title={t('prod.newProject')} onClose={onClose} actions={<><button className="btn ghost" onClick={onClose}>{t('prod.cancel')}</button><button className="btn primary" onClick={submit} data-modal-ok>{t('prod.create')}</button></>}>
      {candidates.length > 0 && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>{t('prod.fromPlanner')}</button>
          <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>{t('prod.brandNew')}</button>
        </div>
      )}
      {mode === 'existing' ? (
        <div className="field">
          <label className="lbl">{t('detail.project')}</label>
          <select value={existing} onChange={(e) => setExisting(e.target.value)}>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ' · ' + p.client : ''}</option>)}
          </select>
          <p className="muted small">{t('prod.fromPlannerHint')}</p>
        </div>
      ) : (
        <>
          <div className="field"><label className="lbl">{t('prod.name')}</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-new-name /></div>
          <div className="field"><label className="lbl">{t('prod.client')}</label><input type="text" value={client} onChange={(e) => setClient(e.target.value)} /></div>
          <div className="field"><label className="lbl">{t('detail.workspace')}</label>
            <select value={ws} onChange={(e) => setWs(e.target.value)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}</select>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- board */

type Filter = 'all' | ProdStatus;

function ProdBoard({ project, sceneId }: { project: Project; sceneId: string | null }) {
  const { db, create, update } = useStore();
  const { t } = useI18n();
  const { setProd } = useUi();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'script' | 'trash' | null>(null);
  const scenes = scenesOf(db, project.id);
  const stats = projectStats(db, project.id);
  const trashCount = scenesOf(db, project.id, true).length
    + Object.values(db.prod_blocks).filter((b) => b.project_id === project.id && b.deleted_at && db.prod_scenes[b.scene_id] && !db.prod_scenes[b.scene_id].deleted_at).length
    + Object.values(db.prod_media).filter((m) => m.project_id === project.id && m.deleted_at).length;
  const shown = sceneId && db.prod_scenes[sceneId] && !db.prod_scenes[sceneId].deleted_at ? scenes.filter((s) => s.id === sceneId) : scenes;
  const query = q.trim().toLowerCase();

  const matches = (b: ProdBlock, s: ProdScene) => {
    if (filter !== 'all' && b.status !== filter) return false;
    if (!query) return true;
    if ((s.title + ' ' + b.text + ' ' + b.ai_note).toLowerCase().includes(query)) return true;
    return versionsOf(db, b.id).some((v) => revisionsOf(db, v.id).some((r) => r.text.toLowerCase().includes(query)));
  };

  const addScene = () => {
    const id = newId();
    create('prod_scenes', { id, project_id: project.id, position: nextPos(scenes), title: '', description: '', deleted_at: null, created_at: now() });
    create('prod_blocks', { id: newId(), project_id: project.id, scene_id: id, position: 0, text: '', status: 'todo', ai_note: '', assignee_id: null, deleted_at: null, created_at: now() });
    setProd({ project: project.id, scene: null });
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-scene="${id}"] .scene-title`)?.focus(), 60);
  };
  const doExport = () => {
    const head = ['prod.csv.scene', 'prod.csv.title', 'prod.csv.block', 'prod.csv.text', 'prod.csv.status', 'prod.csv.versions', 'prod.csv.gens', 'prod.csv.open', 'prod.csv.note'].map((k) => t(k as TKey));
    const csv = exportCsv(db, project.id, (s) => t(('prod.st.' + s) as TKey), head);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="prod">
      <div className="prod-hero">
        <div className="grow">
          <button className="crumb" onClick={() => setProd({ project: null, scene: null })}>← {t('prod.title')}</button>
          <input className="prod-name" value={project.name} aria-label={t('prod.name')} onChange={(e) => e.target.value.trim() && update('projects', project.id, { name: e.target.value.slice(0, 200) }, { debounce: true })} />
          <input className="prod-client" value={project.client} placeholder={t('prod.client')} aria-label={t('prod.client')} onChange={(e) => update('projects', project.id, { client: e.target.value.slice(0, 200) }, { debounce: true })} />
        </div>
        <div className="prod-actions">
          <button className="btn" onClick={() => setModal('trash')} data-prod-trash>🗑 {t('prod.trash')} {trashCount || ''}</button>
          <button className="btn" onClick={doExport} disabled={!stats.blocks}>⤓ {t('prod.export')}</button>
          <button className="btn" onClick={() => setModal('script')} data-prod-script>📄 {t('prod.pasteScript')}</button>
          <button className="btn primary" onClick={addScene} data-prod-add-scene>＋ {t('prod.scene')}</button>
        </div>
      </div>

      <div className="prod-stats">
        <span><b>{stats.scenes}</b> {t('prod.nScenes')}</span>
        <span><b>{stats.blocks}</b> {t('prod.nBlocks')}</span>
        <span><b>{stats.generations}</b> {t('prod.nGens')}</span>
        <span><b>{stats.openRevisions}</b> {t('prod.nOpenRev')}</span>
      </div>
      <div className="prod-progress">
        {([['done', ['done']], ['wip', ['progress', 'review']], ['todo', ['todo']]] as [string, ProdStatus[]][]).map(([k, list]) => {
          const n = list.reduce((a, s) => a + stats.byStatus[s], 0);
          const pct = stats.blocks ? Math.round((n / stats.blocks) * 100) : 0;
          return (
            <div key={k} className="pcard" data-progress={k}>
              <div className="row"><span className="grow">{t(('prod.pg.' + k) as TKey)}</span><b className="num">{n}</b><span className="muted num">/ {stats.blocks}</span></div>
              <div className="pbar"><span style={{ width: pct + '%', background: STATUS_COLOR[list[list.length - 1]] }} /></div>
              <div className="row muted small"><span className="grow">{t('prod.pgHint')}</span><span className="num">{pct}%</span></div>
            </div>
          );
        })}
      </div>

      <div className="prod-layout">
        {scenes.length > 0 && (
          <nav className="scene-nav" aria-label={t('prod.scenes')}>
            <div className="lbl">{t('prod.scenes')}</div>
            <button className={!sceneId ? 'on' : ''} onClick={() => setProd({ project: project.id, scene: null })}>{t('prod.allScenes')}</button>
            {scenes.map((s, i) => (
              <button key={s.id} className={sceneId === s.id ? 'on' : ''} onClick={() => setProd({ project: project.id, scene: s.id })} data-nav-scene={s.id}>
                <span className="num faint">{String(i + 1).padStart(2, '0')}</span> {s.title || t('prod.untitledScene')}
              </button>
            ))}
          </nav>
        )}
        <div className="prod-main">
          <div className="prod-toolbar">
            <div className="chips-wrap">
              {(['all', ...PROD_STATUSES] as Filter[]).map((f) => (
                <button key={f} className={'chip toggle' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)} data-filter={f}>
                  {f !== 'all' && <span className="dot" style={{ background: STATUS_COLOR[f] }} />}
                  {f === 'all' ? t('prod.all') : t(('prod.st.' + f) as TKey)}
                  <span className="faint num">{f === 'all' ? stats.blocks : stats.byStatus[f]}</span>
                </button>
              ))}
            </div>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('prod.search')} aria-label={t('prod.search')} className="prod-search" />
          </div>
          {sceneId && shown.length === 1 && (
            <div className="scene-filter">{t('prod.sceneN', { n: scenes.indexOf(shown[0]) + 1 })} <button className="btn ghost sm" onClick={() => setProd({ project: project.id, scene: null })}>{t('prod.showAll')} ✕</button></div>
          )}
          {!scenes.length && (
            <div className="empty prod-empty">
              <p>{t('prod.emptyBoard')}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={addScene}>＋ {t('prod.scene')}</button>
                <button className="btn" onClick={() => setModal('script')}>📄 {t('prod.pasteScript')}</button>
              </div>
            </div>
          )}
          {shown.map((s) => <SceneSection key={s.id} scene={s} n={scenes.indexOf(s) + 1} visible={(b) => matches(b, s)} filtered={filter !== 'all' || !!query} />)}
        </div>
      </div>
      {modal === 'script' && <ScriptModal project={project} onClose={() => setModal(null)} />}
      {modal === 'trash' && <TrashModal project={project} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- scene */

function SceneSection({ scene, n, visible, filtered }: { scene: ProdScene; n: number; visible: (b: ProdBlock) => boolean; filtered: boolean }) {
  const { db, create, update, toast } = useStore();
  const { t } = useI18n();
  const all = blocksOf(db, scene.id);
  const blocks = all.filter(visible);
  if (filtered && !blocks.length) return null;
  const addBlock = () => {
    const id = newId();
    create('prod_blocks', { id, project_id: scene.project_id, scene_id: scene.id, position: nextPos(all), text: '', status: 'todo', ai_note: '', assignee_id: null, deleted_at: null, created_at: now() });
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(`[data-block="${id}"] .block-text`)?.focus(), 60);
  };
  return (
    <section className="scene" data-scene={scene.id}>
      <header className="scene-h">
        <span className="scene-n">{n}</span>
        <div className="grow">
          <input className="scene-title" value={scene.title} placeholder={t('prod.sceneTitlePh')} aria-label={t('prod.sceneTitlePh')}
            onChange={(e) => update('prod_scenes', scene.id, { title: e.target.value.slice(0, 300) }, { debounce: true })} />
          <AutoText className="scene-desc" value={scene.description} placeholder={t('prod.sceneDescPh')} max={5000}
            onChange={(v) => update('prod_scenes', scene.id, { description: v }, { debounce: true })} />
        </div>
        <span className="muted small nowrap">{t('prod.blocksCount', { n: all.length })}</span>
        <button className="icon-btn" title={t('prod.toTrash')} aria-label={t('prod.toTrash')}
          onClick={() => { if (window.confirm(t('prod.confirmSceneTrash'))) { update('prod_scenes', scene.id, { deleted_at: now() }); toast(t('prod.movedToTrash')); } }}>🗑</button>
      </header>
      <div className="blocks">
        {blocks.map((b) => <BlockRow key={b.id} block={b} label={`${n}.${all.indexOf(b) + 1}`} siblings={all} />)}
      </div>
      <button className="btn ghost sm add-block" onClick={addBlock} data-add-block>＋ {t('prod.block')}</button>
    </section>
  );
}

/* ---------------------------------------------------------------- block */

interface Uploading { id: string; name: string }

function BlockRow({ block, label, siblings }: { block: ProdBlock; label: string; siblings: ProdBlock[] }) {
  const { db, me, create, update, backend, toast } = useStore();
  const { t, nm } = useI18n();
  const versions = versionsOf(db, block.id);
  const [vSel, setVSel] = useState<string | null>(null);
  const version = versions.find((v) => v.id === vSel) || versions[versions.length - 1] || null;
  const media = version ? mediaOf(db, version.id) : [];
  const gens = versions.reduce((a, v) => a + mediaOf(db, v.id).length, 0);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const members = Object.values(db.members);
  const idx = siblings.indexOf(block);

  const ensureVersion = (): ProdVersion => {
    if (version) return version;
    const v: ProdVersion = { id: newId(), project_id: block.project_id, block_id: block.id, number: 1, note: '', created_at: now() };
    create('prod_versions', v);
    setVSel(v.id);
    return v;
  };
  const addVersion = () => {
    const v: ProdVersion = { id: newId(), project_id: block.project_id, block_id: block.id, number: (versions[versions.length - 1]?.number || 0) + 1, note: '', created_at: now() };
    create('prod_versions', v);
    setVSel(v.id);
    if (block.status === 'done' || block.status === 'review') update('prod_blocks', block.id, { status: 'progress' });
  };
  const touchProgress = () => { if (block.status === 'todo') update('prod_blocks', block.id, { status: 'progress' }); };

  const uploadFiles = async (files: File[]) => {
    const ok = files.filter((f) => {
      if (!mediaKindOf(f.type)) { toast(t('prod.badType', { n: f.name }), 'error'); return false; }
      if (f.size > MAX_UPLOAD) { toast(t('prod.tooBig', { n: f.name }), 'error'); return false; }
      return true;
    });
    if (!ok.length) return;
    const v = ensureVersion();
    let pos = nextPos(mediaOf(db, v.id));
    touchProgress();
    await Promise.all(ok.map(async (f) => {
      const id = newId();
      const kind = mediaKindOf(f.type)!;
      const base = `${block.project_id}/${block.id}/${id}`;
      const path = `${base}.${extOf(f.name, f.type)}`;
      const my = pos++;
      setUploading((u) => [...u, { id, name: f.name }]);
      try {
        const thumb = await makeThumb(f, kind);
        await backend.files.upload(path, f, f.type);
        let thumbPath: string | null = null;
        if (thumb) { try { await backend.files.upload(base + '.thumb.jpg', thumb, 'image/jpeg'); thumbPath = base + '.thumb.jpg'; } catch { /* preview is optional */ } }
        create('prod_media', { id, project_id: block.project_id, version_id: v.id, kind, path, thumb_path: thumbPath, url: null, name: f.name.slice(0, 300), mime: f.type.slice(0, 100), size: f.size, position: my, deleted_at: null, created_at: now() });
      } catch (e) {
        toast(t('prod.uploadFailed', { n: f.name }) + ': ' + String((e as Error).message || e), 'error');
      } finally {
        setUploading((u) => u.filter((x) => x.id !== id));
      }
    }));
  };
  const addLink = (raw?: string) => {
    const url = (raw ?? window.prompt(t('prod.linkPrompt')) ?? '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast(t('prod.badLink'), 'error'); return; }
    const v = ensureVersion();
    touchProgress();
    let name = '';
    try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    create('prod_media', { id: newId(), project_id: block.project_id, version_id: v.id, kind: 'link', path: null, thumb_path: null, url: url.slice(0, 2000), name, mime: '', size: null, position: nextPos(mediaOf(db, v.id)), deleted_at: null, created_at: now() });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) { uploadFiles(files); return; }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url) addLink(url.split('\n')[0]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length) { e.preventDefault(); uploadFiles(files); return; }
    const text = e.clipboardData.getData('text/plain').trim();
    if (/^https?:\/\/\S+$/.test(text)) { e.preventDefault(); addLink(text); }
  };
  const move = (dir: -1 | 1) => {
    const other = siblings[idx + dir];
    if (!other) return;
    update('prod_blocks', block.id, { position: other.position });
    update('prod_blocks', other.id, { position: block.position });
  };

  return (
    <div className={'block st-' + block.status} data-block={block.id}>
      <div className="b-text">
        <div className="b-head">
          <span className="b-label num">{label}</span>
          <select className="b-assignee" value={block.assignee_id || ''} onChange={(e) => update('prod_blocks', block.id, { assignee_id: e.target.value || null })} aria-label={t('detail.assignee')}>
            <option value="">—</option>
            {members.map((m) => <option key={m.id} value={m.id}>{nm(m)}</option>)}
          </select>
          {block.assignee_id && <Avatar m={db.members[block.assignee_id]} />}
          <span className="grow" />
          <button className="icon-btn sm" onClick={() => move(-1)} disabled={idx === 0} aria-label={t('prod.up')} title={t('prod.up')}>↑</button>
          <button className="icon-btn sm" onClick={() => move(1)} disabled={idx === siblings.length - 1} aria-label={t('prod.down')} title={t('prod.down')}>↓</button>
          <button className="icon-btn sm" onClick={() => { update('prod_blocks', block.id, { deleted_at: now() }); toast(t('prod.movedToTrash')); }} aria-label={t('prod.toTrash')} title={t('prod.toTrash')}>🗑</button>
        </div>
        <AutoText className="block-text" value={block.text} placeholder={t('prod.blockTextPh')} max={20000}
          onChange={(v) => update('prod_blocks', block.id, { text: v }, { debounce: true })} />
      </div>

      <div className="b-status">
        <span className="lbl">{t('prod.col.status')}</span>
        <button className="status-pill" style={{ ['--sc' as string]: STATUS_COLOR[block.status] }} onClick={() => update('prod_blocks', block.id, { status: NEXT_STATUS[block.status] })}
          title={t('prod.statusHint')} data-status={block.status}>
          <span className="dot" />{t(('prod.st.' + block.status) as TKey)}
        </button>
        <select className="status-select" value={block.status} onChange={(e) => update('prod_blocks', block.id, { status: e.target.value as ProdStatus })} aria-label={t('prod.col.status')}>
          {PROD_STATUSES.map((s) => <option key={s} value={s}>{t(('prod.st.' + s) as TKey)}</option>)}
        </select>
      </div>

      <div className={'b-gens' + (drag ? ' drag' : '')} tabIndex={0} onPaste={onPaste} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <div className="b-gens-h">
          <span className="lbl">{t('prod.col.gens')}</span>
          <div className="vtabs">
            {versions.map((v) => (
              <button key={v.id} className={version?.id === v.id ? 'on' : ''} onClick={() => setVSel(v.id)} data-version={v.number}>V{v.number}</button>
            ))}
            <button onClick={addVersion} title={t('prod.newVersion')} aria-label={t('prod.newVersion')} data-add-version>＋</button>
          </div>
          <span className="faint small nowrap">{t('prod.gensMeta', { g: gens, v: versions.length })}</span>
        </div>
        <div className="media-grid">
          {media.map((m, i) => <MediaTile key={m.id} m={m} onOpen={() => setViewer(i)} />)}
          {uploading.map((u) => <div key={u.id} className="tile uploading" title={u.name}><span className="spin" /><span className="nm">{u.name}</span></div>)}
          <div className="tile add">
            <button onClick={() => fileInput.current?.click()} data-upload>⤒ {t('prod.upload')}</button>
            <button onClick={() => addLink()} data-add-link>🔗 {t('prod.link')}</button>
          </div>
        </div>
        <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        {!media.length && !uploading.length && <div className="faint small drop-hint">{t('prod.dropHint')}</div>}
      </div>

      <div className="b-note">
        <span className="lbl">{t('prod.col.note')}</span>
        <AutoText className="note-text" value={block.ai_note} placeholder={t('prod.notePh')} max={10000}
          onChange={(v) => update('prod_blocks', block.id, { ai_note: v }, { debounce: true })} />
      </div>

      <div className="b-revs">
        <span className="lbl">{version ? t('prod.revFor', { v: version.number }) : t('prod.col.revs')}</span>
        {version ? <Revisions block={block} version={version} me={me?.id || null} /> : <span className="faint small">{t('prod.revNeedVersion')}</span>}
      </div>

      {viewer !== null && media[viewer] && <Lightbox items={media} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- media */

function MediaTile({ m, onOpen }: { m: ProdMedia; onOpen: () => void }) {
  const { t } = useI18n();
  const link = m.kind === 'link' && m.url ? linkInfo(m.url) : null;
  const thumbFromLink = link?.kind === 'youtube' ? link.thumb : link?.kind === 'image' ? m.url : null;
  const src = useFileUrl(m.thumb_path || (m.kind === 'image' ? m.path : null), m.kind === 'image' ? m.url : thumbFromLink);
  const videoSrc = useFileUrl(!m.thumb_path && m.kind === 'video' ? m.path : null, null);
  return (
    <button className={'tile ' + m.kind} onClick={onOpen} title={m.name} data-media={m.id}>
      {src ? <img src={src} alt={m.name} loading="lazy" />
        : videoSrc ? <video src={videoSrc + '#t=0.5'} muted preload="metadata" playsInline />
        : m.kind === 'link' ? <span className="link-face">{link?.kind === 'drive' ? '▲ Drive' : '🔗'}<small>{m.name}</small></span>
        : <span className="spin" />}
      {(m.kind === 'video' || link?.kind === 'youtube' || link?.kind === 'video' || link?.kind === 'drive') && <span className="play">▶</span>}
      {m.kind === 'link' && <span className="badge">{t('prod.linkBadge')}</span>}
    </button>
  );
}

function Lightbox({ items, index, onIndex, onClose }: { items: ProdMedia[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { update, toast } = useStore();
  const { t } = useI18n();
  const m = items[index];
  const full = useFileUrl(m.kind !== 'link' ? m.path : null, m.kind !== 'link' ? m.url : null);
  const link = m.kind === 'link' && m.url ? linkInfo(m.url) : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, items.length, onClose, onIndex]);
  const remove = () => { update('prod_media', m.id, { deleted_at: now() }); toast(t('prod.movedToTrash')); if (items.length <= 1) onClose(); else onIndex(Math.max(0, index - 1)); };
  return (
    <div className="lightbox" role="dialog" aria-label={m.name} onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="grow nowrap ell">{m.name} <span className="faint">· {index + 1} / {items.length}</span></span>
        {(full || m.url) && <a className="btn sm" href={m.kind === 'link' ? m.url! : full} target="_blank" rel="noreferrer" download={m.kind !== 'link' ? m.name : undefined}>{m.kind === 'link' ? t('prod.openLink') : t('prod.download')}</a>}
        <button className="btn sm danger" onClick={remove}>🗑</button>
        <button className="btn sm" onClick={onClose} aria-label={t('detail.close')}>✕</button>
      </div>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {m.kind === 'image' && (full ? <img src={full} alt={m.name} /> : <span className="spin" />)}
        {m.kind === 'video' && (full ? <video src={full} controls autoPlay playsInline /> : <span className="spin" />)}
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

/* ---------------------------------------------------------------- revisions */

function Revisions({ block, version, me }: { block: ProdBlock; version: ProdVersion; me: string | null }) {
  const { db, create, update, remove, backend, toast } = useStore();
  const { t } = useI18n();
  const { addTask, openTask } = useUi();
  const revs = revisionsOf(db, version.id);
  const [text, setText] = useState('');
  const [img, setImg] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async () => {
    if (!text.trim() && !img) return;
    setBusy(true);
    const id = newId();
    let image_path: string | null = null;
    try {
      if (img) {
        if (img.size > MAX_UPLOAD || !img.type.startsWith('image/')) throw new Error(t('prod.badType', { n: img.name }));
        image_path = `${block.project_id}/rev/${id}.${extOf(img.name, img.type)}`;
        await backend.files.upload(image_path, img, img.type);
      }
      create('prod_revisions', { id, project_id: block.project_id, version_id: version.id, text: text.trim().slice(0, 5000), image_path, done: false, author_id: me, task_id: null, created_at: now() });
      if (block.status !== 'review') update('prod_blocks', block.id, { status: 'review' });
      setText(''); setImg(null);
    } catch (e) {
      toast(String((e as Error).message || e), 'error');
    } finally { setBusy(false); }
  };
  const toTask = (r: ProdRevision) => {
    const project = db.projects[block.project_id];
    const st = Object.values(db.statuses).find((s) => s.key === 'needs_fix');
    const scene = db.prod_scenes[block.scene_id];
    const extra: Partial<Task> = {
      project_id: project?.id || null, assignee_id: block.assignee_id, due_at: null,
      notes: [scene?.title, block.text.slice(0, 300), 'V' + version.number].filter(Boolean).join(' · '),
    };
    if (project) extra.workspace_id = project.workspace_id;
    if (st) extra.status_id = st.id;
    const task = addTask(r.text.slice(0, 200) || t('prod.revision'), extra);
    if (task) { update('prod_revisions', r.id, { task_id: task.id }); toast(t('prod.taskCreated')); }
  };
  return (
    <div className="revs">
      {revs.map((r) => <RevisionItem key={r.id} r={r} onToggle={() => update('prod_revisions', r.id, { done: !r.done })}
        onTask={() => (r.task_id && db.tasks[r.task_id] ? openTask(r.task_id) : toTask(r))} onDelete={() => { if (window.confirm(t('prod.confirmRevDelete'))) { remove('prod_revisions', r.id); if (r.image_path) backend.files.remove([r.image_path]).catch(() => {}); } }} />)}
      <div className="rev-add">
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('prod.revPh')} title={t('prod.revTip')} data-rev-input
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } }}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files || []).find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); setImg(f); } }} />
        <button className={'icon-btn' + (img ? ' on' : '')} onClick={() => fileRef.current?.click()} title={img ? img.name : t('prod.attach')} aria-label={t('prod.attach')}>📎</button>
        <button className="btn sm primary" onClick={add} disabled={busy || (!text.trim() && !img)} data-rev-add>{t('prod.add')}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { setImg(e.target.files?.[0] || null); e.target.value = ''; }} />
      </div>
      {img && <div className="faint small">📎 {img.name} <button className="btn ghost sm" onClick={() => setImg(null)}>✕</button></div>}
    </div>
  );
}

function RevisionItem({ r, onToggle, onTask, onDelete }: { r: ProdRevision; onToggle: () => void; onTask: () => void; onDelete: () => void }) {
  const { db } = useStore();
  const { t, lang } = useI18n();
  const src = useFileUrl(r.image_path, null);
  const [big, setBig] = useState(false);
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }) : '';
  return (
    <div className={'rev' + (r.done ? ' done' : '')} data-rev={r.id}>
      <input type="checkbox" checked={r.done} onChange={onToggle} aria-label={t('prod.revDone')} />
      <div className="grow">
        {r.text && <div className="rev-text">{r.text}</div>}
        {src && <img className="rev-img" src={src} alt="" onClick={() => setBig(true)} />}
        <div className="rev-meta faint">
          {r.author_id && db.members[r.author_id] && <Avatar m={db.members[r.author_id]} />} {when}
          <button className="link-btn" onClick={onTask}>{r.task_id && db.tasks[r.task_id] ? t('prod.openTask') : t('prod.makeTask')}</button>
          <button className="link-btn danger" onClick={onDelete}>{t('prod.delete')}</button>
        </div>
      </div>
      {big && src && <div className="lightbox" onClick={() => setBig(false)}><div className="lb-stage"><img src={src} alt="" /></div></div>}
    </div>
  );
}

/* ---------------------------------------------------------------- modals */

function Modal({ title, onClose, children, actions, wide }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-h"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="✕">✕</button></div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

function ScriptModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, create } = useStore();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseScript(text), [text]);
  const blocks = parsed.reduce((a, s) => a + s.blocks.length, 0);
  const submit = () => {
    if (!parsed.length) return;
    let pos = nextPos(scenesOf(db, project.id));
    for (const s of parsed) {
      const sid = newId();
      create('prod_scenes', { id: sid, project_id: project.id, position: pos++, title: s.title.slice(0, 300), description: '', deleted_at: null, created_at: now() });
      s.blocks.forEach((b, i) => create('prod_blocks', { id: newId(), project_id: project.id, scene_id: sid, position: i, text: b.slice(0, 20000), status: 'todo', ai_note: '', assignee_id: null, deleted_at: null, created_at: now() }));
    }
    onClose();
  };
  return (
    <Modal title={t('prod.pasteScript')} onClose={onClose} wide
      actions={<><span className="grow muted small" data-script-preview>{t('prod.scriptPreview', { s: parsed.length, b: blocks })}</span><button className="btn ghost" onClick={onClose}>{t('prod.cancel')}</button><button className="btn primary" onClick={submit} disabled={!parsed.length} data-modal-ok>{t('prod.addToProject')}</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{t('prod.scriptHelp')}</p>
      <textarea className="script-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('prod.scriptPh')} autoFocus data-script-input />
      {parsed.length > 0 && (
        <ol className="script-outline">
          {parsed.slice(0, 40).map((s, i) => <li key={i}><b>{s.title || t('prod.untitledScene')}</b> <span className="faint">· {t('prod.blocksCount', { n: s.blocks.length })}</span></li>)}
        </ol>
      )}
    </Modal>
  );
}

function TrashModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, update, remove, backend } = useStore();
  const { t } = useI18n();
  const scenes = scenesOf(db, project.id, true);
  const blocks = Object.values(db.prod_blocks).filter((b) => b.project_id === project.id && b.deleted_at && db.prod_scenes[b.scene_id] && !db.prod_scenes[b.scene_id].deleted_at);
  const media = Object.values(db.prod_media).filter((m) => m.project_id === project.id && m.deleted_at);

  /** Hard delete with children; files go too. */
  const purgeVersion = (v: ProdVersion, files: string[]) => {
    Object.values(db.prod_media).filter((m) => m.version_id === v.id).forEach((m) => { files.push(...[m.path, m.thumb_path].filter(Boolean) as string[]); remove('prod_media', m.id); });
    Object.values(db.prod_revisions).filter((r) => r.version_id === v.id).forEach((r) => { if (r.image_path) files.push(r.image_path); remove('prod_revisions', r.id); });
    remove('prod_versions', v.id);
  };
  const purgeBlock = (b: ProdBlock, files: string[]) => { versionsOf(db, b.id).forEach((v) => purgeVersion(v, files)); remove('prod_blocks', b.id); };
  const purge = (kind: 'scene' | 'block' | 'media', id: string) => {
    if (!window.confirm(t('prod.confirmPurge'))) return;
    const files: string[] = [];
    if (kind === 'media') { const m = db.prod_media[id]; files.push(...[m.path, m.thumb_path].filter(Boolean) as string[]); remove('prod_media', id); }
    if (kind === 'block') purgeBlock(db.prod_blocks[id], files);
    if (kind === 'scene') { Object.values(db.prod_blocks).filter((b) => b.scene_id === id).forEach((b) => purgeBlock(b, files)); remove('prod_scenes', id); }
    if (files.length) { backend.files.remove(files).catch(() => {}); forgetFiles(files); }
  };
  const item = (key: string, label: string, sub: string, onRestore: () => void, onPurge: () => void) => (
    <div className="trash-item" key={key}>
      <div className="grow"><div className="ell">{label}</div><div className="faint small">{sub}</div></div>
      <button className="btn sm" onClick={onRestore} data-restore>{t('prod.restore')}</button>
      <button className="btn sm danger" onClick={onPurge}>{t('prod.purge')}</button>
    </div>
  );
  const sceneName = (id: string) => db.prod_scenes[id]?.title || t('prod.untitledScene');
  return (
    <Modal title={t('prod.trash')} onClose={onClose} wide>
      {!scenes.length && !blocks.length && !media.length && <div className="empty">{t('prod.trashEmpty')}</div>}
      {scenes.map((s) => item(s.id, s.title || t('prod.untitledScene'), t('prod.trashScene', { n: blocksOf(db, s.id).length }), () => update('prod_scenes', s.id, { deleted_at: null }), () => purge('scene', s.id)))}
      {blocks.map((b) => item(b.id, b.text.slice(0, 120) || '—', t('prod.trashBlock', { s: sceneName(b.scene_id) }), () => update('prod_blocks', b.id, { deleted_at: null }), () => purge('block', b.id)))}
      {media.map((m) => {
        const v = db.prod_versions[m.version_id];
        const b = v && db.prod_blocks[v.block_id];
        return item(m.id, m.name || m.url || '—', t('prod.trashMedia', { v: v?.number || '?', b: b?.text.slice(0, 60) || '—' }), () => update('prod_media', m.id, { deleted_at: null }), () => purge('media', m.id));
      })}
      <p className="faint small">{t('prod.trashHint')}</p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- bits */

/** Textarea that grows with its content. */
function AutoText({ value, onChange, placeholder, className, max }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; max: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return <textarea ref={ref} rows={1} className={'autotext ' + (className || '')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.slice(0, max))} />;
}
