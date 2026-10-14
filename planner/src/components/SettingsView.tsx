import { useStore } from '../data/store';
import type { Status, WorkType, Workspace } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { LangSwitch, newId } from './bits';

type Ordered = Status | WorkType | Workspace;
type OrderedTable = 'statuses' | 'work_types' | 'workspaces';

/** Editable list of statuses / work types / workspaces: names in both languages, color, order. */
function OrderedEditor({ table, title, newLabel, confirmKey }: { table: OrderedTable; title: TKey; newLabel: TKey; confirmKey: TKey }) {
  const { db, update, create, remove } = useStore();
  const { t } = useI18n();
  const rows = (Object.values(db[table]) as Ordered[]).sort((a, b) => a.position - b.position);

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= rows.length) return;
    update(table, rows[i].id, { position: rows[j].position === rows[i].position ? j : rows[j].position });
    update(table, rows[j].id, { position: rows[j].position === rows[i].position ? i : rows[i].position });
  };
  const add = () => {
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    const base = { id: newId(), key: null, name_en: t(newLabel), name_ru: t(newLabel), color: '#8d8d96', position };
    if (table === 'statuses') create('statuses', { ...base, is_done: false });
    else create(table, base);
  };

  return (
    <section className="card-s" data-editor={table}>
      <h2>{t(title)}</h2>
      {rows.map((r, i) => (
        <div className="edit-row" key={r.id}>
          <input type="color" value={r.color} onChange={(e) => update(table, r.id, { color: e.target.value }, { debounce: true })} aria-label={t('set.color')} />
          <input type="text" value={r.name_en} placeholder={t('set.nameEn')} aria-label={t('set.nameEn')} onChange={(e) => update(table, r.id, { name_en: e.target.value }, { debounce: true })} />
          <input type="text" value={r.name_ru} placeholder={t('set.nameRu')} aria-label={t('set.nameRu')} onChange={(e) => update(table, r.id, { name_ru: e.target.value }, { debounce: true })} />
          {table === 'statuses' && (
            <label className="ck"><input type="checkbox" checked={(r as Status).is_done} onChange={(e) => update('statuses', r.id, { is_done: e.target.checked })} /> {t('set.isDone')}</label>
          )}
          <button className="icon-btn" onClick={() => swap(i, i - 1)} disabled={i === 0} aria-label={t('set.up')}>↑</button>
          <button className="icon-btn" onClick={() => swap(i, i + 1)} disabled={i === rows.length - 1} aria-label={t('set.down')}>↓</button>
          <button className="icon-btn" onClick={() => {
            if (!window.confirm(t(confirmKey))) return;
            if (table === 'work_types') for (const task of Object.values(db.tasks)) if (task.work_type_ids.includes(r.id)) update('tasks', task.id, { work_type_ids: task.work_type_ids.filter((x) => x !== r.id) });
            remove(table, r.id);
          }} aria-label={t('set.delete')}>✕</button>
        </div>
      ))}
      <button className="btn sm" onClick={add}>{t('set.add')}</button>
    </section>
  );
}

function ProjectsEditor() {
  const { db, update, create, remove } = useStore();
  const { t, nm } = useI18n();
  const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);
  // Creation order (not name), so a row doesn't jump around while it's being renamed.
  const projects = Object.values(db.projects).sort((a, b) => Number(a.archived) - Number(b.archived) || (a.created_at || '~').localeCompare(b.created_at || '~'));
  return (
    <section className="card-s" data-editor="projects">
      <h2>{t('set.projects')}</h2>
      {projects.map((p) => (
        <div className="edit-row" key={p.id} style={p.archived ? { opacity: 0.55 } : undefined}>
          <input type="color" value={p.color} onChange={(e) => update('projects', p.id, { color: e.target.value }, { debounce: true })} aria-label={t('set.color')} />
          <input type="text" value={p.name} placeholder={t('set.projectName')} aria-label={t('set.projectName')} onChange={(e) => e.target.value.trim() && update('projects', p.id, { name: e.target.value }, { debounce: true })} />
          <input type="text" value={p.client} placeholder={t('set.client')} aria-label={t('set.client')} onChange={(e) => update('projects', p.id, { client: e.target.value }, { debounce: true })} />
          <select value={p.workspace_id} onChange={(e) => update('projects', p.id, { workspace_id: e.target.value })} style={{ width: 'auto' }}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}
          </select>
          <label className="ck"><input type="checkbox" checked={p.archived} onChange={(e) => update('projects', p.id, { archived: e.target.checked })} /> {t('set.archived')}</label>
          <button className="icon-btn" onClick={() => window.confirm(t('set.confirmProject')) && remove('projects', p.id)} aria-label={t('set.delete')}>✕</button>
        </div>
      ))}
      <button className="btn sm" disabled={!workspaces.length} onClick={() => create('projects', { id: newId(), workspace_id: workspaces[0].id, name: t('set.newProject'), client: '', color: '#e9b54a', archived: false })}>{t('set.add')}</button>
    </section>
  );
}

export function SettingsView() {
  const { db, me, email, backend, update } = useStore();
  const { t, nm } = useI18n();
  return (
    <div className="settings">
      <div className="page-h"><h1>{t('nav.settings')}</h1></div>
      <section className="card-s">
        <h2>{t('set.language')}</h2>
        <LangSwitch />
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{t('set.shortcuts')}</p>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{t('set.install')}</p>
      </section>
      <OrderedEditor table="statuses" title="set.statuses" newLabel="set.newStatus" confirmKey="set.confirmStatus" />
      <OrderedEditor table="work_types" title="set.types" newLabel="set.newType" confirmKey="set.confirmType" />
      <OrderedEditor table="workspaces" title="set.workspaces" newLabel="set.newWorkspace" confirmKey="set.confirmWorkspace" />
      <ProjectsEditor />
      <section className="card-s">
        <h2>{t('set.team')}</h2>
        {Object.values(db.members).map((m) => (
          <div className="edit-row" key={m.id}>
            {m.id === me?.id ? (
              <>
                <input type="color" value={m.color} onChange={(e) => update('members', m.id, { color: e.target.value }, { debounce: true })} aria-label={t('set.color')} />
                <input type="text" value={m.name_en} aria-label={t('set.nameEn')} onChange={(e) => e.target.value.trim() && update('members', m.id, { name_en: e.target.value }, { debounce: true })} />
                <input type="text" value={m.name_ru} aria-label={t('set.nameRu')} onChange={(e) => e.target.value.trim() && update('members', m.id, { name_ru: e.target.value }, { debounce: true })} />
                <span className="muted" style={{ fontSize: 12 }}>({t('set.you')})</span>
              </>
            ) : (
              <span><span className="avatar" style={{ background: m.color, marginRight: 8 }}>{nm(m).slice(0, 1)}</span>{nm(m)} <span className="muted">· {m.email}</span></span>
            )}
          </div>
        ))}
      </section>
      <section className="card-s">
        <h2>{t('set.account')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('set.signedInAs', { email })}</p>
        <button className="btn" onClick={() => backend.signOut()}>{backend.kind === 'demo' ? t('set.demoReset') : t('set.signOut')}</button>
      </section>
    </div>
  );
}
