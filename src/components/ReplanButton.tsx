import { useEffect, useRef, useState } from 'react';
import { replan, REPLAN_LABELS, resetRoutines, RESET_LABELS, type ReplanScope } from '../lib/actions';

const SCOPES: ReplanScope[] = ['today', 'week', 'future', 'all'];

const REPLAN_HELP =
  'Re-finds slots for auto-scheduled tasks. Routines keep any length you changed; ' +
  'routines you moved stay pinned (use Reset to free them). Classes, events, CCAs and tasks you dragged stay put. Undo with Ctrl+Z.';
const RESET_HELP =
  'Puts routines (meals, shower…) back to their usual length and lets them auto-schedule again, ' +
  'undoing lengths you changed and moves you made. Undo with Ctrl+Z.';

/** A button for "today" plus a ▾ menu for this week / all future / all time. */
function ScopeButton({ icon, labels, help, run, menuLabel }: {
  icon: string; labels: Record<ReplanScope, string>; help: string; run: (s: ReplanScope) => void; menuLabel: string;
}) {
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
  const go = (s: ReplanScope) => { run(s); setOpen(false); };
  return (
    <div className="split" ref={ref}>
      <button className="btn split-main" onClick={() => go('today')} title={help}>{icon} {labels.today}</button>
      <button className="btn split-arrow" aria-label={menuLabel} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <div className="menu" role="menu">
          {SCOPES.map((s) => <button key={s} role="menuitem" onClick={() => go(s)}>{labels[s]}</button>)}
          <p className="menu-help">{help}</p>
        </div>
      )}
    </div>
  );
}

export function ReplanButton() {
  return <ScopeButton icon="↻" labels={REPLAN_LABELS} help={REPLAN_HELP} run={(s) => replan(s)} menuLabel="More re-plan options" />;
}

export function ResetButton() {
  return <ScopeButton icon="⟲" labels={RESET_LABELS} help={RESET_HELP} run={(s) => resetRoutines(s)} menuLabel="More reset options" />;
}
