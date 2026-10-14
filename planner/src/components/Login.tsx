import { useState, type FormEvent } from 'react';
import type { Backend } from '../data/backend';
import { useI18n } from '../i18n';
import { LangSwitch } from './bits';

export function Login({ backend }: { backend: Backend }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(false); }
  }
  const send = (e: FormEvent) => { e.preventDefault(); run(async () => { await backend.sendCode(email.trim().toLowerCase()); setStep('code'); }); };
  const verify = (e: FormEvent) => { e.preventDefault(); run(() => backend.verifyCode(email.trim().toLowerCase(), code.trim())); };

  return (
    <div className="center">
      <div className="login">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="logo-mark" />
          <LangSwitch />
        </div>
        <h1>{t('login.title')}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{t('login.hint')}</p>
        {step === 'email' ? (
          <form onSubmit={send}>
            <label className="lbl" htmlFor="email">{t('login.email')}</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <button className="btn primary" style={{ width: '100%', marginTop: 12, height: 40 }} disabled={busy}>{busy ? t('login.wait') : t('login.send')}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted">{t('login.sent', { email })}</p>
            <label className="lbl" htmlFor="code">{t('login.code')}</label>
            <input id="code" type="text" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            <button className="btn primary" style={{ width: '100%', marginTop: 12, height: 40 }} disabled={busy || code.length < 6}>{busy ? t('login.wait') : t('login.verify')}</button>
            <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => { setStep('email'); setCode(''); setErr(''); }}>{t('login.back')}</button>
          </form>
        )}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
