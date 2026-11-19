import { useMemo, useState } from 'react';
import { addDays, addMinutes, format, startOfWeek } from 'date-fns';
import { useStore } from '../store';
import type { SemesterStyle } from '../types';
import type { AppData, CalEvent, ClassKind, ClassSeries, EventCategory, Module, Routine, RoutineCategory, Semester, Task, TaskCategory } from '../types';
import { ColorPicker, Field, LocationInput, Modal, NumberInput, Row, DayPicker, useUI } from './ui';
import { dateKey, fmtDur, fmtTime, fromLocal, toLocal, uid, WEEKDAYS } from '../lib/time';
import { formatLayout, formatWeeks, LAYOUT_PRESETS, maxTeachingWeek, parseLayout, parseWeeks, SEMESTER_PRESETS, semesterFromPreset, weekLabelText, DAY_PRESETS, US_DAY_LETTERS } from '../lib/weeks';
import { resetOcc, setTravel, skipOcc } from '../lib/actions';
import { MODULE_COLORS } from '../lib/defaults';
import { importNusmods } from '../lib/nusmods';

const crossesMidnight = (r: Routine) => r.windowEnd <= r.windowStart && r.windowEnd !== r.windowStart;

const placeNames = (d: AppData) => d.places.flatMap((p) => [p.name, ...p.aliases]);

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  const close = useUI((s) => s.close);
  if (!modal) return null;
  switch (modal.kind) {
    case 'occ': return <OccDetail key={modal.occ.id} />;
    case 'task': return <TaskForm key={modal.id ?? 'new'} />;
    case 'event': return <EventForm key={modal.id ?? 'new'} />;
    case 'class': return <ClassForm key={modal.id ?? 'new'} />;
    case 'module': return <ModuleForm key={modal.id ?? 'new'} />;
    case 'semester': return <SemesterForm key={modal.id ?? 'new'} />;
    case 'routine': return <RoutineForm key={modal.id ?? 'new'} />;
    case 'nusmods': return <NusmodsForm />;
    case 'newChoice': return <NewChoice />;
    default: close(); return null;
  }
}

// ---------- Occurrence detail ----------

function OccDetail() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'occ' }>;
  const { open, close } = useUI();
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const o = m.occ;
  const src = o.source;
  const [travelMin, setTravelMin] = useState(src.type === 'travel' ? String(src.minutes) : '');

  const task = src.type === 'task' ? data.tasks.find((t) => t.id === src.taskId) : undefined;
  const moved =
    (src.type === 'class' && !!data.classes.find((c) => c.id === src.seriesId)?.overrides[src.date]) ||
    (src.type === 'routine' && !!data.routines.find((r) => r.id === src.routineId)?.overrides[src.date]) ||
    (src.type === 'task' && !!task?.pinned);

  const act = (fn: () => void) => () => { fn(); close(); };

  return (
    <Modal title={o.title} onClose={close}>
      <p className="muted">
        {format(o.start, 'EEE d MMM')} · {fmtTime(o.start)}–{fmtTime(o.end)} ({fmtDur(Math.round((o.end.getTime() - o.start.getTime()) / 60000))})
        {o.subtitle && <><br />{o.subtitle}</>}
        {o.location && <><br />📍 {o.location}</>}
      </p>
      {o.warning && <p className="warn-box">⚠️ {o.warning}</p>}

      {src.type === 'travel' && (
        <>
          <p>From <b>{src.from}</b> to <b>{src.to}</b>. Every trip is different, so you can change this one only.</p>
          <Row>
            <Field label="Minutes for this trip">
              <input type="text" inputMode="numeric" value={travelMin} onChange={(e) => setTravelMin(e.target.value.replace(/[^\d]/g, ''))} />
            </Field>
          </Row>
          <div className="actions">
            <button className="btn primary" onClick={act(() => setTravel(src.key, Math.max(0, Number(travelMin) || 0)))}>Save</button>
            {src.overridden && <button className="btn" onClick={act(() => setTravel(src.key, null))}>Use saved route time</button>}
          </div>
          <p className="muted small">To change the default for this route, go to Places.</p>
        </>
      )}

      {src.type !== 'travel' && (
        <div className="actions">
          {task && (
            <button className="btn primary" onClick={act(() => commit(task.done ? `Undone ${task.title}` : `Done ${task.title}`, (d) => {
              const t = d.tasks.find((x) => x.id === task.id); if (t) t.done = !t.done;
            }))}>{task.done ? 'Mark not done' : '✓ Mark done'}</button>
          )}
          {(src.type === 'class' || src.type === 'routine') && (
            <button className="btn" onClick={act(() => skipOcc(o))}>Skip this one</button>
          )}
          {moved && <button className="btn" onClick={act(() => resetOcc(o))}>{src.type === 'task' ? 'Let auto-schedule move it' : 'Back to usual time'}</button>}
          {task && (
            <button className="btn" onClick={act(() => commit(`Unschedule ${task.title}`, (d) => {
              const t = d.tasks.find((x) => x.id === task.id); if (t) t.onCalendar = false;
            }))}>Remove from calendar</button>
          )}
          <button className="btn" onClick={() => {
            if (src.type === 'task') open({ kind: 'task', id: src.taskId });
            else if (src.type === 'event') open({ kind: 'event', id: src.eventId });
            else if (src.type === 'class') open({ kind: 'class', id: src.seriesId });
            else if (src.type === 'routine') open({ kind: 'routine', id: src.routineId });
          }}>Edit{src.type === 'class' || src.type === 'routine' ? ' all' : ''}…</button>
        </div>
      )}
      <p className="muted small">Tip: drag on the calendar to move, or drag the bottom edge to change the length.</p>
    </Modal>
  );
}

