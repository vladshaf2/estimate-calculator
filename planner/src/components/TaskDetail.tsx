import { useState } from 'react';
import { useStore } from '../data/store';
import type { Platform, Task, TaskLink } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { ALMATY, PRAGUE, utcToZoned, zonedToUtc, type Zone } from '../lib/time';
import { Dot, newId, postTimes } from './bits';

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, update, remove, toast } = useStore();
  const { t, nm, lang } = useI18n();
  const task = db.tasks[id];
  const [zone, setZone] = useState<Zone>(PRAGUE);
  const [newItem, setNewItem] = useState('');
  if (!task) return null;

  const set = (patch: Partial<Task>, debounce = false) => update('tasks', task.id, patch, { debounce });
  const statuses = Object.values(db.statuses).sort((a, b) => a.position - b.position);
  const types = Object.values(db.work_types).sort((a, b) => a.position - b.position);
  const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);
  const projects = Object.values(db.projects).filter((p) => p.workspace_id === task.workspace_id && (!p.archived || p.id === task.project_id));
  const members = Object.values(db.members);

  const due = task.due_at ? utcToZoned(task.due_at, PRAGUE) : { date: '', time: '' };
  const dueTime = task.due_all_day ? '' : due.time;
  const setDue = (date: string, time: string) => set(date ? { due_at: zonedToUtc(date, time || '00:00', PRAGUE), due_all_day: !time } : { due_at: null, due_all_day: true });
  const remind = task.remind_at ? utcToZoned(task.remind_at, PRAGUE) : { date: '', time: '' };
  const setRemind = (date: string, time: string) => set({ remind_at: date ? zonedToUtc(date, time || '09:00', PRAGUE) : null });
  const pub = task.publish_at ? utcToZoned(task.publish_at, zone) : { date: '', time: '' };
  const setPub = (date: string, time: string) => set({ publish_at: date ? zonedToUtc(date, time || '12:00', zone) : null });

  const setLinks = (links: TaskLink[], debounce = false) => set({ links }, debounce);
  const toggleType = (wid: string) => set({ work_type_ids: task.work_type_ids.includes(wid) ? task.work_type_ids.filter((x) => x !== wid) : [...task.work_type_ids, wid] });

  const del = () => {
    if (!window.confirm(t('detail.confirmDelete'))) return;
    onClose();
    remove('tasks', task.id);
    toast(t('toast.deleted'));
  };
  const fmtStamp = (iso: string) => new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: PRAGUE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={task.title}>
        <div className="drawer-h">
          <select value={task.status_id || ''} onChange={(e) => set({ status_id: e.target.value || null })} aria-label={t('detail.status')} style={{ width: 'auto', flex: 1 }} data-field="status">
            {!task.status_id && <option value="">{t('detail.noStatus')}</option>}
            {statuses.map((s) => <option key={s.id} value={s.id}>{nm(s)}</option>)}
          </select>
          <button className="icon-btn" onClick={onClose} aria-label={t('detail.close')}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <input className="title-input" type="text" value={task.title} aria-label={t('detail.title')} data-field="title"
              onChange={(e) => e.target.value.trim() && set({ title: e.target.value.slice(0, 500) }, true)} />
          </div>
          <div className="field">
            <label className="lbl">{t('detail.notes')}</label>
            <textarea value={task.notes} onChange={(e) => set({ notes: e.target.value }, true)} rows={3} data-field="notes" />
          </div>

          <div className="two">
            <div className="field">
              <label className="lbl">{t('detail.workspace')}</label>
              <select value={task.workspace_id} onChange={(e) => set({ workspace_id: e.target.value, project_id: null })}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl">{t('detail.project')}</label>
              <select value={task.project_id || ''} onChange={(e) => set({ project_id: e.target.value || null })} data-field="project">
                <option value="">{t('detail.noProject')}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl">{t('detail.assignee')}</label>
              <select value={task.assignee_id || ''} onChange={(e) => set({ assignee_id: e.target.value || null })} data-field="assignee">
                <option value="">{t('detail.unassigned')}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{nm(m)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl">{t('detail.priority')}</label>
              <select value={task.priority} onChange={(e) => set({ priority: Number(e.target.value) as Task['priority'] })} data-field="priority">
                {[0, 1, 2, 3].map((p) => <option key={p} value={p}>{t(('prio.' + p) as TKey)}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="lbl">{t('detail.types')}</label>
            <div className="chips-wrap">
              {types.map((w) => (
                <button key={w.id} type="button" className={'chip toggle' + (task.work_type_ids.includes(w.id) ? ' on' : '')} style={task.work_type_ids.includes(w.id) ? { color: w.color } : undefined}
                  onClick={() => toggleType(w.id)} data-type={w.key || w.id}><Dot color={w.color} />{nm(w)}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="lbl">{t('detail.due')}</label>
            <div className="row">
              <input type="date" value={due.date} onChange={(e) => setDue(e.target.value, dueTime)} data-field="due-date" />
              <input type="time" value={dueTime} onChange={(e) => setDue(due.date || utcToZoned(new Date().toISOString(), PRAGUE).date, e.target.value)} style={{ width: 120 }} data-field="due-time" />
              {task.due_at && <button className="btn ghost sm" onClick={() => setDue('', '')}>{t('detail.clear')}</button>}
            </div>
            <div className="zone-out">{t('detail.dueHint')}</div>
          </div>
          <div className="field">
            <label className="lbl">{t('detail.remind')}</label>
            <div className="row">
              <input type="date" value={remind.date} onChange={(e) => setRemind(e.target.value, remind.time)} />
              <input type="time" value={remind.date ? remind.time : ''} onChange={(e) => remind.date && setRemind(remind.date, e.target.value)} style={{ width: 120 }} />
              {task.remind_at && <button className="btn ghost sm" onClick={() => setRemind('', '')}>{t('detail.clear')}</button>}
            </div>
          </div>

          <div className="box">
            <div className="box-h">📣 {t('detail.post')}</div>
            <div className="two">
              <div className="field">
                <label className="lbl">{t('detail.platform')}</label>
                <select value={task.platform || ''} onChange={(e) => set({ platform: (e.target.value || null) as Platform | null })} data-field="platform">
                  <option value="">{t('detail.noPlatform')}</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
              <div className="field">
                <label className="lbl">{t('detail.enterIn')}</label>
                <div className="seg">
                  {([[PRAGUE, 'tz.prague'], [ALMATY, 'tz.almaty']] as const).map(([z, k]) => (
                    <button key={z} type="button" className={zone === z ? 'on' : ''} onClick={() => setZone(z)} data-zone={z}>{t(k)}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 6 }}>
              <label className="lbl">{t('detail.publish')}</label>
              <div className="row">
                <input type="date" value={pub.date} onChange={(e) => setPub(e.target.value, pub.time)} data-field="publish-date" />
                <input type="time" value={pub.date ? pub.time : ''} onChange={(e) => setPub(pub.date || utcToZoned(new Date().toISOString(), zone).date, e.target.value)} style={{ width: 120 }} data-field="publish-time" />
                {task.publish_at && <button className="btn ghost sm" onClick={() => set({ publish_at: null })}>{t('detail.clear')}</button>}
              </div>
              {task.publish_at && <div className="zone-out" data-out="zones"><b>{postTimes(task.publish_at, lang, t)}</b></div>}
            </div>
            <div className="field">
              <label className="lbl">{t('detail.hook')}</label>
              <input type="text" value={task.hook} onChange={(e) => set({ hook: e.target.value }, true)} data-field="hook" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="lbl">{t('detail.caption')}</label>
              <textarea value={task.caption} onChange={(e) => set({ caption: e.target.value }, true)} rows={3} data-field="caption" />
            </div>
          </div>

          <div className="field">
            <label className="lbl">{t('detail.links')}</label>
            {task.links.map((l, i) => (
              <div className="list-item" key={i}>
                <input type="text" value={l.label} placeholder={t('detail.linkLabel')} style={{ flex: '0 1 38%' }}
                  onChange={(e) => setLinks(task.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)), true)} />
                <input type="url" value={l.url} placeholder={t('detail.linkUrl')} onChange={(e) => setLinks(task.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)), true)} />
                {/^https?:\/\//.test(l.url) && <a className="icon-btn" href={l.url} target="_blank" rel="noreferrer" title={t('detail.openLink')}>↗</a>}
                <button className="icon-btn" onClick={() => setLinks(task.links.filter((_, j) => j !== i))} aria-label={t('detail.remove')}>✕</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => setLinks([...task.links, { label: '', url: '' }])}>{t('detail.addLink')}</button>
          </div>

          <div className="field">
            <label className="lbl">{t('detail.checklist')} {task.checklist.length ? `${task.checklist.filter((c) => c.done).length}/${task.checklist.length}` : ''}</label>
            {task.checklist.map((c) => (
              <div className="list-item" key={c.id}>
                <input type="checkbox" checked={c.done} onChange={() => set({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                <input type="text" value={c.text} style={c.done ? { textDecoration: 'line-through', color: 'var(--faint)' } : undefined}
                  onChange={(e) => set({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) }, true)} />
                <button className="icon-btn" onClick={() => set({ checklist: task.checklist.filter((x) => x.id !== c.id) })} aria-label={t('detail.remove')}>✕</button>
              </div>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); if (!newItem.trim()) return; set({ checklist: [...task.checklist, { id: newId(), text: newItem.trim(), done: false }] }); setNewItem(''); }}>
              <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={t('detail.addItem')} data-field="checklist-new" />
            </form>
          </div>

          <button className="btn danger" onClick={del}>{t('detail.delete')}</button>
          <div className="meta">{t('detail.meta', { created: fmtStamp(task.created_at), updated: fmtStamp(task.updated_at) })}</div>
        </div>
      </aside>
    </>
  );
}
