// Web Push on this device: permission, subscription, and what to tell the user when it can't work.
import type { PushApi } from '../data/backend';

export type PushStatus = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
}

export async function pushStatus(): Promise<PushStatus> {
  // iPhone: Web Push works only from the app added to the Home Screen (iOS 16.4+).
  if (isIos() && !standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush(api: PushApi): Promise<PushStatus> {
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off';
  const reg = (await registration()) || (await navigator.serviceWorker.register('./sw.js'));
  await navigator.serviceWorker.ready;
  const key = await api.publicKey();
  if (!key) throw new Error('push server is not ready');
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another key can't receive our messages.
  if (sub && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = keyBytes(key);
    if (cur.length !== want.length || cur.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api.save(sub.toJSON());
  return 'on';
}

/** Re-sends this device's subscription (browsers rotate them); cheap, called on start. */
export async function refreshPush(api: PushApi): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) await api.save(sub.toJSON());
}

export async function disablePush(): Promise<PushStatus> {
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  // The server drops the endpoint the next time it gets "gone" from the push service.
  if (sub) await sub.unsubscribe();
  return 'off';
}
