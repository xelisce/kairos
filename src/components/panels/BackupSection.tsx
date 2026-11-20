import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';

/** Export / import a JSON copy, and restore automatic database backups. */
export function BackupSection() {
  const data = useStore((s) => s.data);
  const replaceAll = useStore((s) => s.replaceAll);
  const [showBackups, setShowBackups] = useState(false);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `kairos-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      replaceAll(JSON.parse(await file.text()), 'Import backup');
    } catch {
      alert('That file is not a Kairos backup.');
    }
  };

  return (
    <>
      <h3>Backup</h3>
      <p className="muted small">
        Everything is saved in a local database on this computer (<code>data/kairos.db</code> in the project folder),
        with an automatic backup at most once an hour. Cloud sync comes in v3.
      </p>
      <div className="panel-actions">
        <button className="btn" onClick={exportFile}>
          Export
        </button>
        <label className="btn">
          Import
          <input type="file" accept="application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        </label>
        <button className="btn" onClick={() => setShowBackups(!showBackups)}>
          {showBackups ? 'Hide' : 'Database'} backups
        </button>
      </div>
      {showBackups && <DatabaseBackups />}
    </>
  );
}

interface BackupInfo {
  id: number;
  created_at: string;
  size: number;
}

/** Automatic database backups (hourly), restorable with one click (undoable). */
function DatabaseBackups() {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState('');
  const replaceAll = useStore((s) => s.replaceAll);

  useEffect(() => {
    fetch('/api/backups')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setList)
      .catch(() => setError("The database server isn't running."));
  }, []);

  const restore = async (id: number) => {
    if (!confirm('Restore this backup? You can undo it with Ctrl+Z.')) return;
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
            <span className="muted small">({Math.round(b.size / 1024)} KB)</span>
          </span>
          <button className="chip" onClick={() => restore(b.id)}>
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
