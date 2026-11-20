import { format } from 'date-fns';
import { useStore } from '../../store';
import type { AppData, TrashItem } from '../../types';
import { purgeTrash, restoreDate, restoreTrash } from '../../lib/actions';
import { fromLocal } from '../../lib/time';
import { Parts } from './Parts';

const KIND_NAMES: Record<TrashItem['kind'], string> = {
  event: 'Event',
  task: 'Task',
  class: 'Class',
  routine: 'Routine',
  activity: 'CCA / activity',
};

/** Deleted single sessions of classes, routines and CCAs, newest date first. */
function deletedSessions(data: AppData) {
  const courseCode = (id: string) => data.modules.find((m) => m.id === id)?.code ?? '';
  return [
    ...data.classes.flatMap((c) =>
      (c.deletedDates ?? []).map((dk) => ({
        kind: 'class' as const,
        id: c.id,
        dk,
        label: `${courseCode(c.moduleId)} ${c.kind}`.trim(),
      })),
    ),
    ...data.routines.flatMap((r) =>
      (r.deletedDates ?? []).map((dk) => ({ kind: 'routine' as const, id: r.id, dk, label: r.title })),
    ),
    ...data.activities.flatMap((a) =>
      (a.deletedDates ?? []).map((dk) => ({ kind: 'activity' as const, id: a.id, dk, label: a.title })),
    ),
  ].sort((a, b) => b.dk.localeCompare(a.dk));
}

/** Everything you deleted: single sessions and whole items. Restore brings it back (also undoable). */
export function DeletedPanel() {
  const data = useStore((s) => s.data);
  const sessions = deletedSessions(data);
  const itemLabel = (t: TrashItem) => {
    if (t.kind === 'class') {
      const code = data.modules.find((m) => m.id === t.item.moduleId)?.code ?? '';
      return `${code} ${t.item.kind} (all sessions)`;
    }
    if (t.kind === 'event') return `${t.item.title} · ${format(fromLocal(t.item.start), 'EEE d MMM HH:mm')}`;
    return t.item.title;
  };
  const deleteForever = (t: TrashItem, index: number) => {
    if (confirm(`Delete "${itemLabel(t)}" forever? This can only be undone with Ctrl+Z right away.`)) purgeTrash(index);
  };

  return (
    <div className="panel">
      <p className="muted small">
        Things you deleted. <b>Restore</b> puts them back. Skipped sessions aren't here; they stay on the calendar,
        faded.
      </p>
      <h3>
        Single sessions <span className="count">{sessions.length}</span>
      </h3>
      {!sessions.length && <p className="muted small">None.</p>}
      <ul className="routes">
        {sessions.map((x) => (
          <li key={`${x.kind}:${x.id}:${x.dk}`}>
            <span className="route-name">
              <Parts items={[x.label, format(fromLocal(x.dk), 'EEE dd/MM/yyyy')]} />
            </span>
            <button className="chip" onClick={() => restoreDate(x.kind, x.id, x.dk, `${x.label} on ${x.dk}`)}>
              Restore
            </button>
          </li>
        ))}
      </ul>
      <h3>
        Whole items <span className="count">{data.trash.length}</span>
      </h3>
      {!data.trash.length && <p className="muted small">None.</p>}
      <ul className="routes">
        {data.trash.map((t, i) => (
          <li key={`${t.kind}:${t.item.id}:${t.deletedAt}`}>
            <span className="route-name">
              <Parts
                items={[itemLabel(t), KIND_NAMES[t.kind], `deleted ${format(fromLocal(t.deletedAt), 'dd/MM HH:mm')}`]}
              />
            </span>
            <button className="chip" onClick={() => restoreTrash(i)}>
              Restore
            </button>
            <button
              className="icon-btn"
              aria-label="Delete forever"
              title="Delete forever"
              onClick={() => deleteForever(t, i)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
