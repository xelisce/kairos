import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { hasLocalDb, startSync } from './lib/sync';
import { isNativeApp } from './lib/native';
import { applyTheme, savedTheme } from './lib/theme';

applyTheme(savedTheme());
startSync();

// Online, keep the app's files so it opens without a connection (see public/sw.js). Not on this
// computer: the dev server reloads files itself, and a saved copy would only get in the way. Not in
// the Android app either: its files are already on the phone.
if ('serviceWorker' in navigator && import.meta.env.PROD && !hasLocalDb && !isNativeApp) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