function NewChoice() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'newChoice' }>;
  const { open, close } = useUI();
  return (
    <Modal title={`${format(m.start, 'EEE d MMM')} ${fmtTime(m.start)}–${fmtTime(m.end)}`} onClose={close}>
      <div className="choice-grid">
        <button className="btn big" onClick={() => open({ kind: 'task', start: m.start, end: m.end })}>📝 Task here<small>homework, admin, applications</small></button>
        <button className="btn big" onClick={() => open({ kind: 'event', start: m.start, end: m.end })}>📅 Event here<small>hangout, appointment</small></button>
      </div>
    </Modal>
  );
}

// ---------- Task ----------

function TaskForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'task' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.tasks.find((t) => t.id === m.id) : undefined;
  const [t, setT] = useState<Task>(() => existing ?? {
    id: uid(), title: '', category: 'homework', durationMin: m.start && m.end ? Math.round((m.end.getTime() - m.start.getTime()) / 60000) : 60,
    onCalendar: true, pinned: !!m.start, done: false, createdAt: toLocal(new Date()),
    scheduled: m.start && m.end ? { start: toLocal(m.start), end: toLocal(m.end) } : undefined,
  });
  const up = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }));
  const save = () => {
    if (!t.title.trim()) return;
    commit(existing ? `Edit ${t.title}` : `Add ${t.title}`, (d) => {
      const fixed = { ...t, title: t.title.trim() };
      // Changing the length of a pinned task keeps its start.
      if (fixed.pinned && fixed.scheduled) fixed.scheduled = { start: fixed.scheduled.start, end: toLocal(addMinutes(fromLocal(fixed.scheduled.start), fixed.durationMin)) };
      const i = d.tasks.findIndex((x) => x.id === t.id);
      if (i >= 0) d.tasks[i] = fixed; else d.tasks.push(fixed);
    });
    close();
  };
  return (
    <Modal title={existing ? 'Edit task' : 'New task'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => { commit(`Delete ${t.title}`, (d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }); close(); }}>Delete</button>}
      <span className="spacer" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!t.title.trim()}>Save</button>
    </>}>
      <Field label="What"><input autoFocus value={t.title} onChange={(e) => up({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. CS 642 HW3, Course enrollment" /></Field>
      <Row>
        <Field label="Type">
          <select value={t.category} onChange={(e) => up({ category: e.target.value as TaskCategory })}>
            <option value="homework">Homework</option><option value="admin">Admin</option><option value="personal">Personal</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Class (optional)">
          <select value={t.moduleId ?? ''} onChange={(e) => up({ moduleId: e.target.value || undefined })}>
            <option value="">None</option>
            {data.modules.map((mo) => <option key={mo.id} value={mo.id}>{mo.code}</option>)}
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="How long (min)"><NumberInput min={5} value={t.durationMin} onCommit={(durationMin) => up({ durationMin })} /></Field>
        <Field label="Deadline" hint="It won't be scheduled after this; if it has to be, it shows red ⚠️">
          <input type="datetime-local" value={t.deadline ?? ''} onChange={(e) => up({ deadline: e.target.value || undefined })} />
        </Field>
      </Row>
      <Row>
        <Field label="Not before (optional)"><input type="datetime-local" value={t.earliest ?? ''} onChange={(e) => up({ earliest: e.target.value || undefined })} /></Field>
        <Field label="Location (optional)"><LocationInput value={t.location ?? ''} onChange={(v) => up({ location: v || undefined })} places={placeNames(data)} /></Field>
      </Row>
      <label className="check"><input type="checkbox" checked={t.onCalendar} onChange={(e) => up({ onCalendar: e.target.checked, pinned: e.target.checked ? t.pinned : false })} /> Put on calendar (auto-finds a slot)</label>
      {t.onCalendar && t.pinned && <label className="check"><input type="checkbox" checked={!t.pinned} onChange={() => up({ pinned: false })} /> Let auto-schedule move it</label>}
      <Field label="Notes"><textarea rows={2} value={t.notes ?? ''} onChange={(e) => up({ notes: e.target.value || undefined })} /></Field>
    </Modal>
  );
}

// ---------- Event ----------

function EventForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'event' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.events.find((e) => e.id === m.id) : undefined;
  const now = new Date();
  const [ev, setEv] = useState<CalEvent>(() => existing ?? {
    id: uid(), title: '', category: 'hangout',
    start: toLocal(m.start ?? now), end: toLocal(m.end ?? addMinutes(now, 120)),
  });
  const up = (p: Partial<CalEvent>) => setEv((x) => ({ ...x, ...p }));
  const valid = ev.title.trim() && ev.end > ev.start;
  const save = () => {
    if (!valid) return;
    commit(existing ? `Edit ${ev.title}` : `Add ${ev.title}`, (d) => {
      const i = d.events.findIndex((x) => x.id === ev.id);
      if (i >= 0) d.events[i] = ev; else d.events.push(ev);
    });
    close();
  };
  return (
    <Modal title={existing ? 'Edit event' : 'New event'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => { commit(`Delete ${ev.title}`, (d) => { d.events = d.events.filter((x) => x.id !== ev.id); }); close(); }}>Delete</button>}
      <span className="spacer" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid}>Save</button>
    </>}>
      <Field label="What"><input autoFocus value={ev.title} onChange={(e) => up({ title: e.target.value })} placeholder="e.g. Dinner with friends" /></Field>
      <Field label="Type">
        <select value={ev.category} onChange={(e) => up({ category: e.target.value as EventCategory })}>
          <option value="hangout">Hangout / outing</option><option value="appointment">Appointment</option><option value="admin">Admin</option><option value="other">Other</option>
        </select>
      </Field>
      <Row>
        <Field label="Start"><input type="datetime-local" value={ev.start} onChange={(e) => {
          const dur = fromLocal(ev.end).getTime() - fromLocal(ev.start).getTime();
          up({ start: e.target.value, end: toLocal(new Date(fromLocal(e.target.value).getTime() + dur)) });
        }} /></Field>
        <Field label="End"><input type="datetime-local" value={ev.end} onChange={(e) => up({ end: e.target.value })} /></Field>
      </Row>
      <Field label="Location (optional)" hint="Travel time is added automatically if you're going somewhere else"><LocationInput value={ev.location ?? ''} onChange={(v) => up({ location: v || undefined })} places={placeNames(data)} /></Field>
      <Field label="Notes"><textarea rows={2} value={ev.notes ?? ''} onChange={(e) => up({ notes: e.target.value || undefined })} /></Field>
    </Modal>
  );
}

