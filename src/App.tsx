import { useEffect, useState } from 'react';
import { useStore } from './store';
import { CalendarView } from './components/CalendarView';
import { Taskline } from './components/Taskline';
import { usePref } from './hooks/usePref';
import { NowNext } from './components/NowNext';
import { ModalHost } from './components/dialogs/ModalHost';
import { ClassesPanel } from './components/panels/ClassesPanel';
import { PlacesPanel } from './components/panels/PlacesPanel';
import { RoutinesPanel } from './components/panels/RoutinesPanel';
import { SettingsPanel } from './components/panels/SettingsPanel';
import { TasksPanel } from './components/panels/TasksPanel';
import { academicWeekFor, weekLabelText } from './lib/weeks';
import { ReplanButton, ResetButton } from './components/ReplanButton';
import { SyncBadge } from './components/SyncBadge';
import { useNarrow } from './hooks/useNarrow';
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, useSidebar } from './hooks/useSidebar';
import { useUndoShortcuts } from './hooks/useUndoShortcuts';
import { displayOf } from './lib/display';

type Tab = 'calendar' | 'tasks' | 'classes' | 'routines' | 'places' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Day', icon: '🗓' },
  { id: 'tasks', label: 'Tasks', icon: '📝' },
  { id: 'classes', label: 'Classes', icon: '🎓' },
  { id: 'routines', label: 'Routines', icon: '🕐' },
  { id: 'places', label: 'Places', icon: '📍' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const { past, future, undo, redo, refresh, data } = useStore();
  const [tab, setTab] = useState<Tab>('tasks');
  const [mobileTab, setMobileTab] = useState<Tab>('calendar');
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [{ view }, setView] = usePref<{ view: 'calendar' | 'taskline' }>('kairos:view', { view: 'calendar' });
  const main = view === 'taskline' ? <Taskline /> : <CalendarView range={range} onRange={setRange} />;
  const narrow = useNarrow();
  const sb = useSidebar();
  // Let the calendar re-measure when the sidebar is resized or hidden.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [sb.width, sb.open]);

  // How faded skipped sessions are (Settings > Display).
  const skippedOpacity = displayOf(data.settings).skippedOpacity;
  useEffect(() => {
    document.documentElement.style.setProperty('--skipped-opacity', String(skippedOpacity));
  }, [skippedOpacity]);

  useUndoShortcuts(undo, redo);

  // Missed tasks roll forward every few minutes.
  useEffect(() => {
    const t = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const wk = range
    ? academicWeekFor(data.semesters, new Date((range.start.getTime() + range.end.getTime()) / 2))
    : null;
  const panel = (t: Tab) =>
    ({
      tasks: <TasksPanel />,
      classes: <ClassesPanel />,
      routines: <RoutinesPanel />,
      places: <PlacesPanel />,
      settings: <SettingsPanel />,
      calendar: null,
    })[t];

  return (
    <div className={`app ${narrow ? 'narrow' : ''}`}>
      <header className="topbar">
        {!narrow && (
          <button
            className="icon-btn"
            onClick={() => sb.setOpen(!sb.open)}
            aria-label={sb.open ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={sb.open}
            title={sb.open ? 'Hide sidebar' : 'Show sidebar'}
          >
            ☰
          </button>
        )}
        <div className="brand">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span className="label">Kairos</span>
        </div>
        <div className="segmented view-switch" role="group" aria-label="View">
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView({ view: 'calendar' })}>
            🗓<span className="label"> Calendar</span>
          </button>
          <button className={view === 'taskline' ? 'on' : ''} onClick={() => setView({ view: 'taskline' })}>
            📊<span className="label"> Taskline</span>
          </button>
        </div>
        {wk && view === 'calendar' && (
          <span className="tag neutral week-tag" title={wk.sem.name}>
            {weekLabelText(wk.label)}
          </span>
        )}
        <span className="spacer" />
        <SyncBadge />
        <ReplanButton />
        <ResetButton />
        <button
          className="icon-btn"
          onClick={undo}
          disabled={!past.length}
          title={past.length ? `Undo: ${past[past.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'}
          aria-label="Undo"
        >
          ↶<sup>{past.length || ''}</sup>
        </button>
        <button
          className="icon-btn"
          onClick={redo}
          disabled={!future.length}
          title={future.length ? `Redo: ${future[0].label} (Ctrl+Y)` : 'Nothing to redo'}
          aria-label="Redo"
        >
          ↷<sup>{future.length || ''}</sup>
        </button>
      </header>

      {narrow ? (
        <main className="mobile-main">
          {mobileTab === 'calendar' ? (
            <>
              {view === 'calendar' && <NowNext />}
              {main}
            </>
          ) : (
            panel(mobileTab)
          )}
          <nav className="bottom-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={mobileTab === t.id ? 'on' : ''} onClick={() => setMobileTab(t.id)}>
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </main>
      ) : (
        <main className="desktop-main" style={{ gridTemplateColumns: sb.open ? `${sb.width}px 6px 1fr` : '1fr' }}>
          {sb.open && (
            <aside className="sidebar">
              <NowNext />
              <nav className="side-tabs">
                {TABS.filter((t) => t.id !== 'calendar').map((t) => (
                  <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </nav>
              <div className="side-panel">{panel(tab)}</div>
            </aside>
          )}
          {sb.open && (
            <div
              className="resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              tabIndex={0}
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={sb.width}
              onPointerDown={sb.startDrag}
              onDoubleClick={() => sb.setWidth(SIDEBAR_DEFAULT)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') sb.setWidth(sb.width - 20);
                if (e.key === 'ArrowRight') sb.setWidth(sb.width + 20);
              }}
              title="Drag to resize · double-click to reset"
            />
          )}
          {main}
        </main>
      )}
      <ModalHost />
    </div>
  );
}
