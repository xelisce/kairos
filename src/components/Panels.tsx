import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../store';
import { EVENT_ICONS } from '../lib/expand';
import { purgeTrash, restoreDate, restoreTrash } from '../lib/actions';
import type { AppData, Task } from '../types';
import { taskWarning } from '../lib/scheduler';
import { fmtDur, fromLocal, toLocal, uid } from '../lib/time';
import { formatDays, formatWeeks, SEMESTER_PRESETS, semesterFromPreset, weekLabelText, weekIndex } from '../lib/weeks';
import { Field, NumberInput, Row, useUI } from './ui';
import { useNow } from './NowNext';

// ---------- Tasks ----------

export function TasksPanel() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const now = useNow(60_000);
  const [quick, setQuick] = useState('');
  const [showDone, setShowDone] = useState(false);

  const add = () => {
    const title = quick.trim();
    if (!title) return;
    commit(`Add ${title}`, (d) => {
      d.tasks.push({ id: uid(), title, category: 'other', durationMin: 30, onCalendar: false, pinned: false, done: false, createdAt: toLocal(new Date()) });
    });
    setQuick('');
  };

  const open_ = data.tasks.filter((t) => !t.done);
  const byDeadline = (a: Task, b: Task) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
  const inbox = open_.filter((t) => !t.onCalendar).sort(byDeadline);
  const planned = open_.filter((t) => t.onCalendar).sort((a, b) => (a.scheduled?.start ?? '9999').localeCompare(b.scheduled?.start ?? '9999'));
  const done = data.tasks.filter((t) => t.done);

  const row = (t: Task) => {
    const w = taskWarning(t, now, data.settings.warnHours);
    const mod = data.modules.find((m) => m.id === t.moduleId);
    const act = !mod && t.activityId ? data.activities.find((a) => a.id === t.activityId) : undefined;
    return (
      <li key={t.id} className={`task ${w?.level ?? ''}`}>
        <input type="checkbox" aria-label="Done" checked={t.done} onChange={() => commit(t.done ? `Undone ${t.title}` : `Done ${t.title}`, (d) => {
          const x = d.tasks.find((y) => y.id === t.id); if (x) x.done = !x.done;
        })} />
        <button className="task-main" onClick={() => open({ kind: 'task', id: t.id })}>
          <span className="task-title">
            {w && <span title={w.text}>{w.level === 'bad' ? '❗' : '⚠️'} </span>}
            {mod && <span className="tag" style={{ background: mod.color }}>{mod.code}</span>}
            {act && <span className="tag" style={{ background: act.color }}>{act.title}</span>}
            {t.title}
          </span>
          <span className="task-meta">
            {fmtDur(t.durationMin)}
            {t.deadline && <> · due {format(fromLocal(t.deadline), 'EEE d MMM HH:mm')}</>}
            {t.scheduled && t.onCalendar && <> · 🗓 {format(fromLocal(t.scheduled.start), 'EEE HH:mm')}{t.pinned ? ' 📌' : ''}</>}
            {t.rolledForward && <> · moved forward</>}
            {w && <> · <span className={w.level}>{w.text}</span></>}
          </span>
        </button>
        <label className="cal-toggle" title="Put on calendar (auto-scheduled)">
          <input type="checkbox" checked={t.onCalendar} onChange={(e) => commit(e.target.checked ? `Schedule ${t.title}` : `Unschedule ${t.title}`, (d) => {
            const x = d.tasks.find((y) => y.id === t.id);
            if (x) { x.onCalendar = e.target.checked; x.pinned = false; }
          })} />
          <span>🗓</span>
        </label>
      </li>
    );
  };

  return (
    <div className="panel">
      <div className="quick">
        <input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Brain dump a task… (Enter)" aria-label="Quick add task" />
        <button className="btn primary" onClick={() => open({ kind: 'task' })}>+ Task</button>
      </div>
      <h3>Inbox <span className="count">{inbox.length}</span></h3>
      <p className="muted small">Tick 🗓 to auto-schedule. Untick to take it off the calendar.</p>
      <ul className="tasks">{inbox.map(row)}</ul>
      <h3>On calendar <span className="count">{planned.length}</span></h3>
      <ul className="tasks">{planned.map(row)}</ul>
      <button className="linkish" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} done ({done.length})</button>
      {showDone && <ul className="tasks">{done.map(row)}</ul>}
    </div>
  );
}

