import { describe, expect, it } from 'vitest';
import { seed } from '../data/demoBackend';
import { blockLabels, blocksOf, exportCsv, linkInfo, nextPos, projectStats, scenesOf, unitsOf } from './prod';

describe('production helpers', () => {
  const db = seed();
  it('orders scenes and blocks', () => {
    expect(scenesOf(db, 'pr_nova').map((s) => s.id)).toEqual(['ps1', 'ps2']);
    expect(blocksOf(db, 'ps1').map((b) => b.id)).toEqual(['pb1', 'pb2', 'pb3']);
  });
  it('counts stats and skips deleted things', () => {
    expect(projectStats(db, 'pr_nova')).toEqual({ scenes: 2, blocks: 5, generations: 7, byStatus: { todo: 2, progress: 1, review: 1, done: 1 }, openRevisions: 1 });
    const d2 = structuredClone(db);
    d2.prod_scenes.ps2.deleted_at = '2026-01-01T00:00:00Z';
    d2.prod_media.pm1.deleted_at = '2026-01-01T00:00:00Z';
    const s = projectStats(d2, 'pr_nova');
    expect([s.scenes, s.blocks, s.generations]).toEqual([1, 3, 6]);
  });
  it('recognises links', () => {
    expect(linkInfo('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toMatchObject({ kind: 'drive', id: '1AbCdEfGhIjKlMnOp' });
    expect(linkInfo('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toMatchObject({ kind: 'drive' });
    expect(linkInfo('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ kind: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(linkInfo('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({ kind: 'youtube' });
    expect(linkInfo('https://cdn.example.com/a/b.MP4?x=1')).toEqual({ kind: 'video' });
    expect(linkInfo('https://higgsfield.ai/job/123')).toEqual({ kind: 'other', host: 'higgsfield.ai' });
    expect(linkInfo('not a url')).toEqual({ kind: 'other', host: '' });
  });
  it('appends positions', () => {
    expect(nextPos([])).toBe(0);
    expect(nextPos([{ position: 2 }, { position: 7 }])).toBe(8);
  });
  it('exports CSV', () => {
    const csv = exportCsv(db, 'pr_nova', (s) => s.toUpperCase(), ['Scene', 'Title', 'Block', 'Text', 'Status', 'Versions', 'Generations', 'Open revisions', 'AI note']);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(6);
    expect(lines[2]).toBe('"1";"Rooftop at dawn";"1.2";"Close-up: she opens her eyes, wind in her hair.";"REVIEW";"2";"3";"1";"Face consistency — use character sheet v3"');
  });
  it('merged blocks form one unit and count once', () => {
    const d = structuredClone(db);
    d.prod_blocks.pb1.group_id = 'pb1';
    d.prod_blocks.pb2.group_id = 'pb1';
    const units = unitsOf(d, 'ps1');
    expect(units.map((u) => [u.lead.id, u.members.map((m) => m.id)])).toEqual([['pb1', ['pb1', 'pb2']], ['pb3', ['pb3']]]);
    expect(blockLabels(d, 'ps1', 1)).toEqual({ pb1: '1.1', pb2: '1.2', pb3: '1.3' });
    const s = projectStats(d, 'pr_nova');
    expect(s.blocks).toBe(4);
    expect(s.byStatus).toEqual({ todo: 2, progress: 1, review: 0, done: 1 });
    const csv = exportCsv(d, 'pr_nova', (x) => x, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']).slice(1).split('\r\n');
    expect(csv[1].startsWith('"1";"Rooftop at dawn";"1.1 + 1.2";')).toBe(true);
  });
  it('a member whose lead is gone is shown on its own', () => {
    const d = structuredClone(db);
    d.prod_blocks.pb1.group_id = 'pb1';
    d.prod_blocks.pb2.group_id = 'pb1';
    d.prod_blocks.pb1.deleted_at = '2026-01-01T00:00:00Z';
    expect(unitsOf(d, 'ps1').map((u) => u.lead.id)).toEqual(['pb2', 'pb3']);
  });
});
