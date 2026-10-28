import { useEffect, useMemo, useState } from 'react';
import type { Backend } from '../data/backend';
import { createDemoBackend } from '../data/demoBackend';
import { createSupabaseBackend } from '../data/supabaseBackend';
import { StoreProvider, useStore } from '../data/store';
import { useI18n } from '../i18n';
import { Login } from './Login';
import { SharePage } from './SharePage';
import { Shell } from './Shell';
import { ThemeCtx, useTheme } from '../lib/theme';

function makeBackend(): Backend {
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) return createDemoBackend(q.get('as') === 'igor' ? 'demo_igor' : 'demo_vlad');
  return createSupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);
}

export function App() {
  const backend = useMemo(makeBackend, []);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const { t } = useI18n();
  const theme = useTheme();

  useEffect(() => {
    backend.getSessionEmail().then(setEmail);
    return backend.onAuthChange(setEmail);
  }, [backend]);

  // Public client page of a production board: no sign-in.
  const shareToken = /^#\/share\/([0-9a-f]{32})$/.exec(location.hash)?.[1];
  if (shareToken) return <ThemeCtx.Provider value={theme}><SharePage token={shareToken} /></ThemeCtx.Provider>;

  return (
    <ThemeCtx.Provider value={theme}>
      {email === undefined ? <div className="center muted">{t('common.loading')}</div>
        : !email ? <Login backend={backend} />
        : <StoreProvider backend={backend} email={email}><Gate /></StoreProvider>}
    </ThemeCtx.Provider>
  );
}

/** Signed in but not a team member → the database returns nothing; say so clearly. */
function Gate() {
  const { loaded, me, email, backend, db } = useStore();
  const { t } = useI18n();
  if (!me && !loaded && !Object.keys(db.members).length) return <div className="center muted">{t('common.loading')}</div>;
  if (!me) {
    return (
      <div className="center">
        <div className="login">
          <div className="logo-mark" />
          <h1>{t('noaccess.title')}</h1>
          <p className="muted">{t('noaccess.text', { email })}</p>
          <button className="btn" onClick={() => backend.signOut()}>{t('set.signOut')}</button>
        </div>
      </div>
    );
  }
  return <Shell />;
}
