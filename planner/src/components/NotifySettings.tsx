import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { NOTIFY_KINDS, type NotifyKind } from '../data/types';
import { useI18n, type TKey } from '../i18n';
import { disablePush, enablePush, pushStatus, type PushStatus } from '../lib/push';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Settings card: turn push on for this device, choose what to hear about, quiet hours. */
export function NotifySettings() {
  const { backend, me, update, toast } = useStore();
  const { t } = useI18n();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const api = backend.push;

  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus('unsupported')); }, []);
  if (!me) return null;

  const run = async (fn: () => Promise<PushStatus | void>) => {
    setBusy(true);
    try { const s = await fn(); if (s) setStatus(s); } catch (e) { toast(t('notify.error') + ': ' + String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const on = (k: NotifyKind) => me.notify?.[k] !== false;
  const setKind = (k: NotifyKind, v: boolean) => update('members', me.id, { notify: { ...me.notify, [k]: v } });
  const quiet = me.quiet_from != null && me.quiet_to != null;

  return (
    <section className="card-s" data-notify>
      <h2>{t('notify.title')}</h2>
      {!api ? <p className="muted" style={{ marginTop: 0 }}>{t('notify.demo')}</p> : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <span className={'chip' + (status === 'on' ? ' on' : '')} data-push-status={status || ''}>{status ? t(('notify.status.' + status) as TKey) : '…'}</span>
            {(status === 'off' || status === 'on') && (status === 'off'
              ? <button className="btn primary sm" disabled={busy} onClick={() => run(() => enablePush(api))} data-push-enable>{t('notify.enable')}</button>
              : <>
                  <button className="btn sm" disabled={busy} onClick={() => run(async () => { await api.test(); toast(t('notify.testSent')); })} data-push-test>{t('notify.test')}</button>
                  <button className="btn ghost sm" disabled={busy} onClick={() => run(disablePush)}>{t('notify.disable')}</button>
                </>)}
          </div>
          {status === 'needs-install' && <p className="muted" style={{ fontSize: 12.5 }}>{t('notify.iosHint')}</p>}
          {status === 'denied' && <p className="muted" style={{ fontSize: 12.5 }}>{t('notify.deniedHint')}</p>}
          {status === 'unsupported' && <p className="muted" style={{ fontSize: 12.5 }}>{t('notify.unsupportedHint')}</p>}
        </>
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t('notify.perDevice')}</p>
      <div className="notify-kinds">
        {NOTIFY_KINDS.map((k) => (
          <label key={k} className="check-line">
            <input type="checkbox" checked={on(k)} onChange={(e) => setKind(k, e.target.checked)} data-notify-kind={k} />
            <span><b>{t(('notify.kind.' + k) as TKey)}</b> <span className="muted">— {t(('notify.when.' + k) as TKey)}</span></span>
          </label>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <label className="check-line" style={{ margin: 0 }}>
          <input type="checkbox" checked={quiet} onChange={(e) => update('members', me.id, e.target.checked ? { quiet_from: 22, quiet_to: 8 } : { quiet_from: null, quiet_to: null })} data-quiet />
          <span>{t('notify.quiet')}</span>
        </label>
        {quiet && (
          <>
            <select value={me.quiet_from ?? 22} onChange={(e) => update('members', me.id, { quiet_from: Number(e.target.value) })} style={{ width: 'auto' }} aria-label={t('notify.quietFrom')}>
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span className="muted">—</span>
            <select value={me.quiet_to ?? 8} onChange={(e) => update('members', me.id, { quiet_to: Number(e.target.value) })} style={{ width: 'auto' }} aria-label={t('notify.quietTo')}>
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12.5 }}>{t('tz.prague')}</span>
          </>
        )}
      </div>
    </section>
  );
}
