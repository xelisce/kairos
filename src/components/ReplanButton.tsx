import { useEffect, useRef, useState } from 'react';
import { replan, REPLAN_LABELS, type ReplanScope } from '../lib/actions';

const HELP =
  'Puts meals/routines you moved back to auto-fit, and re-finds slots for auto-scheduled tasks. ' +
  "Classes, events, CCAs and tasks you dragged yourself stay put. Undo with Ctrl+Z.";

/** "Re-plan today" plus a dropdown for this week / all future / all time. */
export function ReplanButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  const run = (s: ReplanScope) => { replan(s); setOpen(false); };
  return (
    <div className="split" ref={ref}>
      <button className="btn split-main" onClick={() => run('today')} title={HELP}>↻ Re-plan today</button>
      <button className="btn split-arrow" aria-label="More re-plan options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <div className="menu" role="menu">
          {(['today', 'week', 'future', 'all'] as ReplanScope[]).map((s) => (
            <button key={s} role="menuitem" onClick={() => run(s)}>{REPLAN_LABELS[s]}</button>
          ))}
          <p className="menu-help">{HELP}</p>
        </div>
      )}
    </div>
  );
}
