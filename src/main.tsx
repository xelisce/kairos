import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { hasLocalDb, startSync } from './lib/sync';
import { applyTheme, savedTheme } from './lib/theme';

applyTheme(savedTheme());
startSync();

// Online, keep the app's files so it opens without a connection (see public/sw.js). Not on this
// computer: the dev server reloads files itself, and a saved copy would only get in the way.
if ('serviceWorker' in navigator && import.meta.env.PROD && !hasLocalDb) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
