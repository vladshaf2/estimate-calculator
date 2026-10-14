import { describe, expect, it } from 'vitest';
import { emptySnapshot, type Snapshot, type Task } from '../data/types';
import { NO_FILTERS, inList, isOverdue, matchesFilters, matchesSearch, sortTasks, visibleTasks, type Ctx } from './smart';
import { zonedToUtc, PRAGUE } from './time';

function db(): Snapshot {
  const s = emptySnapshot();
  const st = (id: string, key: string, done = false, position = 0) => (s.statuses[id] = { id, key, name_en: key, name_ru: key, color: '#000', position, is_done: done });
  st('s_idea', 'idea', false, 0); st('s_fix', 'needs_fix', false, 1); st('s_review', 'client_review', false, 2); st('s_done', 'done', true, 3);
  s.workspaces.w1 = { id: 'w1', key: 'clients', name_en: 'Clients', name_ru: 'Клиенты', color: '#000', position: 0 };
  s.members.m1 = { id: 'm1', email: 'a@x', name_en: 'A', name_ru: 'А', color: '#000', lang: 'en' };
  return s;
}
let n = 0;
function task(p: Partial<Task>): Task {
  n++;
  return { id: 't' + n, title: 'Task ' + n, notes: '', workspace_id: 'w1', project_id: null, status_id: 's_idea', work_type_ids: [], assignee_id: null, priority: 0,
    due_at: null, due_all_day: true, remind_at: null, platform: null, publish_at: null, hook: '', caption: '', links: [], checklist: [], sort_order: 0,
    created_by: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', completed_at: null, ...p };
}
// "Now" = Wed 14 Oct 2026, 10:00 Prague.
const NOW = new Date(zonedToUtc('2026-10-14', '10:00', PRAGUE));

describe('smart lists', () => {
  const s = db();
  const ctx: Ctx = { db: s, now: NOW, meId: 'm1' };
  const allDayToday = task({ due_at: zonedToUtc('2026-10-14', '00:00', PRAGUE) });
  const allDayYesterday = task({ due_at: zonedToUtc('2026-10-13', '00:00', PRAGUE) });
  const timedEarlierToday = task({ due_at: zonedToUtc('2026-10-14', '09:00', PRAGUE), due_all_day: false });
  const timedLaterToday = task({ due_at: zonedToUtc('2026-10-14', '18:00', PRAGUE), due_all_day: false });
  const doneYesterday = task({ due_at: zonedToUtc('2026-10-13', '00:00', PRAGUE), status_id: 's_done' });
  const postSunday = task({ publish_at: zonedToUtc('2026-10-18', '20:00', PRAGUE), platform: 'instagram' });
  const postNextMonday = task({ publish_at: zonedToUtc('2026-10-19', '09:00', PRAGUE) });
  const fix = task({ status_id: 's_fix', assignee_id: 'm1' });
  const review = task({ status_id: 's_review' });

  it('today includes all-day and timed tasks of today, not yesterday', () => {
    expect(inList(allDayToday, { kind: 'smart', id: 'today' }, ctx)).toBe(true);
    expect(inList(timedLaterToday, { kind: 'smart', id: 'today' }, ctx)).toBe(true);
    expect(inList(allDayYesterday, { kind: 'smart', id: 'today' }, ctx)).toBe(false);
  });

  it('overdue: all-day only from the next day; timed as soon as the time passes; never when done', () => {
    expect(isOverdue(allDayToday, ctx)).toBe(false);
    expect(isOverdue(allDayYesterday, ctx)).toBe(true);
    expect(isOverdue(timedEarlierToday, ctx)).toBe(true);
    expect(isOverdue(timedLaterToday, ctx)).toBe(false);
    expect(isOverdue(doneYesterday, ctx)).toBe(false);
  });

  it('posts this week run Monday–Sunday in Prague time', () => {
    expect(inList(postSunday, { kind: 'smart', id: 'posts_week' }, ctx)).toBe(true);
    expect(inList(postNextMonday, { kind: 'smart', id: 'posts_week' }, ctx)).toBe(false);
  });

  it('status lists and "assigned to me"', () => {
    expect(inList(fix, { kind: 'smart', id: 'needs_fix' }, ctx)).toBe(true);
    expect(inList(review, { kind: 'smart', id: 'client_review' }, ctx)).toBe(true);
    expect(inList(fix, { kind: 'smart', id: 'mine' }, ctx)).toBe(true);
    expect(inList(review, { kind: 'smart', id: 'mine' }, ctx)).toBe(false);
  });

  it('done tasks are hidden unless includeDone', () => {
    expect(inList(doneYesterday, { kind: 'smart', id: 'all' }, ctx)).toBe(false);
    expect(inList(doneYesterday, { kind: 'smart', id: 'all' }, ctx, true)).toBe(true);
  });

  it('filters, search and sorting', () => {
    const a = task({ title: 'Battle reel', work_type_ids: ['wt_reel'], hook: 'Hook text' });
    expect(matchesFilters(a, { ...NO_FILTERS, types: ['wt_reel'] })).toBe(true);
    expect(matchesFilters(a, { ...NO_FILTERS, types: ['wt_post'] })).toBe(false);
    expect(matchesFilters(a, { ...NO_FILTERS, assignees: ['m1'] })).toBe(false);
    expect(matchesSearch(a, 'hook')).toBe(true);
    expect(matchesSearch(a, 'BATTLE')).toBe(true);
    expect(matchesSearch(a, 'nope')).toBe(false);
    const sorted = sortTasks([doneYesterday, timedLaterToday, allDayYesterday, fix], s).map((t) => t.id);
    expect(sorted).toEqual([allDayYesterday.id, timedLaterToday.id, fix.id, doneYesterday.id]);
  });

  it('visibleTasks combines everything', () => {
    for (const t of [allDayToday, allDayYesterday, doneYesterday, fix]) s.tasks[t.id] = t;
    expect(visibleTasks(ctx, { kind: 'smart', id: 'all' }, NO_FILTERS, '', false).length).toBe(3);
    expect(visibleTasks(ctx, { kind: 'smart', id: 'all' }, NO_FILTERS, '', true).length).toBe(4);
  });
});
