import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import { listCloudBackups, loadCloudBackup, useAccount } from '../../lib/cloud';
import { hasLocalDb } from '../../lib/sync';
import { isKairosData } from '../../lib/migrate';
import type { AppData } from '../../types';

/** Export / import a JSON copy, and restore automatic database backups. */
export function BackupSection() {
  const data = useStore((s) => s.data);
  const replaceAll = useStore((s) => s.replaceAll);
  const [showBackups, setShowBackups] = useState(false);
  const account = useAccount((s) => s.account);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kairos-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still works
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      raw = undefined;
    }
    if (!isKairosData(raw)) {
      alert('That file is not a Kairos backup. Nothing was changed.');
      return;
    }
    const tasks = raw.tasks?.length ?? 0;
    const events = raw.events?.length ?? 0;
    if (
      !confirm(`Replace everything with this backup (${tasks} tasks, ${events} events)? Undo brings back what you had.`)
    )
      return;
    replaceAll(raw as AppData, 'Import backup');
  };

  return (
    <>
      <h3>Backup</h3>
      <p className="muted small">
        {account ? (
          <>
            Everything is saved in your cloud account ({account.email}), with an automatic backup at most once an hour.
          </>
        ) : hasLocalDb ? (
          <>
            Everything is saved in a local database on this computer (<code>data/kairos.db</code> in the project
            folder), with an automatic backup at most once an hour. Sign in to save to the cloud instead.
          </>
        ) : (
          <>You're not signed in, so changes are only kept in this browser. Export a copy, or sign in.</>
        )}
      </p>
      <div className="panel-actions">
        <button className="btn" onClick={exportFile}>
          Export
        </button>
        <label className="btn">
          Import
          <input type="file" accept="application/json" hidden onChange={(e) => void importFile(e.target)} />
        </label>
        {(account || hasLocalDb) && (
          <button className="btn" onClick={() => setShowBackups(!showBackups)}>
            {showBackups ? 'Hide backups' : 'Automatic backups'}
          </button>
        )}
      </div>
      {showBackups && <DatabaseBackups key={account?.id ?? 'local'} cloud={!!account} />}
    </>
  );
}

interface BackupInfo {
  id: number;
  created_at: string;
  size?: number;
}

/** Automatic backups (hourly) in the cloud or the local database, restorable with one click (undoable). */
function DatabaseBackups({ cloud }: { cloud: boolean }) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState('');
  const replaceAll = useStore((s) => s.replaceAll);

  useEffect(() => {
    if (cloud) {
      listCloudBackups()
        .then(setList)
        .catch(() => setError("Can't reach the cloud right now."));
      return;
    }
    fetch('/api/backups')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setList)
      .catch(() => setError("The database server isn't running."));
  }, [cloud]);

  const restore = async (id: number) => {
    if (!confirm('Restore this backup? You can undo it with Ctrl+Z.')) return;
    if (cloud) {
      // Loading it is enough: the restored copy then saves like any other change.
      replaceAll(await loadCloudBackup(id), 'Restore backup');
      return;
    }
    const res = await fetch(`/api/backups/${id}/restore`, { method: 'POST' });
    if (res.ok) replaceAll((await res.json()).data, 'Restore database backup');
  };

  if (error) return <p className="muted small">{error}</p>;
  if (!list) return <p className="muted small">Loading…</p>;
  if (!list.length) {
    return <p className="muted small">No backups yet. The first one is made an hour after you start saving.</p>;
  }
  return (
    <ul className="routes">
      {list.map((b) => (
        <li key={b.id}>
          <span className="route-name">
            {format(new Date(b.created_at), 'EEE d MMM yyyy, HH:mm')}{' '}
            {b.size !== undefined && <span className="muted small">({Math.round(b.size / 1024)} KB)</span>}
          </span>
          <button className="chip" onClick={() => restore(b.id)}>
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
