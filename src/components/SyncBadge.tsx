import { supabase, useAccount } from '../lib/cloud';
import { useSync } from '../lib/sync';
import { KEPT_HERE } from '../lib/native';
import { useUI } from './ui';

const LOCAL = {
  connecting: { label: 'Connecting…', tip: 'Looking for the local database' },
  saving: { label: 'Saving…', tip: 'Saving to the local database' },
  saved: { label: 'Saved', tip: 'Saved in the local database on this computer (data/kairos.db)' },
  offline: {
    label: 'Not saved to database',
    tip: 'The database server isn\'t running. Changes are kept in this browser and saved to the database when it\'s back. Start it with "npm run dev".',
  },
  signedout: {
    label: 'Not signed in',
    tip: `Changes are only kept ${KEPT_HERE}. Sign in to save them to your account`,
  },
} as const;

const CLOUD = {
  connecting: { label: 'Connecting…', tip: 'Connecting to your cloud account' },
  saving: { label: 'Saving…', tip: 'Saving to the cloud' },
  saved: { label: 'Synced', tip: 'Saved in the cloud: your other devices see the same' },
  offline: {
    label: 'Offline',
    tip: `Can't reach the cloud. Changes are kept ${KEPT_HERE} and saved once you're back online`,
  },
  signedout: LOCAL.signedout,
} as const;

/** Small status pill in the top bar: is everything saved, and where? Click it to sign in or out. */
export function SyncBadge() {
  const { status, detail, cloud } = useSync();
  const account = useAccount((s) => s.account);
  const open = useUI((s) => s.open);
  const t = (cloud ? CLOUD : LOCAL)[status];
  const tip = [
    detail ? `${t.tip}. ${detail}` : t.tip,
    account ? `Signed in as ${account.email}` : supabase && 'Click to sign in and sync your devices',
  ]
    .filter(Boolean)
    .join('. ');
  const badge = (
    <>
      <span className="sync-dot" aria-hidden="true" />
      {cloud && <span aria-hidden="true">☁️</span>}
      {t.label}
    </>
  );
  if (!supabase)
    return (
      <span className={`sync sync-${status}`} title={tip} role="status" aria-live="polite">
        {badge}
      </span>
    );
  return (
    <>
      <button
        className={`sync sync-${status} sync-btn`}
        title={tip}
        aria-live="polite"
        onClick={() => open({ kind: 'account' })}
      >
        {badge}
      </button>
      {!account && (
        <button className="btn small sign-in-btn" onClick={() => open({ kind: 'account' })}>
          Sign in
        </button>
      )}
    </>
  );
}
