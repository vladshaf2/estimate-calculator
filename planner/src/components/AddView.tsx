import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { useI18n } from '../i18n';
import { parseQuick, quickToTask } from '../lib/quickAdd';
import { PRAGUE, addDays, dayKey, zonedToUtc } from '../lib/time';
import { Dot, newId } from './bits';
import { QuickPreview, TaskRow } from './ListView';
import { useUi } from './Shell';

const DEST_KEY = 'planner.addDest';
interface Dest { workspace: string; project: string | null; assignee: string | null; types: string[] }
type When = 'none' | 'today' | 'tomorrow' | 'date';

function loadDest(): Partial<Dest> {
  try { return JSON.parse(localStorage.getItem(DEST_KEY) || '{}') || {}; } catch { return {}; }
}

/** Start screen: type a task and pick where it goes. The choice is remembered for the next one. */
export function AddView() {
  const { db, me, create, toast } = useStore();
  const { t, nm } = useI18n();
  const { addTask } = useUi();
  const workspaces = Object.values(db.workspaces).sort((a, b) => a.position - b.position);
  const members = Object.values(db.members);
  const types = Object.values(db.work_types).sort((a, b) => a.position - b.position);

  const saved = useMemo(loadDest, []);
  const [title, setTitle] = useState('');
  const [workspace, setWorkspace] = useState(saved.workspace && db.workspaces[saved.workspace] ? saved.workspace : workspaces[0]?.id || '');
  const [project, setProject] = useState<string | null>(saved.project && db.projects[saved.project] ? saved.project : null);
  const [assignee, setAssignee] = useState<string | null>(saved.assignee && db.members[saved.assignee] ? saved.assignee : null);
  const [picked, setPicked] = useState<string[]>((saved.types || []).filter((id) => db.work_types[id]));
  const [when, setWhen] = useState<When>('none');
  const [date, setDate] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  // Workspaces/projects can arrive after the first render (initial load).
  useEffect(() => { if (!workspace && workspaces[0]) setWorkspace(workspaces[0].id); }, [workspace, workspaces]);
  useEffect(() => {
    try { localStorage.setItem(DEST_KEY, JSON.stringify({ workspace, project, assignee, types: picked })); } catch { /* ignore */ }
  }, [workspace, project, assignee, picked]);
  useEffect(() => { if (matchMedia('(pointer: fine)').matches) input.current?.focus(); }, []);

  const projects = Object.values(db.projects).filter((p) => p.workspace_id === workspace && !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  const parsed = useMemo(() => (title.trim() ? parseQuick(title, { db, meId: me?.id || null, now: new Date() }) : null), [title, db, me]);
  const today = dayKey(new Date(), PRAGUE);
  const dueDay = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : when === 'date' ? date : '';

  const submit = () => {
    if (!parsed) { input.current?.focus(); return; }
    const base: Partial<Task> = {
      workspace_id: workspace, project_id: project, assignee_id: assignee, work_type_ids: picked,
      due_at: dueDay ? zonedToUtc(dueDay, '00:00', PRAGUE) : null, due_all_day: true,
    };
    const fromText = quickToTask(parsed);
    // Tags typed in the text win; work types add up.
    const extra: Partial<Task> = { ...base, ...fromText, work_type_ids: [...new Set([...picked, ...(fromText.work_type_ids || [])])] };
    if (fromText.workspace_id && !fromText.project_id && fromText.workspace_id !== workspace) extra.project_id = null;
    const task = addTask(parsed.title, extra);
    if (!task) return;
    setAdded((a) => [task.id, ...a].slice(0, 20));
    setTitle('');
    toast(t('toast.created'));
    input.current?.focus();
  };

  const newProject = () => {
    const name = window.prompt(t('add.newProjectPrompt'))?.trim();
    if (!name) return;
    const id = newId();
    create('projects', { id, workspace_id: workspace, name: name.slice(0, 200), client: '', color: db.workspaces[workspace]?.color || '#e9b54a', archived: false });
    setProject(id);
  };

  const chip = (on: boolean, onClick: () => void, children: React.ReactNode, key: string, color?: string, data?: Record<string, string>) => (
    <button key={key} type="button" className={'chip toggle' + (on ? ' on' : '')} style={on && color ? { color } : undefined} onClick={onClick} {...data}>
      {color && <Dot color={color} />}{children}
    </button>
  );
  const recent = added.map((id) => db.tasks[id]).filter(Boolean);

  return (
    <div className="add-view">
      <form className="add-card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input ref={input} id="add-title" className="add-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={t('add.ph')} aria-label={t('add.ph')} title={t('quick.help')} autoComplete="off" enterKeyHint="done" />
        {parsed && parsed.chips.length > 0 && <QuickPreview p={parsed} />}

        <div className="add-row">
          <span className="lbl">{t('add.where')}</span>
          <div className="chips-wrap" data-add="workspace">
            {workspaces.map((w) => chip(workspace === w.id, () => { setWorkspace(w.id); setProject(null); }, nm(w), w.id, w.color))}
          </div>
          <div className="chips-wrap" data-add="project">
            {chip(!project, () => setProject(null), t('add.noProject'), 'none')}
            {projects.map((p) => chip(project === p.id, () => setProject(p.id), p.name, p.id, p.color))}
            <button type="button" className="chip toggle ghost" onClick={newProject} data-add-project>＋ {t('add.newProject')}</button>
          </div>
        </div>

        <div className="add-row">
          <span className="lbl">{t('add.when')}</span>
          <div className="chips-wrap" data-add="when">
            {chip(when === 'none', () => setWhen('none'), t('add.noDate'), 'none')}
            {chip(when === 'today', () => setWhen('today'), t('add.today'), 'today')}
            {chip(when === 'tomorrow', () => setWhen('tomorrow'), t('add.tomorrow'), 'tomorrow')}
            <input type="date" className={'chip-date' + (when === 'date' ? ' on' : '')} value={when === 'date' ? date : ''} aria-label={t('add.pickDate')}
              onChange={(e) => { setDate(e.target.value); setWhen(e.target.value ? 'date' : 'none'); }} />
          </div>
        </div>

        <div className="add-row">
          <span className="lbl">{t('add.who')}</span>
          <div className="chips-wrap" data-add="who">
            {chip(!assignee, () => setAssignee(null), t('add.nobody'), 'none')}
            {members.map((m) => chip(assignee === m.id, () => setAssignee(m.id), nm(m) + (m.id === me?.id ? ' (' + t('set.you') + ')' : ''), m.id, m.color))}
          </div>
        </div>

        <div className="add-row">
          <span className="lbl">{t('add.types')}</span>
          <div className="chips-wrap" data-add="types">
            {types.map((w) => chip(picked.includes(w.id), () => setPicked(picked.includes(w.id) ? picked.filter((x) => x !== w.id) : [...picked, w.id]), nm(w), w.id, w.color))}
          </div>
        </div>

        <button className="btn primary add-submit" disabled={!title.trim()} data-add-submit>{t('add.submit')}</button>
      </form>

      {recent.length > 0 && (
        <>
          <h2 className="add-h">{t('add.recent')}</h2>
          <div className="tasks">{recent.map((x) => <TaskRow key={x.id} task={x} />)}</div>
        </>
      )}
    </div>
  );
}
