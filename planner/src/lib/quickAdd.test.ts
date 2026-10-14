import { describe, expect, it } from 'vitest';
import { seed } from '../data/demoBackend';
import { parseQuick, quickToTask, quickWhen } from './quickAdd';

// Wednesday 14 Oct 2026, 12:00 in Prague (CEST, UTC+2). Almaty is UTC+5.
const now = new Date('2026-10-14T10:00:00Z');
const db = seed();
const p = (s: string) => parseQuick(s, { db, meId: 'demo_vlad', now });

describe('quick add: title and tags', () => {
  it('parses the classic example', () => {
    const r = p('Battle reel #reel @igor fri 18:00');
    expect(r.title).toBe('Battle reel');
    expect(r.work_type_ids).toEqual(['wt_reel']);
    expect(r.assignee_id).toBe('demo_igor');
    expect(quickToTask(r)).toMatchObject({ due_at: '2026-10-16T16:00:00.000Z', due_all_day: false });
  });
  it('parses the same in Russian', () => {
    const r = p('Монтаж ролика #монтаж @игорь завтра в 15:30');
    expect(r.title).toBe('Монтаж ролика');
    expect(r.work_type_ids).toEqual(['wt_video_editing']);
    expect(r.assignee_id).toBe('demo_igor');
    expect(r.date).toBe('2026-10-15');
    expect(r.time).toBe('15:30');
  });
  it('leaves plain text alone', () => {
    const r = p('Call the client about the brief');
    expect(r.title).toBe('Call the client about the brief');
    expect(r.chips).toEqual([]);
    expect(quickToTask(r)).toEqual({});
  });
  it('keeps unknown tags and members in the title', () => {
    const r = p('Check #unknown with @nobody');
    expect(r.title).toBe('Check #unknown with @nobody');
    expect(r.chips).toEqual([]);
  });
  it('keeps the input as the title when everything was parsed', () => {
    const r = p('tomorrow');
    expect(r.title).toBe('tomorrow');
    expect(r.date).toBe('2026-10-15');
  });
  it('collects several work types; underscores and dashes are optional', () => {
    expect(p('x #reel #video').work_type_ids).toEqual(['wt_reel', 'wt_video']);
    expect(p('x #video-editing').work_type_ids).toEqual(['wt_video_editing']);
    expect(p('x #videoediting').work_type_ids).toEqual(['wt_video_editing']);
  });
  it('matches statuses by key or name in either language', () => {
    expect(p('x #needs_fix').status_id).toBe('st_needs_fix');
    expect(p('x #поправить').status_id).toBe('st_needs_fix');
    expect(p('x #published').status_id).toBe('st_published');
  });
  it('matches a project by name prefix and takes its workspace', () => {
    const r = p('Treatment #nova');
    expect(r.project_id).toBe('pr_nova');
    expect(quickToTask(r)).toMatchObject({ project_id: 'pr_nova', workspace_id: 'ws_clients' });
  });
  it('matches a workspace', () => {
    expect(p('Idea #content').workspace_id).toBe('ws_content');
    expect(p('Идея #контент').workspace_id).toBe('ws_content');
  });
  it('understands @me and @я', () => {
    expect(p('x @me').assignee_id).toBe('demo_vlad');
    expect(p('x @я').assignee_id).toBe('demo_vlad');
    expect(p('x @Влад').assignee_id).toBe('demo_vlad');
  });
  it('reads priorities', () => {
    expect(p('x !').priority).toBe(1);
    expect(p('x !!!').priority).toBe(3);
    expect(p('x !high').priority).toBe(3);
    expect(p('x !низкий').priority).toBe(1);
    expect(p('x !средний').priority).toBe(2);
    expect(p('Wow!').title).toBe('Wow!');
  });
});