// ---------- Class series ----------

const KINDS: ClassKind[] = ['Lecture', 'Discussion', 'Tutorial', 'Lab', 'Recitation', 'Seminar', 'Other'];

function ClassForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'class' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.classes.find((c) => c.id === m.id) : undefined;
  const [c, setC] = useState<ClassSeries>(() => existing ?? {
    id: uid(), moduleId: m.moduleId ?? data.modules[0]?.id ?? '', kind: 'Lecture', days: [0], start: '10:00', end: '12:00',
    weeks: [], skipDates: [], overrides: {},
  });
  const mod = data.modules.find((x) => x.id === c.moduleId);
  const sem = data.semesters.find((s) => s.id === mod?.semesterId);
  const maxW = maxTeachingWeek(sem);
  const us = sem?.style === 'us';
  const [weeksText, setWeeksText] = useState(() => (existing ? formatWeeks(existing.weeks, !us) : `1-${maxW}`));
  const parsed = useMemo(() => { try { return { weeks: parseWeeks(weeksText, maxW, !us) }; } catch (e) { return { error: (e as Error).message }; } }, [weeksText, maxW, us]);
  const up = (p: Partial<ClassSeries>) => setC((x) => ({ ...x, ...p }));
  const valid = c.moduleId && c.end > c.start && c.days.length > 0 && 'weeks' in parsed && parsed.weeks!.length > 0;
  const save = () => {
    if (!valid || !('weeks' in parsed)) return;
    commit(existing ? `Edit ${mod?.code} ${c.kind}` : `Add ${mod?.code} ${c.kind}`, (d) => {
      const next = { ...c, weeks: parsed.weeks! };
      const i = d.classes.findIndex((x) => x.id === c.id);
      if (i >= 0) d.classes[i] = next; else d.classes.push(next);
    });
    close();
  };
  if (!data.modules.length) return <Modal title="Add a class" onClose={close}><p>Add a course first (Classes tab → “+ Course”).</p></Modal>;
  return (
    <Modal title={existing ? 'Edit class' : 'New class'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => { commit(`Delete ${mod?.code} ${c.kind}`, (d) => { d.classes = d.classes.filter((x) => x.id !== c.id); }); close(); }}>Delete</button>}
      <span className="spacer" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid}>Save</button>
    </>}>
      <Row>
        <Field label="Course">
          <select value={c.moduleId} onChange={(e) => up({ moduleId: e.target.value })}>
            {data.modules.map((mo) => <option key={mo.id} value={mo.id}>{mo.code} {mo.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={c.kind} onChange={(e) => up({ kind: e.target.value as ClassKind })}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
      </Row>
      <Row>
        {us ? (
          <Field label="Days">
            <DayPicker value={c.days} onChange={(days) => up({ days })} letters={US_DAY_LETTERS} presets={DAY_PRESETS} />
          </Field>
        ) : (
          <Field label="Day">
            <select value={c.days[0] ?? 0} onChange={(e) => up({ days: [Number(e.target.value)] })}>
              {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
            </select>
          </Field>
        )}
      </Row>
      <Row>
        <Field label="Start"><input type="time" value={c.start} onChange={(e) => up({ start: e.target.value })} /></Field>
        <Field label="End"><input type="time" value={c.end} onChange={(e) => up({ end: e.target.value })} /></Field>
      </Row>
      <Field label="Teaching weeks" hint={'error' in parsed ? <span className="bad">{parsed.error}</span> : <>Runs in: {formatWeeks(parsed.weeks!, !us)} · examples: {us
          ? <><code>1-15</code>, <code>2-15</code>, <code>1-7,9-15</code></>
          : <><code>3-13</code>, <code>odd</code>, <code>even 2-12</code>, <code>1,3,5-7</code></>}</>}>
        <input value={weeksText} onChange={(e) => setWeeksText(e.target.value)} />
      </Field>
      <Field label="Location (optional)"><LocationInput value={c.location ?? ''} onChange={(v) => up({ location: v || undefined })} places={placeNames(data)} /></Field>
      {sem && <p className="muted small">Break weeks ({sem.layout.filter((w) => w.type === 'break').map((w) => (w as { name: string }).name).join(', ') || 'none'}) and holidays are skipped automatically.</p>}
      {c.skipDates.length > 0 && (
        <div>
          <span className="field-label">Skipped dates</span>
          <div className="chips">{c.skipDates.sort().map((dk) => (
            <button key={dk} className="chip" title="Restore" onClick={() => up({ skipDates: c.skipDates.filter((x) => x !== dk) })}>{format(fromLocal(dk), 'd MMM')} ✕</button>
          ))}</div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Module ----------

function ModuleForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'module' }>;
  const { close, open } = useUI();
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.modules.find((x) => x.id === m.id) : undefined;
  const [mo, setMo] = useState<Module>(() => existing ?? {
    id: uid(), semesterId: m.semesterId ?? data.semesters[0]?.id ?? '', code: '', name: '',
    color: MODULE_COLORS[data.modules.length % MODULE_COLORS.length],
  });
  const up = (p: Partial<Module>) => setMo((x) => ({ ...x, ...p }));
  if (!data.semesters.length) return <Modal title="New course" onClose={close}><p>Create a semester first.</p><button className="btn primary" onClick={() => open({ kind: 'semester' })}>+ Semester</button></Modal>;
  const valid = mo.code.trim() && mo.semesterId;
  const save = (thenAddClass: boolean) => {
    if (!valid) return;
    commit(existing ? `Edit ${mo.code}` : `Add ${mo.code}`, (d) => {
      const next = { ...mo, code: mo.code.trim().toUpperCase() };
      const i = d.modules.findIndex((x) => x.id === mo.id);
      if (i >= 0) d.modules[i] = next; else d.modules.push(next);
    });
    if (thenAddClass) open({ kind: 'class', moduleId: mo.id }); else close();
  };
  const classCount = data.classes.filter((c) => c.moduleId === mo.id).length;
  return (
    <Modal title={existing ? `Edit ${existing.code}` : 'New course'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => {
        if (classCount && !confirm(`Delete ${mo.code} and its ${classCount} class(es)?`)) return;
        commit(`Delete ${mo.code}`, (d) => {
          d.modules = d.modules.filter((x) => x.id !== mo.id);
          d.classes = d.classes.filter((x) => x.moduleId !== mo.id);
          d.tasks.forEach((t) => { if (t.moduleId === mo.id) t.moduleId = undefined; });
        });
        close();
      }}>Delete</button>}
      <span className="spacer" />
      {!existing && <button className="btn" onClick={() => save(true)} disabled={!valid}>Save & add class</button>}
      <button className="btn primary" onClick={() => save(false)} disabled={!valid}>Save</button>
    </>}>
      <Row>
        <Field label="Code"><input autoFocus value={mo.code} onChange={(e) => up({ code: e.target.value })} placeholder="CS 642" /></Field>
        <Field label="Color"><ColorPicker value={mo.color} onChange={(color) => up({ color })} /></Field>
      </Row>
      <Field label="Name"><input value={mo.name} onChange={(e) => up({ name: e.target.value })} placeholder="Introduction to Information Security" /></Field>
      <Field label="Semester">
        <select value={mo.semesterId} onChange={(e) => up({ semesterId: e.target.value })}>
          {data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

// ---------- Semester ----------

function SemesterForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'semester' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.semesters.find((x) => x.id === m.id) : undefined;
  const [sem, setSem] = useState<Semester>(() => existing ?? {
    id: uid(), name: '', style: 'us', startDate: dateKey(startOfWeek(new Date(), { weekStartsOn: 1 })),
    layout: parseLayout(LAYOUT_PRESETS[1].layout), holidays: [],
  });
  const [layoutText, setLayoutText] = useState(() => formatLayout(sem.layout));
  const [hol, setHol] = useState({ date: '', name: '' });
  const up = (p: Partial<Semester>) => setSem((x) => ({ ...x, ...p }));
  const layout = parseLayout(layoutText);
  const start = fromLocal(sem.startDate);
  const isMonday = start.getDay() === 1;
  const valid = sem.name.trim() && layout.length > 0 && isMonday;
  const save = () => {
    if (!valid) return;
    commit(existing ? `Edit ${sem.name}` : `Add ${sem.name}`, (d) => {
      const next = { ...sem, layout };
      const i = d.semesters.findIndex((x) => x.id === sem.id);
      if (i >= 0) d.semesters[i] = next; else d.semesters.push(next);
    });
    close();
  };
  return (
    <Modal title={existing ? 'Edit semester' : 'New semester'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => {
        const mods = data.modules.filter((x) => x.semesterId === sem.id);
        if (mods.length && !confirm(`Delete ${sem.name} and its ${mods.length} course(s)?`)) return;
        commit(`Delete ${sem.name}`, (d) => {
          const ids = new Set(mods.map((x) => x.id));
          d.semesters = d.semesters.filter((x) => x.id !== sem.id);
          d.modules = d.modules.filter((x) => !ids.has(x.id));
          d.classes = d.classes.filter((x) => !ids.has(x.moduleId));
        });
        close();
      }}>Delete</button>}
      <span className="spacer" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid}>Save</button>
    </>}>
      {!existing && (
        <div className="chips">
          <span className="field-label">Fill from:</span>
          {SEMESTER_PRESETS.map((p) => (
            <button key={p.name} type="button" className="chip" onClick={() => {
              const s = semesterFromPreset(p, sem.id);
              setSem(s);
              setLayoutText(p.layout);
            }}>{p.name}</button>
          ))}
        </div>
      )}
      <Row>
        <Field label="Name"><input autoFocus value={sem.name} onChange={(e) => up({ name: e.target.value })} placeholder="Fall 2026" /></Field>
        <Field label="Monday of first week" hint={!isMonday ? <span className="bad">Pick a Monday</span> : undefined}>
          <input type="date" value={sem.startDate} onChange={(e) => e.target.value && up({ startDate: dateKey(startOfWeek(fromLocal(e.target.value), { weekStartsOn: 1 })) })} />
        </Field>
      </Row>
      <Field label="Class style" hint={sem.style === 'us' ? 'Classes can meet several days a week (MWF, TR), every week' : 'One day per lesson; odd/even week patterns allowed'}>
        <select value={sem.style} onChange={(e) => up({ style: e.target.value as SemesterStyle })}>
          <option value="us">UW–Madison / US (MWF, TR)</option>
          <option value="nus">NUS (odd/even weeks)</option>
        </select>
      </Field>
      <Field label="Weeks in order" hint={<>Numbers are teaching weeks, words are break weeks. Presets: {LAYOUT_PRESETS.map((p) => (
        <button key={p.name} type="button" className="linkish" onClick={() => setLayoutText(p.layout)}>{p.name}</button>
      ))}</>}>
        <input value={layoutText} onChange={(e) => setLayoutText(e.target.value)} />
      </Field>
      <div className="week-preview">
        {layout.map((w, i) => (
          <div key={i} className={w.type === 'break' ? 'brk' : ''}>
            <b>{weekLabelText(w)}</b> <span>{format(addDays(start, i * 7), 'd MMM')}</span>
          </div>
        ))}
      </div>
      <span className="field-label">Public holidays / no-class days</span>
      <div className="chips">
        {sem.holidays.map((h) => (
          <button key={h.date} className="chip" onClick={() => up({ holidays: sem.holidays.filter((x) => x.date !== h.date) })}>{format(fromLocal(h.date), 'd MMM')} {h.name} ✕</button>
        ))}
      </div>
      <Row>
        <Field label="Date"><input type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /></Field>
        <Field label="Name"><input value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="Good Friday" /></Field>
        <button type="button" className="btn align-end" disabled={!hol.date} onClick={() => {
          up({ holidays: [...sem.holidays.filter((x) => x.date !== hol.date), { date: hol.date, name: hol.name || 'Holiday' }].sort((a, b) => a.date.localeCompare(b.date)) });
          setHol({ date: '', name: '' });
        }}>Add</button>
      </Row>
    </Modal>
  );
}

// ---------- Routine ----------

function RoutineForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'routine' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.routines.find((x) => x.id === m.id) : undefined;
  const [r, setR] = useState<Routine>(() => existing ?? {
    id: uid(), title: '', category: 'other', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], durationMin: 30,
    preferredStart: '12:00', flexible: true, windowStart: '11:00', windowEnd: '14:00', color: '#3fa76a', skipDates: [], overrides: {},
  });
  const up = (p: Partial<Routine>) => setR((x) => ({ ...x, ...p }));
  const valid = r.title.trim() && r.days.length > 0;
  const save = () => {
    if (!valid) return;
    commit(existing ? `Edit ${r.title}` : `Add ${r.title}`, (d) => {
      const i = d.routines.findIndex((x) => x.id === r.id);
      if (i >= 0) d.routines[i] = r; else d.routines.push(r);
    });
    close();
  };
  return (
    <Modal title={existing ? `Edit ${existing.title}` : 'New routine'} onClose={close} footer={<>
      {existing && <button className="btn danger" onClick={() => { commit(`Delete ${r.title}`, (d) => { d.routines = d.routines.filter((x) => x.id !== r.id); }); close(); }}>Delete</button>}
      <span className="spacer" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid}>Save</button>
    </>}>
      <Row>
        <Field label="Name"><input autoFocus value={r.title} onChange={(e) => up({ title: e.target.value })} placeholder="Lunch, Gym, Meal prep" /></Field>
        <Field label="Color"><ColorPicker value={r.color} onChange={(color) => up({ color })} /></Field>
      </Row>
      <Row>
        <Field label="Type">
          <select value={r.category} onChange={(e) => up({ category: e.target.value as RoutineCategory })}>
            {['meal', 'hygiene', 'sleep', 'chores', 'exercise', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Days"><DayPicker value={r.days} onChange={(days) => up({ days })} /></Field>
      </Row>
      <Row>
        <Field label="Usual start"><input type="time" value={r.preferredStart} onChange={(e) => up({ preferredStart: e.target.value })} /></Field>
        <Field label="Length (min)"><NumberInput min={5} value={r.durationMin} onCommit={(durationMin) => up({ durationMin })} /></Field>
      </Row>
      <label className="check"><input type="checkbox" checked={r.flexible} onChange={(e) => up({ flexible: e.target.checked })} /> Flexible: slide it to avoid clashes</label>
      {r.flexible && (
        <Row>
          <Field label="Not earlier than"><input type="time" value={r.windowStart} onChange={(e) => up({ windowStart: e.target.value })} /></Field>
          <Field label={crossesMidnight(r) ? 'Finish by (next day)' : 'Finish by'}
            hint={crossesMidnight(r) ? <>Window runs {r.windowStart} → {r.windowEnd} the next day</> : <>Pick a time earlier than the start to go past midnight, e.g. 18:00 → 01:00</>}>
            <input type="time" value={r.windowEnd} onChange={(e) => up({ windowEnd: e.target.value })} />
          </Field>
        </Row>
      )}
      <Field label="Location (optional)" hint="Routines with a location stay at their usual time so travel can be planned"><LocationInput value={r.location ?? ''} onChange={(v) => up({ location: v || undefined })} places={placeNames(data)} /></Field>
      <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => up({ enabled: e.target.checked })} /> Enabled</label>
    </Modal>
  );
}

