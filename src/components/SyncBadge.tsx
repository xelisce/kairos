import { useSync } from '../lib/sync';

const TEXT = {
  connecting: { label: 'Connecting…', tip: 'Looking for the local database' },
  saving: { label: 'Saving…', tip: 'Saving to the local database' },
  saved: { label: 'Saved', tip: 'Saved in the local database on this computer (data/kairos.db)' },
  offline: { label: 'Not saved to database', tip: 'The database server isn\'t running. Changes are kept in this browser and saved to the database when it\'s back. Start it with "npm run dev".' },
} as const;

/** Small status pill in the top bar: is everything in the database? */
export function SyncBadge() {
  const { status, detail } = useSync();
  const t = TEXT[status];
  return (
    <span className={`sync sync-${status}`} title={detail ? `${t.tip}. ${detail}` : t.tip} role="status" aria-live="polite">
      <span className="sync-dot" aria-hidden="true" />{t.label}
    </span>
  );
}
