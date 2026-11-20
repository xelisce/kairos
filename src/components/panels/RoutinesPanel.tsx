import { useStore } from '../../store';
import type { Routine } from '../../types';
import { fmtDur } from '../../lib/time';
import { US_DAY_LETTERS } from '../../lib/weeks';
import { useUI } from '../ui';

function summary(r: Routine) {
  const days = r.days.length === 7 ? 'daily' : r.days.map((d) => US_DAY_LETTERS[d]).join('');
  const nextDay = r.windowEnd < r.windowStart ? ' (next day)' : '';
  const timing = r.flexible ? `auto ${r.windowStart}–${r.windowEnd}${nextDay}` : 'fixed';
  return [r.preferredStart, fmtDur(r.durationMin), days, timing, !r.enabled && 'paused'].filter(Boolean).join(' · ');
}

export function RoutinesPanel() {
  const routines = useStore((s) => s.data.routines);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);

  const toggle = (r: Routine) =>
    commit(`${r.enabled ? 'Pause' : 'Turn on'} ${r.title}`, (d) => {
      const x = d.routines.find((y) => y.id === r.id);
      if (x) x.enabled = !x.enabled;
    });

  return (
    <div className="panel">
      <div className="panel-actions">
        <button className="btn primary" onClick={() => open({ kind: 'routine' })}>
          + Routine
        </button>
      </div>
      <p className="muted small">
        The switch turns a routine on or off (off = paused, not deleted). <b>Auto</b> routines find a free time inside
        their window around classes and CCAs; <b>fixed</b> ones stay at their usual time. Drag one on the calendar to
        move it for that day only.
      </p>
      <ul className="routines">
        {routines.map((r) => (
          <li key={r.id} className={r.enabled ? '' : 'off'} style={{ borderLeftColor: r.color }}>
            <label
              className="switch"
              title={
                r.enabled
                  ? 'On: shown on the calendar. Click to pause.'
                  : 'Paused: not on the calendar. Click to turn on.'
              }
            >
              <input
                type="checkbox"
                role="switch"
                checked={r.enabled}
                aria-label={`${r.title} on`}
                onChange={() => toggle(r)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <button className="task-main" onClick={() => open({ kind: 'routine', id: r.id })}>
              <span className="task-title">{r.title}</span>
              <span className="task-meta">{summary(r)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
