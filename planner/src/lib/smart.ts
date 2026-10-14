// Smart lists, filters, search and sorting — pure functions so they can be unit-tested.
import type { Snapshot, Task } from '../data/types';
import { PRAGUE, addDays, dayKey, startOfWeek } from './time';

export type SmartListId = 'today' | 'overdue' | 'needs_fix' | 'client_review' | 'posts_week' | 'mine' | 'all';
export const SMART_LISTS: SmartListId[] = ['today', 'overdue', 'needs_fix', 'client_review', 'posts_week', 'mine', 'all'];

/** Current list: a smart list, a workspace or a project. */
export type ListRef = { kind: 'smart'; id: SmartListId } | { kind: 'workspace'; id: string } | { kind: 'project'; id: string };

export interface Filters {
  statuses: string[];
  types: string[];
  assignees: string[];
  workspaces: string[];
  projects: string[];
}
export const NO_FILTERS: Filters = { statuses: [], types: [], assignees: [], workspaces: [], projects: [] };

export interface Ctx {
  db: Snapshot;
  now: Date;
  meId: string | null;
  tz?: string;
}

export function isDone(t: Task, db: Snapshot): boolean {
  return !!(t.status_id && db.statuses[t.status_id]?.is_done);
}

function statusKey(t: Task, db: Snapshot): string | null {
  return (t.status_id && db.statuses[t.status_id]?.key) || null;
}

export function isOverdue(t: Task, ctx: Ctx): boolean {
  if (!t.due_at || isDone(t, ctx.db)) return false;
  const tz = ctx.tz || PRAGUE;
  if (t.due_all_day) return dayKey(t.due_at, tz) < dayKey(ctx.now, tz);
  return new Date(t.due_at).getTime() < ctx.now.getTime();
}

export function isToday(t: Task, ctx: Ctx): boolean {
  const tz = ctx.tz || PRAGUE;
  const today = dayKey(ctx.now, tz);
  return (!!t.due_at && dayKey(t.due_at, tz) === today) || (!!t.publish_at && dayKey(t.publish_at, tz) === today);
}

export function isPostThisWeek(t: Task, ctx: Ctx): boolean {
  if (!t.publish_at) return false;
  const tz = ctx.tz || PRAGUE;
  const start = startOfWeek(dayKey(ctx.now, tz));
  const k = dayKey(t.publish_at, tz);
  return k >= start && k < addDays(start, 7);
}

/** Does the task belong to the list? `includeDone` is used by the board/calendar, which show finished work too. */
export function inList(t: Task, list: ListRef, ctx: Ctx, includeDone = false): boolean {
  const done = isDone(t, ctx.db);
  if (list.kind === 'workspace') return t.workspace_id === list.id && (includeDone || !done);
  if (list.kind === 'project') return t.project_id === list.id && (includeDone || !done);
  switch (list.id) {
    case 'today': return isToday(t, ctx) && (includeDone || !done);
    case 'overdue': return isOverdue(t, ctx);
    case 'needs_fix': return statusKey(t, ctx.db) === 'needs_fix';
    case 'client_review': return statusKey(t, ctx.db) === 'client_review';
    case 'posts_week': return isPostThisWeek(t, ctx);
    case 'mine': return !!ctx.meId && t.assignee_id === ctx.meId && (includeDone || !done);
    case 'all': return includeDone || !done;
  }
}

export function matchesFilters(t: Task, f: Filters): boolean {
  if (f.statuses.length && !f.statuses.includes(t.status_id || '')) return false;
  if (f.types.length && !f.types.some((x) => t.work_type_ids.includes(x))) return false;
  if (f.assignees.length && !f.assignees.includes(t.assignee_id || '')) return false;
  if (f.workspaces.length && !f.workspaces.includes(t.workspace_id)) return false;
  if (f.projects.length && !f.projects.includes(t.project_id || '')) return false;
  return true;
}

export function matchesSearch(t: Task, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [t.title, t.notes, t.hook, t.caption].some((x) => (x || '').toLowerCase().includes(s));
}

export function activeFilterCount(f: Filters): number {
  return f.statuses.length + f.types.length + f.assignees.length + f.workspaces.length + f.projects.length;
}

/** Open first, then by date (due or publish), priority, creation. */
export function sortTasks(tasks: Task[], db: Snapshot): Task[] {
  const when = (t: Task) => t.due_at || t.publish_at || '';
  return tasks.slice().sort((a, b) => {
    const d = Number(isDone(a, db)) - Number(isDone(b, db));
    if (d) return d;
    const wa = when(a), wb = when(b);
    if (wa !== wb) return !wa ? 1 : !wb ? -1 : wa < wb ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

export function visibleTasks(ctx: Ctx, list: ListRef, filters: Filters, search: string, includeDone: boolean): Task[] {
  return sortTasks(Object.values(ctx.db.tasks).filter((t) => inList(t, list, ctx, includeDone) && matchesFilters(t, filters) && matchesSearch(t, search)), ctx.db);
}

export function countList(ctx: Ctx, list: ListRef): number {
  let n = 0;
  for (const t of Object.values(ctx.db.tasks)) if (inList(t, list, ctx)) n++;
  return n;
}