// ---------- Classes ----------

export function ClassesPanel() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const today = new Date();
  return (
    <div className="panel">
      <div className="panel-actions">
        <button className="btn" onClick={() => open({ kind: 'semester' })}>+ Semester</button>
        <button className="btn primary" onClick={() => open({ kind: 'module' })}>+ Course</button>
      </div>
      {!data.semesters.length && <p className="muted">Start by adding a semester: pick its first Monday and which weeks are teaching, recess or exam weeks.</p>}
      <div className="chips">
        {SEMESTER_PRESETS.filter((p) => !data.semesters.some((s) => s.name === p.name)).map((p) => (
          <button key={p.name} className="chip" title="Adds the real term dates, breaks and holidays"
            onClick={() => commit(`Add ${p.name}`, (d) => { d.semesters.push(semesterFromPreset(p, uid())); })}>+ {p.name}</button>
        ))}
      </div>
      {data.semesters.map((sem) => {
        const wi = weekIndex(sem, today);
        return (
          <section key={sem.id} className="sem">
            <header className="sem-head">
              <button className="linkish strong" onClick={() => open({ kind: 'semester', id: sem.id })}>{sem.name}</button>
              {wi !== null && <span className="tag neutral">Now: {weekLabelText(sem.layout[wi])}</span>}
              {sem.style === 'nus' && <button className="linkish" onClick={() => open({ kind: 'nusmods', semesterId: sem.id })}>Import NUSMods</button>}
            </header>
            {data.modules.filter((m) => m.semesterId === sem.id).map((m) => (
              <div key={m.id} className="mod" style={{ borderLeftColor: m.color }}>
                <div className="mod-head">
                  <button className="linkish strong mod-code" title={`${m.code} ${m.name}`} onClick={() => open({ kind: 'module', id: m.id })}>{m.code}</button>
                  <span className="muted mod-name" title={m.name}>{m.name}</span>
                  <button className="chip" onClick={() => open({ kind: 'class', moduleId: m.id })}>+ class</button>
                  <button className="chip" title="Exam, quiz, presentation, help session or group meeting" onClick={() => open({ kind: 'event', category: 'exam', moduleId: m.id })}>+ event</button>
                </div>
                <ul className="lessons">
                  {data.classes.filter((c) => c.moduleId === m.id).map((c) => (
                    <li key={c.id}>
                      <button className="linkish" onClick={() => open({ kind: 'class', id: c.id })}>
                        <Parts items={[c.kind, `${formatDays(c.days, sem.style)} ${c.start}–${c.end}`, `wk ${formatWeeks(c.weeks, sem.style !== 'us')}`, c.location]} />
                      </button>
                    </li>
                  ))}
                </ul>
                <ul className="mod-tasks">
                  {data.events.filter((e) => e.moduleId === m.id && fromLocal(e.end) >= today).sort((a, b) => a.start.localeCompare(b.start)).map((e) => (
                    <li key={e.id}><button className="linkish" onClick={() => open({ kind: 'event', id: e.id })}>
                      <Parts items={[`${EVENT_ICONS[e.category] ?? '📅'} ${e.title}`, format(fromLocal(e.start), 'EEE d MMM HH:mm'), e.location]} />
                    </button></li>
                  ))}
                </ul>
                <TaskCount moduleId={m.id} />
              </div>
            ))}
          </section>
        );
      })}

      <section className="sem">
        <header className="sem-head">
          <span className="strong">CCAs, clubs &amp; activities</span>
          <span className="spacer" />
          <button className="chip" onClick={() => open({ kind: 'activity' })}>+ CCA</button>
        </header>
        {!data.activities.length && <p className="muted small">Weekly ones (Robotics MWR 18:00–20:00) or ones you book session by session (Hoofers).</p>}
        {data.activities.map((a) => {
          const sessions = data.events.filter((e) => e.activityId === a.id && fromLocal(e.end) >= today).sort((x, y) => x.start.localeCompare(y.start));
          return (
            <div key={a.id} className="mod" style={{ borderLeftColor: a.color }}>
              <div className="mod-head">
                <button className="linkish strong mod-code" title={a.title} onClick={() => open({ kind: 'activity', id: a.id })}>{a.title}</button>
                <span className="mod-name" />
                <button className="chip" title="Add a session you booked" onClick={() => open({ kind: 'event', category: 'cca', activityId: a.id })}>+ session</button>
                <button className="chip" title="Something to do for this, any time (e.g. glaze pottery)" onClick={() => open({ kind: 'task', activityId: a.id })}>+ task</button>
              </div>
              <ul className="lessons">
                <li>
                  <button className="linkish" onClick={() => open({ kind: 'activity', id: a.id })}>
                    <Parts items={[
                      a.recurring === false ? 'booked sessions' : `${formatDays(a.days, 'us')} ${a.start}–${a.end}`,
                      a.location,
                      a.recurring !== false && (a.from || a.until) ? `${a.from ? format(fromLocal(a.from), 'd MMM') : '…'}–${a.until ? format(fromLocal(a.until), 'd MMM') : '…'}` : undefined,
                    ]} />
                  </button>
                </li>
              </ul>
              <TaskCount activityId={a.id} />
              {sessions.length > 0 && (
                <ul className="mod-tasks">
                  {sessions.map((e) => (
                    <li key={e.id}><button className="linkish" onClick={() => open({ kind: 'event', id: e.id })}><Parts items={[`🧗 ${format(fromLocal(e.start), 'EEE d MMM HH:mm')}–${format(fromLocal(e.end), 'HH:mm')}`, e.location !== a.location ? e.location : undefined, e.notes?.split('\n')[0]]} /></button></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function TaskCount({ moduleId, activityId }: { moduleId?: string; activityId?: string }) {
  const tasks = useStore((s) => s.data.tasks.filter((t) => !t.done && ((moduleId && t.moduleId === moduleId) || (activityId && t.activityId === activityId))));
  const open = useUI((s) => s.open);
  if (!tasks.length) return null;
  return (
    <ul className="mod-tasks">
      {tasks.map((t) => (
        <li key={t.id}><button className="linkish" onClick={() => open({ kind: 'task', id: t.id })}>📝 {t.title}{t.deadline ? ` · due ${format(fromLocal(t.deadline), 'd MMM')}` : ''}</button></li>
      ))}
    </ul>
  );
}

// ---------- Routines ----------

export function RoutinesPanel() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const short = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <div className="panel">
      <div className="panel-actions"><button className="btn primary" onClick={() => open({ kind: 'routine' })}>+ Routine</button></div>
      <p className="muted small">The switch turns a routine on or off (off = paused, not deleted). <b>Auto</b> routines find a free time inside their window around classes and CCAs; <b>fixed</b> ones stay at their usual time. Drag one on the calendar to move it for that day only.</p>
      <ul className="routines">
        {data.routines.map((r) => (
          <li key={r.id} className={r.enabled ? '' : 'off'} style={{ borderLeftColor: r.color }}>
            <label className="switch" title={r.enabled ? 'On: shown on the calendar. Click to pause.' : 'Paused: not on the calendar. Click to turn on.'}>
              <input type="checkbox" role="switch" checked={r.enabled} aria-label={`${r.title} on`} onChange={() => commit(`${r.enabled ? 'Pause' : 'Turn on'} ${r.title}`, (d) => {
                const x = d.routines.find((y) => y.id === r.id); if (x) x.enabled = !x.enabled;
              })} />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <button className="task-main" onClick={() => open({ kind: 'routine', id: r.id })}>
              <span className="task-title">{r.title}</span>
              <span className="task-meta">
                {r.preferredStart} · {fmtDur(r.durationMin)} · {r.days.length === 7 ? 'daily' : r.days.map((d) => short[d]).join('')}
                {r.flexible ? ` · auto ${r.windowStart}–${r.windowEnd}${r.windowEnd < r.windowStart ? ' (next day)' : ''}` : ' · fixed'}
                {!r.enabled && ' · paused'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Places, travel & settings ----------

export function PlacesPanel() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const [name, setName] = useState('');
  const [route, setRoute] = useState({ a: '', b: '', minutes: '20', both: true });
  const pname = (id: string) => data.places.find((p) => p.id === id)?.name ?? '?';
  const st = data.settings;
  const setS = (k: keyof typeof st, v: string | number) => commit(`Setting ${k}`, (d) => { (d.settings as unknown as Record<string, unknown>)[k] = v; });

  return (
    <div className="panel">
      <h3>Places</h3>
      <p className="muted small">If a location contains a place name or alias (e.g. “COM1-0204” contains “COM1”), Kairos adds travel time automatically. Unknown places use the default estimate.</p>
      <ul className="places">
        {data.places.map((p) => (
          <li key={p.id}>
            <PlaceName name={p.name} home={!!p.isHome} onRename={(name) => commit(`Rename ${p.name} → ${name}`, (d) => renamePlace(d, p.id, name))} />
            <input className="alias" defaultValue={p.aliases.join(', ')} placeholder="aliases, comma separated"
              onBlur={(e) => {
                const aliases = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
                if (aliases.join(',') !== p.aliases.join(',')) commit(`Aliases for ${p.name}`, (d) => { const x = d.places.find((y) => y.id === p.id); if (x) x.aliases = aliases; });
              }} />
            {!p.isHome && <button className="icon-btn" aria-label={`Delete ${p.name}`} onClick={() => commit(`Delete ${p.name}`, (d) => {
              d.places = d.places.filter((x) => x.id !== p.id);
              d.routes = d.routes.filter((r) => r.a !== p.id && r.b !== p.id);
            })}>✕</button>}
          </li>
        ))}
      </ul>
      <div className="quick">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New place (e.g. COM1, CS building)"
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { commit(`Add ${name}`, (d) => { d.places.push({ id: uid(), name: name.trim(), aliases: [] }); }); setName(''); } }} />
        <button className="btn" disabled={!name.trim()} onClick={() => { commit(`Add ${name}`, (d) => { d.places.push({ id: uid(), name: name.trim(), aliases: [] }); }); setName(''); }}>Add</button>
      </div>

      <h3>Usual travel times</h3>
      <ul className="routes">
        {data.routes.map((r) => (
          <li key={r.id}>
            <span className="route-name">{pname(r.a)} {r.bidirectional !== false ? '↔' : '→'} {pname(r.b)}</span>
            <NumberInput className="mins" value={r.minutes} aria-label="Minutes" onCommit={(v) => {
              commit(`Route ${pname(r.a)}–${pname(r.b)} ${v}m`, (d) => { const x = d.routes.find((y) => y.id === r.id); if (x) x.minutes = v; });
            }} /> min
            <label className="check small" title="Same time both ways">
              <input type="checkbox" checked={r.bidirectional !== false} onChange={(e) => commit(`${pname(r.a)}–${pname(r.b)} ${e.target.checked ? 'both ways' : 'one way'}`, (d) => {
                const x = d.routes.find((y) => y.id === r.id); if (x) x.bidirectional = e.target.checked;
              })} /> both ways
            </label>
            <button className="icon-btn" aria-label="Delete route" onClick={() => commit('Delete route', (d) => { d.routes = d.routes.filter((x) => x.id !== r.id); })}>✕</button>
          </li>
        ))}
      </ul>
      <Row>
        <Field label="From"><select value={route.a} onChange={(e) => setRoute({ ...route, a: e.target.value })}><option value="">…</option>{data.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="To"><select value={route.b} onChange={(e) => setRoute({ ...route, b: e.target.value })}><option value="">…</option>{data.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Min"><input type="text" inputMode="numeric" value={route.minutes} onChange={(e) => setRoute({ ...route, minutes: e.target.value.replace(/[^\d]/g, '') })} /></Field>
        <button className="btn align-end" disabled={!route.a || !route.b || route.a === route.b} onClick={() => {
          commit(`Route ${pname(route.a)}${route.both ? '↔' : '→'}${pname(route.b)}`, (d) => {
            d.routes = d.routes.filter((r) => !((r.a === route.a && r.b === route.b) || (route.both && r.a === route.b && r.b === route.a)));
            d.routes.push({ id: uid(), a: route.a, b: route.b, minutes: Math.max(0, Number(route.minutes) || 0), bidirectional: route.both });
          });
          setRoute({ a: '', b: '', minutes: '20', both: true });
        }}>Save</button>
      </Row>
      <label className="check"><input type="checkbox" checked={route.both} onChange={(e) => setRoute({ ...route, both: e.target.checked })} /> Same time both ways (untick if e.g. the way back takes longer)</label>

      <h3>Settings</h3>
      <Row>
        <Field label="Tasks no earlier than"><input type="time" value={st.dayStart} onChange={(e) => setS('dayStart', e.target.value)} /></Field>
        <Field label="Tasks no later than"><input type="time" value={st.dayEnd} onChange={(e) => setS('dayEnd', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Gap between things (min)"><NumberInput value={st.bufferMin} onCommit={(v) => setS('bufferMin', v)} /></Field>
        <Field label="Extra per trip (min)"><NumberInput value={st.travelBufferMin} onCommit={(v) => setS('travelBufferMin', v)} /></Field>
        <Field label="Unknown trip (min)"><NumberInput value={st.defaultTravelMin} onCommit={(v) => setS('defaultTravelMin', v)} /></Field>
      </Row>
      <DataTools />
    </div>
  );
}

function DataTools() {
  const data = useStore((s) => s.data);
  const [showBackups, setShowBackups] = useState(false);
  const replaceAll = useStore((s) => s.replaceAll);
  return (
    <>
      <h3>Backup</h3>
      <p className="muted small">Everything is saved in a local database on this computer (<code>data/kairos.db</code> in the project folder), with an automatic backup at most once an hour. Cloud sync comes in v2.</p>
      <div className="panel-actions">
        <button className="btn" onClick={() => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `kairos-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
          a.click();
        }}>Export</button>
        <label className="btn">Import<input type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { replaceAll(JSON.parse(await f.text()), 'Import backup'); } catch { alert('That file is not a Kairos backup.'); }
        }} /></label>
        <button className="btn" onClick={() => setShowBackups(!showBackups)}>{showBackups ? 'Hide' : 'Database'} backups</button>
      </div>
      {showBackups && <DbBackups />}
    </>
  );
}

/** Automatic database backups (hourly), restorable with one click (undoable). */
function DbBackups() {
  const [list, setList] = useState<{ id: number; created_at: string; size: number }[] | null>(null);
  const [error, setError] = useState('');
  const replaceAll = useStore((s) => s.replaceAll);
  useEffect(() => {
    fetch('/api/backups').then((r) => (r.ok ? r.json() : Promise.reject())).then(setList).catch(() => setError("The database server isn't running."));
  }, []);
  if (error) return <p className="muted small">{error}</p>;
  if (!list) return <p className="muted small">Loading…</p>;
  if (!list.length) return <p className="muted small">No backups yet. The first one is made an hour after you start saving.</p>;
  return (
    <ul className="routes">
      {list.map((b) => (
        <li key={b.id}>
          <span className="route-name">{format(new Date(b.created_at), 'EEE d MMM yyyy, HH:mm')} <span className="muted small">({Math.round(b.size / 1024)} KB)</span></span>
          <button className="chip" onClick={async () => {
            if (!confirm('Restore this backup? You can undo it with Ctrl+Z.')) return;
            const r = await fetch(`/api/backups/${b.id}/restore`, { method: 'POST' });
            if (r.ok) { const { data } = await r.json(); replaceAll(data, 'Restore database backup'); }
          }}>Restore</button>
        </li>
      ))}
    </ul>
  );
}

/** Double-click (or Enter on focus) to rename; Enter/blur saves, Escape cancels. */
function PlaceName({ name, home, onRename }: { name: string; home: boolean; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const done = (save: boolean) => {
    setEditing(false);
    const v = text.trim();
    if (save && v && v !== name) onRename(v); else setText(name);
  };
  if (editing) {
    return (
      <input className="place-edit" autoFocus value={text} aria-label="Place name" onChange={(e) => setText(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } }} />
    );
  }
  return (
    <b className="place-name" tabIndex={0} title="Double-click to rename" onDoubleClick={() => { setText(name); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setText(name); setEditing(true); } }}>
      {home ? '🏠 ' : ''}{name}
    </b>
  );
}

/**
 * Rename a place, and the old name inside every location that uses it, so travel times keep working:
 * renaming "Brogden Psychology Building" to "Brogden" turns "107 Brogden Psychology Building" into "107 Brogden".
 */
export function renamePlace(d: AppData, id: string, name: string) {
  const place = d.places.find((x) => x.id === id);
  if (!place) return;
  const old = place.name.trim();
  place.name = name;
  if (!old) return;
  // Whole name only (not inside another word), any capitalisation.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
  for (const x of [...d.classes, ...d.activities, ...d.events, ...d.tasks, ...d.routines]) {
    if (x.location && re.test(x.location)) { re.lastIndex = 0; x.location = x.location.replace(re, name); }
    re.lastIndex = 0;
  }
}

/**
 * "a · b · c" where each piece moves to the next line as a whole
 * (e.g. a location stays together); a piece only breaks inside if it's wider than the line.
 */
function Parts({ items }: { items: (string | undefined | false | null)[] }) {
  const parts = items.filter(Boolean) as string[];
  return <>{parts.map((p, i) => <span key={i} className="part">{i > 0 ? `· ${p}` : p}</span>)}</>;
}

// ---------- Deleted ----------

/** Everything you deleted: single sessions and whole items. Restore brings it back (also undoable). */
export function DeletedPanel() {
  const data = useStore((s) => s.data);
  const mods = new Map(data.modules.map((m) => [m.id, m]));
  const sessions = [
    ...data.classes.flatMap((c) => (c.deletedDates ?? []).map((dk) => ({ kind: 'class' as const, id: c.id, dk, label: `${mods.get(c.moduleId)?.code ?? ''} ${c.kind}`.trim() }))),
    ...data.routines.flatMap((r) => (r.deletedDates ?? []).map((dk) => ({ kind: 'routine' as const, id: r.id, dk, label: r.title }))),
    ...data.activities.flatMap((a) => (a.deletedDates ?? []).map((dk) => ({ kind: 'activity' as const, id: a.id, dk, label: a.title }))),
  ].sort((a, b) => b.dk.localeCompare(a.dk));
  const kindName = { event: 'Event', task: 'Task', class: 'Class', routine: 'Routine', activity: 'CCA / activity' };
  const itemLabel = (t: (typeof data.trash)[number]) => {
    if (t.kind === 'class') return `${mods.get(t.item.moduleId)?.code ?? ''} ${t.item.kind} (all sessions)`;
    if (t.kind === 'event') return `${t.item.title} · ${format(fromLocal(t.item.start), 'EEE d MMM HH:mm')}`;
    return t.item.title;
  };
  return (
    <div className="panel">
      <p className="muted small">Things you deleted. <b>Restore</b> puts them back. Skipped sessions aren't here; they stay on the calendar, faded.</p>
      <h3>Single sessions <span className="count">{sessions.length}</span></h3>
      {!sessions.length && <p className="muted small">None.</p>}
      <ul className="routes">
        {sessions.map((x) => (
          <li key={`${x.kind}:${x.id}:${x.dk}`}>
            <span className="route-name"><Parts items={[x.label, format(fromLocal(x.dk), 'EEE dd/MM/yyyy')]} /></span>
            <button className="chip" onClick={() => restoreDate(x.kind, x.id, x.dk, `${x.label} on ${x.dk}`)}>Restore</button>
          </li>
        ))}
      </ul>
      <h3>Whole items <span className="count">{data.trash.length}</span></h3>
      {!data.trash.length && <p className="muted small">None.</p>}
      <ul className="routes">
        {data.trash.map((t, i) => (
          <li key={i}>
            <span className="route-name"><Parts items={[itemLabel(t), kindName[t.kind], `deleted ${format(fromLocal(t.deletedAt), 'dd/MM HH:mm')}`]} /></span>
            <button className="chip" onClick={() => restoreTrash(i)}>Restore</button>
            <button className="icon-btn" aria-label="Delete forever" title="Delete forever"
              onClick={() => { if (confirm(`Delete "${itemLabel(t)}" forever? This can only be undone with Ctrl+Z right away.`)) purgeTrash(i); }}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
