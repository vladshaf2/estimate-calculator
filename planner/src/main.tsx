import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { I18nProvider } from './i18n';
import { App } from './components/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
