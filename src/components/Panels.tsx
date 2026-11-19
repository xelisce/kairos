import { useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../store';
import type { Task } from '../types';
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
    return (
      <li key={t.id} className={`task ${w?.level ?? ''}`}>
        <input type="checkbox" aria-label="Done" checked={t.done} onChange={() => commit(t.done ? `Undone ${t.title}` : `Done ${t.title}`, (d) => {
          const x = d.tasks.find((y) => y.id === t.id); if (x) x.done = !x.done;
        })} />
        <button className="task-main" onClick={() => open({ kind: 'task', id: t.id })}>
          <span className="task-title">
            {w && <span title={w.text}>{w.level === 'bad' ? '❗' : '⚠️'} </span>}
            {mod && <span className="tag" style={{ background: mod.color }}>{mod.code}</span>}
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
                  <button className="linkish strong" onClick={() => open({ kind: 'module', id: m.id })}>{m.code}</button>
                  <span className="muted">{m.name}</span>
                  <span className="spacer" />
                  <button className="chip" onClick={() => open({ kind: 'class', moduleId: m.id })}>+ class</button>
                  <button className="chip" title="Exam, quiz, presentation or help session" onClick={() => open({ kind: 'event', category: 'exam', moduleId: m.id })}>+ exam</button>
                </div>
                <ul className="lessons">
                  {data.classes.filter((c) => c.moduleId === m.id).map((c) => (
                    <li key={c.id}>
                      <button className="linkish" onClick={() => open({ kind: 'class', id: c.id })}>
                        {c.kind} · {formatDays(c.days, sem.style)} {c.start}–{c.end} · wk {formatWeeks(c.weeks, sem.style !== 'us')}{c.location ? ` · 📍${c.location}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
                <ul className="mod-tasks">
                  {data.events.filter((e) => e.moduleId === m.id && fromLocal(e.end) >= today).sort((a, b) => a.start.localeCompare(b.start)).map((e) => (
                    <li key={e.id}><button className="linkish" onClick={() => open({ kind: 'event', id: e.id })}>
                      {['exam', 'quiz'].includes(e.category) ? '📝' : e.category === 'presentation' ? '🎤' : e.category === 'help' ? '🙋' : '📅'} {e.title} · {format(fromLocal(e.start), 'EEE d MMM HH:mm')}
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
          <span className="strong">CCAs &amp; clubs</span>
          <span className="spacer" />
          <button className="chip" onClick={() => open({ kind: 'activity' })}>+ CCA</button>
        </header>
        {!data.activities.length && <p className="muted small">Recurring things with fixed times, e.g. Robotics MWR 18:00–20:00.</p>}
        {data.activities.map((a) => (
          <div key={a.id} className="mod" style={{ borderLeftColor: a.color }}>
            <button className="linkish" onClick={() => open({ kind: 'activity', id: a.id })}>
              <b>{a.title}</b> · {formatDays(a.days, 'us')} {a.start}–{a.end}{a.location ? ` · 📍${a.location}` : ''}
              {(a.from || a.until) && <span className="muted"> · {a.from ? format(fromLocal(a.from), 'd MMM') : '…'}–{a.until ? format(fromLocal(a.until), 'd MMM') : '…'}</span>}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function TaskCount({ moduleId }: { moduleId: string }) {
  const tasks = useStore((s) => s.data.tasks.filter((t) => t.moduleId === moduleId && !t.done));
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
      <p className="muted small">Meals, shower, sleep, meal prep… Flexible ones slide around classes inside their window. Drag one on the calendar to move it for that day only.</p>
      <ul className="routines">
        {data.routines.map((r) => (
          <li key={r.id} className={r.enabled ? '' : 'off'} style={{ borderLeftColor: r.color }}>
            <input type="checkbox" checked={r.enabled} aria-label="Enabled" onChange={() => commit(`${r.enabled ? 'Disable' : 'Enable'} ${r.title}`, (d) => {
              const x = d.routines.find((y) => y.id === r.id); if (x) x.enabled = !x.enabled;
            })} />
            <button className="task-main" onClick={() => open({ kind: 'routine', id: r.id })}>
              <span className="task-title">{r.title}</span>
              <span className="task-meta">
                {r.preferredStart} · {fmtDur(r.durationMin)} · {r.days.length === 7 ? 'daily' : r.days.map((d) => short[d]).join('')}
                {r.flexible ? ` · flexible ${r.windowStart}–${r.windowEnd}${r.windowEnd < r.windowStart ? ' (next day)' : ''}` : ' · fixed'}
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
            <b>{p.isHome ? '🏠 ' : '📍 '}{p.name}</b>
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
  const replaceAll = useStore((s) => s.replaceAll);
  return (
    <>
      <h3>Backup</h3>
      <p className="muted small">Data is saved in this browser only for now. Cloud sync comes in v2.</p>
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
      </div>
    </>
  );
}
