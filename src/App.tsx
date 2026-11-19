import { useEffect, useState } from 'react';
import { useStore } from './store';
import { CalendarView } from './components/CalendarView';
import { NowNext } from './components/NowNext';
import { ModalHost } from './components/Modals';
import { ClassesPanel, PlacesPanel, RoutinesPanel, TasksPanel } from './components/Panels';
import { academicWeekFor, weekLabelText } from './lib/weeks';

type Tab = 'calendar' | 'tasks' | 'classes' | 'routines' | 'places';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Day', icon: '🗓' },
  { id: 'tasks', label: 'Tasks', icon: '📝' },
  { id: 'classes', label: 'Classes', icon: '🎓' },
  { id: 'routines', label: 'Routines', icon: '🍽' },
  { id: 'places', label: 'Places', icon: '📍' },
];

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
  const { past, future, undo, redo, commit, refresh, data } = useStore();
  const [tab, setTab] = useState<Tab>('tasks');
  const [mobileTab, setMobileTab] = useState<Tab>('calendar');
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const narrow = useNarrow();

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
        <div className="brand"><img src="/icon.svg" alt="" width={24} height={24} /> Kairos</div>
        {wk && <span className="tag neutral" title={wk.sem.name}>{weekLabelText(wk.label)}</span>}
        <span className="spacer" />
        <button className="btn" onClick={() => commit('Re-plan tasks', () => {}, { replanFromScratch: true })} title="Re-fit all auto-scheduled tasks from scratch">↻ Re-plan</button>
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
        <main className="desktop-main">
          <aside className="sidebar">
            <NowNext />
            <nav className="side-tabs">
              {TABS.filter((t) => t.id !== 'calendar').map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.icon} {t.label}</button>
              ))}
            </nav>
            <div className="side-panel">{panel(tab)}</div>
          </aside>
          <CalendarView range={range} onRange={setRange} />
        </main>
      )}
      <ModalHost />
    </div>
  );
}
