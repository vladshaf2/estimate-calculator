// Production board helpers: ordered children, stats, link previews, CSV export.
import type { ProdBlock, ProdMedia, ProdRevision, ProdScene, ProdStatus, ProdVersion, Snapshot } from '../data/types';

export const STATUS_COLOR: Record<ProdStatus, string> = { todo: '#ef6464', progress: '#e9b54a', review: '#a78bfa', done: '#58c493' };
/** Next status when clicking the status pill. */
export const NEXT_STATUS: Record<ProdStatus, ProdStatus> = { todo: 'progress', progress: 'review', review: 'done', done: 'todo' };

const byPos = <T extends { position: number; created_at?: string }>(a: T, b: T) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at));

export function scenesOf(db: Snapshot, projectId: string, deleted = false): ProdScene[] {
  return Object.values(db.prod_scenes).filter((s) => s.project_id === projectId && !!s.deleted_at === deleted).sort(byPos);
}
/** Live blocks of a scene (or of the whole project), skipping blocks whose scene is deleted. */
export function blocksOf(db: Snapshot, sceneId: string): ProdBlock[] {
  return Object.values(db.prod_blocks).filter((b) => b.scene_id === sceneId && !b.deleted_at).sort(byPos);
}
export function projectBlocks(db: Snapshot, projectId: string): ProdBlock[] {
  return Object.values(db.prod_blocks).filter((b) => b.project_id === projectId && !b.deleted_at && db.prod_scenes[b.scene_id] && !db.prod_scenes[b.scene_id].deleted_at);
}
export function versionsOf(db: Snapshot, blockId: string): ProdVersion[] {
  return Object.values(db.prod_versions).filter((v) => v.block_id === blockId).sort((a, b) => a.number - b.number);
}
export function mediaOf(db: Snapshot, versionId: string): ProdMedia[] {
  return Object.values(db.prod_media).filter((m) => m.version_id === versionId && !m.deleted_at).sort(byPos);
}
export function revisionsOf(db: Snapshot, versionId: string): ProdRevision[] {
  return Object.values(db.prod_revisions).filter((r) => r.version_id === versionId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

/** A row on the board: one block, or several merged blocks (generated with one prompt). The lead holds status, versions and revisions. */
export interface Unit { lead: ProdBlock; members: ProdBlock[] }

export function unitsOf(db: Snapshot, sceneId: string): Unit[] {
  const blocks = blocksOf(db, sceneId);
  const live = new Map(blocks.map((b) => [b.id, b]));
  const units = new Map<string, Unit>();
  for (const b of blocks) {
    const lead = b.group_id && live.get(b.group_id)?.group_id === b.group_id ? b.group_id : b.id;
    let u = units.get(lead);
    if (!u) { u = { lead: live.get(lead)!, members: [] }; units.set(lead, u); }
    u.members.push(b);
  }
  return Array.from(units.values()).sort((a, b) => byPos(a.lead, b.lead));
}

/** "1.2" labels by position among the scene's live blocks. */
export function blockLabels(db: Snapshot, sceneId: string, sceneNo: number): Record<string, string> {
  const out: Record<string, string> = {};
  blocksOf(db, sceneId).forEach((b, i) => (out[b.id] = `${sceneNo}.${i + 1}`));
  return out;
}

export interface ProdStats { scenes: number; blocks: number; generations: number; byStatus: Record<ProdStatus, number>; openRevisions: number }
/** Merged blocks count as one. */
export function projectStats(db: Snapshot, projectId: string): ProdStats {
  const scenes = scenesOf(db, projectId);
  const units = scenes.flatMap((s) => unitsOf(db, s.id));
  const live = new Set(projectBlocks(db, projectId).map((b) => b.id));
  const versions = Object.values(db.prod_versions).filter((v) => live.has(v.block_id));
  const vids = new Set(versions.map((v) => v.id));
  const byStatus: Record<ProdStatus, number> = { todo: 0, progress: 0, review: 0, done: 0 };
  units.forEach((u) => byStatus[u.lead.status]++);
  return {
    scenes: scenes.length,
    blocks: units.length,
    generations: Object.values(db.prod_media).filter((m) => !m.deleted_at && vids.has(m.version_id)).length,
    byStatus,
    openRevisions: Object.values(db.prod_revisions).filter((r) => !r.done && vids.has(r.version_id)).length,
  };
}

/** Position for a new item appended after the given list. */
export const nextPos = (items: { position: number }[]) => (items.length ? Math.max(...items.map((x) => x.position)) + 1 : 0);

export type LinkInfo = { kind: 'drive'; id: string; embed: string } | { kind: 'youtube'; id: string; embed: string; thumb: string } | { kind: 'image' | 'video' } | { kind: 'other'; host: string };
export function linkInfo(url: string): LinkInfo {
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'other', host: '' }; }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const id = /\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] || u.searchParams.get('id');
    if (id) return { kind: 'drive', id, embed: `https://drive.google.com/file/d/${id}/preview` };
  }
  const yt = host === 'youtu.be' ? u.pathname.slice(1) : /youtube\.com$/.test(host) ? (u.searchParams.get('v') || /\/(?:shorts|embed)\/([\w-]+)/.exec(u.pathname)?.[1] || '') : '';
  if (yt && /^[\w-]{6,}$/.test(yt)) return { kind: 'youtube', id: yt, embed: `https://www.youtube.com/embed/${yt}`, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname)) return { kind: 'image' };
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: 'video' };
  return { kind: 'other', host };
}

export function mediaKindOf(mime: string): 'image' | 'video' | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

/** Spreadsheet-friendly CSV (semicolon, BOM) of all blocks. */
export function exportCsv(db: Snapshot, projectId: string, statusName: (s: ProdStatus) => string, head: string[]): string {
  const q = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [head.map(q).join(';')];
  scenesOf(db, projectId).forEach((s, si) => {
    const labels = blockLabels(db, s.id, si + 1);
    unitsOf(db, s.id).forEach(({ lead, members }) => {
      const vs = versionsOf(db, lead.id);
      const gens = vs.reduce((n, v) => n + mediaOf(db, v.id).length, 0);
      const open = vs.reduce((n, v) => n + revisionsOf(db, v.id).filter((r) => !r.done).length, 0);
      rows.push([`${si + 1}`, s.title, members.map((b) => labels[b.id]).join(' + '), members.map((b) => b.text).join('\n'), statusName(lead.status), vs.length, gens, open, lead.ai_note].map(q).join(';'));
    });
  });
  return '﻿' + rows.join('\r\n');
}