describe('quick add: dates', () => {
  it('today / tomorrow / day after, any case', () => {
    expect(p('x today').date).toBe('2026-10-14');
    expect(p('x СЕГОДНЯ').date).toBe('2026-10-14');
    expect(p('x Tomorrow').date).toBe('2026-10-15');
    expect(p('x послезавтра').date).toBe('2026-10-16');
  });
  it('weekday names: same day counts as today', () => {
    expect(p('x wed').date).toBe('2026-10-14');
    expect(p('x ср').date).toBe('2026-10-14');
    expect(p('x monday').date).toBe('2026-10-19');
    expect(p('x вс').date).toBe('2026-10-18');
  });
  it('eats a preposition only together with a date', () => {
    const r = p('Созвон в пятницу');
    expect(r.title).toBe('Созвон');
    expect(r.date).toBe('2026-10-16');
    expect(p('Встреча в офисе').title).toBe('Встреча в офисе');
  });
  it('"next" means the weekday of next week', () => {
    expect(p('x next mon').date).toBe('2026-10-19');
    expect(p('x next fri').date).toBe('2026-10-23');
    expect(p('x след пт').date).toBe('2026-10-23');
  });
  it('dd.mm rolls to next year once passed; invalid dates stay text', () => {
    expect(p('x 20.10').date).toBe('2026-10-20');
    expect(p('x 01.02').date).toBe('2027-02-01');
    expect(p('x 5.11.27').date).toBe('2027-11-05');
    expect(p('x 2026-11-03').date).toBe('2026-11-03');
    const bad = p('x 31.02');
    expect(bad.date).toBeUndefined();
    expect(bad.title).toBe('x 31.02');
  });
  it('day + month name in both languages', () => {
    expect(p('x 20 oct').date).toBe('2026-10-20');
    expect(p('x 20 окт').date).toBe('2026-10-20');
    expect(p('x 3 мая').date).toBe('2027-05-03');
    expect(p('x 8 марта').date).toBe('2027-03-08');
    expect(p('x march 5').date).toBe('2027-03-05');
  });
  it('strips trailing punctuation when matching', () => {
    const r = p('Call Igor tomorrow, please');
    expect(r.title).toBe('Call Igor please');
    expect(r.date).toBe('2026-10-15');
  });
});

describe('quick add: times and zones', () => {
  it('12h and 24h formats', () => {
    expect(p('x 6pm').time).toBe('18:00');
    expect(p('x 9:30am').time).toBe('09:30');
    expect(p('x 12am').time).toBe('00:00');
    expect(p('x 18ч').time).toBe('18:00');
  });
  it('a bare hour is a time only after a preposition', () => {
    expect(p('x at 9').time).toBe('09:00');
    expect(p('x в 18').time).toBe('18:00');
    const r = p('Shot 9');
    expect(r.title).toBe('Shot 9');
    expect(r.time).toBeUndefined();
  });
  it('time without a date: today, or tomorrow once passed', () => {
    expect(p('x 18:00').date).toBe('2026-10-14');
    expect(p('x 09:00').date).toBe('2026-10-15');
  });
  it('date without time is an all-day due date', () => {
    expect(quickToTask(p('x fri'))).toMatchObject({ due_at: '2026-10-15T22:00:00.000Z', due_all_day: true });
  });
  it('+ala enters the time in Almaty', () => {
    const r = p('x 22:00 +алм');
    expect(r.zone).toBe('Asia/Almaty');
    expect(quickToTask(r).due_at).toBe('2026-10-14T17:00:00.000Z');
    expect(quickWhen(r)).toEqual({ date: '2026-10-14', time: '19:00' });
  });
  it('a platform turns the date into the publish time', () => {
    const r = p('Teaser #reel #ig fri 18:00 +ala');
    expect(r.title).toBe('Teaser');
    const t = quickToTask(r);
    expect(t).toMatchObject({ platform: 'instagram', publish_at: '2026-10-16T13:00:00.000Z' });
    expect(t.due_at).toBeUndefined();
    expect(quickToTask(p('x #tiktok tomorrow')).publish_at).toBe('2026-10-15T10:00:00.000Z');
  });
  it('handles the DST switch (26 Oct is CET)', () => {
    expect(quickToTask(p('x 26.10 18:00')).due_at).toBe('2026-10-26T17:00:00.000Z');
  });
  it('the zone chip appears only next to a time', () => {
    expect(p('x +ala').chips.map((c) => c.kind)).toEqual([]);
    expect(p('x 18:00 +ala').chips.map((c) => c.kind)).toEqual(['zone', 'date']);
  });
});