// ---------- NUSMods ----------

function NusmodsForm() {
  const m = useUI((s) => s.modal) as Extract<ReturnType<typeof useUI.getState>['modal'], { kind: 'nusmods' }>;
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const replaceAll = useStore((s) => s.replaceAll);
  const sem = data.semesters.find((s) => s.id === m.semesterId)!;
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setStatus('Fetching from NUSMods…');
    try {
      const res = await importNusmods(url, sem, data.modules.length);
      const d = structuredClone(data);
      const existingCodes = new Set(d.modules.filter((x) => x.semesterId === sem.id).map((x) => x.code));
      const newMods = res.modules.filter((x) => !existingCodes.has(x.code));
      const keep = new Set(newMods.map((x) => x.id));
      d.modules.push(...newMods);
      d.classes.push(...res.classes.filter((c) => keep.has(c.moduleId)));
      replaceAll(d, 'Import from NUSMods');
      setStatus(`Imported ${newMods.length} course(s), ${res.classes.filter((c) => keep.has(c.moduleId)).length} class(es).${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}`);
    } catch (e) {
      setStatus(`Couldn't import: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`Import into ${sem.name}`} onClose={close} footer={<><span className="spacer" /><button className="btn" onClick={close}>Close</button><button className="btn primary" disabled={!url || busy} onClick={run}>Import</button></>}>
      <Field label="NUSMods share link" hint="In NUSMods: Timetable → Share/Sync → copy link">
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://nusmods.com/timetable/sem-2/share?CS2040S=LEC:1,TUT:05" />
      </Field>
      {status && <p className="muted">{status}</p>}
    </Modal>
  );
}
