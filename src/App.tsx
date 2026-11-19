import { useEffect, useState } from 'react';
import { useStore } from './store';
import { CalendarView } from './components/CalendarView';
import { NowNext } from './components/NowNext';
import { ModalHost } from './components/Modals';
import { ClassesPanel, PlacesPanel, RoutinesPanel, TasksPanel } from './components/Panels';
import { academicWeekFor, weekLabelText } from './lib/weeks';
import { ReplanButton } from './components/ReplanButton';
import { SyncBadge } from './components/SyncBadge';

type Tab = 'calendar' | 'tasks' | 'classes' | 'routines' | 'places';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Day', icon: '🗓' },
  { id: 'tasks', label: 'Tasks', icon: '📝' },
  { id: 'classes', label: 'Classes', icon: '🎓' },
  { id: 'routines', label: 'Routines', icon: '🕐' },
  { id: 'places', label: 'Places', icon: '📍' },
];

const SIDEBAR_MIN = 260;
const SIDEBAR_MAX = 600;
const readPref = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
};
const writePref = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** Sidebar width (drag the edge) and open/closed state, remembered per browser. */
function useSidebar() {
  const [width, setWidth] = useState(() => readPref('kairos:sidebarWidth', 360));
  const [open, setOpen] = useState(() => readPref('kairos:sidebarOpen', true));
  useEffect(() => writePref('kairos:sidebarWidth', width), [width]);
  useEffect(() => writePref('kairos:sidebarOpen', open), [open]);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { width, setWidth, open, setOpen, startDrag };
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return narrow;
}

export default function App() {
  const { past, future, undo, redo, refresh, data } = useStore();
  const [tab, setTab] = useState<Tab>('tasks');
  const [mobileTab, setMobileTab] = useState<Tab>('calendar');
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const narrow = useNarrow();
  const sb = useSidebar();
  // Let the calendar re-measure when the sidebar is resized or hidden.
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [sb.width, sb.open]);

  // Keyboard undo/redo (not while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  // Missed tasks roll forward every few minutes.
  useEffect(() => {
    const t = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const wk = range ? academicWeekFor(data.semesters, new Date((range.start.getTime() + range.end.getTime()) / 2)) : null;
  const panel = (t: Tab) => ({ tasks: <TasksPanel />, classes: <ClassesPanel />, routines: <RoutinesPanel />, places: <PlacesPanel />, calendar: null }[t]);

  return (
    <div className={`app ${narrow ? 'narrow' : ''}`}>
      <header className="topbar">
        {!narrow && (
          <button className="icon-btn" onClick={() => sb.setOpen(!sb.open)} aria-label={sb.open ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sb.open} title={sb.open ? 'Hide sidebar' : 'Show sidebar'}>☰</button>
        )}
        <div className="brand"><img src="/icon.svg" alt="" width={24} height={24} /> Kairos</div>
        {wk && <span className="tag neutral" title={wk.sem.name}>{weekLabelText(wk.label)}</span>}
        <span className="spacer" />
        <SyncBadge />
        <ReplanButton />
        <button className="icon-btn" onClick={undo} disabled={!past.length} title={past.length ? `Undo: ${past[past.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'} aria-label="Undo">↶<sup>{past.length || ''}</sup></button>
        <button className="icon-btn" onClick={redo} disabled={!future.length} title={future.length ? `Redo: ${future[0].label} (Ctrl+Y)` : 'Nothing to redo'} aria-label="Redo">↷<sup>{future.length || ''}</sup></button>
      </header>

      {narrow ? (
        <main className="mobile-main">
          {mobileTab === 'calendar' ? (
            <>
              <NowNext />
              <CalendarView range={range} onRange={setRange} />
            </>
          ) : panel(mobileTab)}
          <nav className="bottom-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={mobileTab === t.id ? 'on' : ''} onClick={() => setMobileTab(t.id)}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
        </main>
      ) : (
        <main className="desktop-main" style={{ gridTemplateColumns: sb.open ? `${sb.width}px 6px 1fr` : '1fr' }}>
          {sb.open && <aside className="sidebar">
            <NowNext />
            <nav className="side-tabs">
              {TABS.filter((t) => t.id !== 'calendar').map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.icon} {t.label}</button>
              ))}
            </nav>
            <div className="side-panel">{panel(tab)}</div>
          </aside>}
          {sb.open && (
            <div className="resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabIndex={0}
              aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={sb.width}
              onPointerDown={sb.startDrag} onDoubleClick={() => sb.setWidth(360)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') sb.setWidth(Math.max(SIDEBAR_MIN, sb.width - 20));
                if (e.key === 'ArrowRight') sb.setWidth(Math.min(SIDEBAR_MAX, sb.width + 20));
              }} title="Drag to resize · double-click to reset" />
          )}
          <CalendarView range={range} onRange={setRange} />
        </main>
      )}
      <ModalHost />
    </div>
  );
}
