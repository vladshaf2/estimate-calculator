import { useState, type KeyboardEvent } from 'react';
import { useStore } from '../data/store';
import type { Task } from '../data/types';
import { useI18n } from '../i18n';
import { inList, isDone, matchesFilters, visibleTasks } from '../lib/smart';
import { TaskMeta } from './bits';
import { useUi } from './Shell';

/** Status to use when a task is ticked / unticked. */
export function useCompletion() {
  const { db, update } = useStore();
  return (task: Task) => {
    const statuses = Object.values(db.statuses).sort((a, b) => a.position - b.position);
    const done = isDone(task, db);
    const target = done
      ? statuses.find((s) => s.key === 'in_progress') || statuses.find((s) => !s.is_done)
      : (task.publish_at && statuses.find((s) => s.key === 'published')) || statuses.find((s) => s.key === 'done') || statuses.find((s) => s.is_done);
    if (target) update('tasks', task.id, { status_id: target.id });
  };
}

function TaskRow({ task }: { task: Task }) {
  const { db, update } = useStore();
  const { t } = useI18n();
  const { openTask, openId } = useUi();
  const toggleDone = useCompletion();
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const done = isDone(task, db);
  const status = task.status_id ? db.statuses[task.status_id] : null;
  const shown = editing ? title : task.title;

  const commit = () => {
    setEditing(false);
    const v = title.trim();
    if (v && v !== task.title) update('tasks', task.id, { title: v.slice(0, 500) });
    else setTitle(task.title);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { setTitle(task.title); setEditing(false); }
  };

  return (
    <div className={'task-row' + (done ? ' done' : '') + (openId === task.id ? ' open' : '')} onClick={() => openTask(task.id)} data-task={task.id}>
      <button className={'check' + (done ? ' done' : '')} style={{ ['--status' as string]: status?.color }} aria-label={done ? t('task.reopen') : t('task.complete')}
        title={done ? t('task.reopen') : t('task.complete')} onClick={(e) => { e.stopPropagation(); toggleDone(task); }}>{done ? '✓' : ''}</button>
      <div className="task-main">
        <input className="task-title" value={shown} aria-label={t('detail.title')} onClick={(e) => e.stopPropagation()}
          onFocus={() => { setTitle(task.title); setEditing(true); }} onChange={(e) => setTitle(e.target.value)} onBlur={commit} onKeyDown={onKey} />
        <TaskMeta task={task} />
      </div>
    </div>
  );
}

export function ListView() {
  const { db, me } = useStore();
  const { t } = useI18n();
  const { list, filters, search, showDone, addTask, openTask } = useUi();
  const { toast } = useStore();
  const [draft, setDraft] = useState('');
  const tasks = visibleTasks({ db, now: new Date(), meId: me?.id || null }, list, filters, search, showDone);

  return (
    <>
      <form className="quick" onSubmit={(e) => {
        e.preventDefault();
        const task = addTask(draft);
        if (!task) return;
        setDraft('');
        // A task that doesn't fit the current list (e.g. "Posts this week" without a date) opens so it doesn't vanish.
        if (!inList(task, list, { db, now: new Date(), meId: me?.id || null }, true) || !matchesFilters(task, filters)) { toast(t('toast.created')); openTask(task.id); }
      }}>
        <input id="quick-add" type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('quick.ph')} aria-label={t('quick.ph')} autoComplete="off" />
      </form>
      <div className="muted" style={{ fontSize: 12.5, margin: '0 2px 8px' }}>{t('count.tasks', { n: tasks.length })}</div>
      {tasks.length ? <div className="tasks">{tasks.map((x) => <TaskRow key={x.id} task={x} />)}</div> : <div className="empty">{t('list.empty')}</div>}
    </>
  );
}
