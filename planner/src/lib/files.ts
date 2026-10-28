// Files of the production board: short-lived URLs (cached and batched) and uploads with a preview frame.
import { useSyncExternalStore } from 'react';
import type { FilesApi } from '../data/backend';

const cache = new Map<string, { url: string; exp: number }>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let timer = 0;
let version = 0;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;
let api: FilesApi | null = null;
const TTL = 5 * 3600 * 1000; // URLs are signed for 6 h; refresh after 5 h

export function setFilesApi(a: FilesApi) { api = a; }

function request(path: string) {
  waiting.add(path);
  if (timer) return;
  timer = window.setTimeout(async () => {
    timer = 0;
    const paths = Array.from(waiting);
    waiting.clear();
    if (!api || !paths.length) return;
    try {
      const urls = await api.urls(paths);
      const exp = Date.now() + TTL;
      for (const p of paths) cache.set(p, { url: urls[p] || '', exp });
    } catch { /* keep missing; a later render retries */ }
    version++;
    listeners.forEach((l) => l());
  }, 0);
}

/** URL for a stored file (or '' while loading). `fallback` (a plain URL) is returned when there is no path. */
export function useFileUrl(path: string | null | undefined, fallback?: string | null): string {
  useSyncExternalStore(subscribe, getVersion);
  if (!path) return fallback || '';
  const hit = cache.get(path);
  if (!hit || hit.exp < Date.now()) { if (!waiting.has(path)) request(path); return hit?.url || ''; }
  return hit.url;
}

export function forgetFiles(paths: string[]) { paths.forEach((p) => cache.delete(p)); }

export const MAX_UPLOAD = 50 * 1024 * 1024;

function canvasJpeg(source: CanvasImageSource, w: number, h: number, max = 640): Promise<Blob | null> {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.82));
}

/** Small JPEG preview: a downscaled image, or a frame ~0.5 s into a video. Null when the browser can't decode it. */
export function makeThumb(file: Blob, kind: 'image' | 'video'): Promise<Blob | null> {
  const src = URL.createObjectURL(file);
  const done = (b: Blob | null) => { URL.revokeObjectURL(src); return b; };
  return new Promise<Blob | null>((resolve) => {
    const fail = () => resolve(done(null));
    const timeout = window.setTimeout(fail, 15000);
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => { window.clearTimeout(timeout); canvasJpeg(img, img.naturalWidth, img.naturalHeight).then((b) => resolve(done(b)), fail); };
      img.onerror = () => { window.clearTimeout(timeout); fail(); };
      img.src = src;
    } else {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
      v.onseeked = () => { window.clearTimeout(timeout); canvasJpeg(v, v.videoWidth, v.videoHeight).then((b) => resolve(done(b)), fail); };
      v.onerror = () => { window.clearTimeout(timeout); fail(); };
      v.src = src;
    }
  });
}

export function extOf(name: string, mime: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  return mime.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
}
