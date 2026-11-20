import { format } from 'date-fns';
import { fromLocal } from '../../lib/time';

/** Chips for skipped dates; clicking one un-skips it. */
export function SkippedDates({ dates, onUnskip }: { dates: string[]; onUnskip: (remaining: string[]) => void }) {
  if (!dates.length) return null;
  return (
    <div>
      <span className="field-label">Skipped dates (click to un-skip)</span>
      <div className="chips">
        {[...dates].sort().map((dk) => (
          <button key={dk} className="chip" title="Un-skip" onClick={() => onUnskip(dates.filter((x) => x !== dk))}>
            {format(fromLocal(dk), 'd MMM')} ✕
          </button>
        ))}
      </div>
    </div>
  );
}
