import { useState } from 'react';
import { addMinutes, format } from 'date-fns';
import { useStore } from '../../store';
import type { Task, TaskCategory } from '../../types';
import { trashItem } from '../../lib/actions';
import { dependsOn } from '../../lib/dependencies';
import { fromLocal, toLocal, uid } from '../../lib/time';
import { DateTimeInput, DialogButtons, Field, LocationInput, Modal, NumberInput, Row, useModal, useUI } from '../ui';
import { fitDuration, sessionMinutes } from '../../lib/tasks';
import { newDefaults } from '../../lib/newDefaults';
import { SessionList } from './SessionList';
import { locationSuggestions, upsert, useDraft } from './shared';

export function TaskDialog() {
  const m = useModal('task');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.tasks.find((t) => t.id === m.id) : undefined;
  const defaults = newDefaults(data.settings);

  const [t, update] = useDraft<Task>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        category: m.activityId ? 'personal' : defaults.taskCategory,
        moduleId: m.moduleId,
        activityId: m.activityId,
        durationMin: m.start && m.end ? Math.round((m.end.getTime() - m.start.getTime()) / 60000) : defaults.taskMin,
        onCalendar: defaults.taskOnCalendar,
        // Placed by drag-selecting: that session is the task, so no auto-planning or splitting.
        autoPlan: m.start || defaults.taskAutoPlan ? undefined : false,
        split: !m.start && defaults.taskSplit ? defaults.split : undefined,
        // Made by drag-selecting a time: that's its (pinned) session.
        sessions:
          m.start && m.end
            ? [{ id: uid(), start: toLocal(m.start), end: toLocal(m.end), done: false, pinned: true }]
            : [],
        done: false,
        createdAt: toLocal(new Date()),
      },
  );

  const canSave = !!t.title.trim();
  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${t.title}` : `Add ${t.title}`, (d) => {
      const next = { ...t, title: t.title.trim() };
      // A task that isn't split, placed by hand: changing its length keeps its start.
      const only = next.sessions.length === 1 ? next.sessions[0] : undefined;
      if (!next.split && only?.pinned && !only.done) {
        const end = toLocal(addMinutes(fromLocal(only.start), next.durationMin));
        next.sessions = [{ ...only, end }];
      }
      upsert(d.tasks, next);
    });
    close();
  };

  /** Sessions changed in the list: keep the task's total in step with them. */
  const setSessions = (sessions: Task['sessions']) => {
    const next = { ...t, sessions };
    // One session, not split: the task is as long as that session.
    if (!t.split && sessions.length === 1) update({ sessions, durationMin: sessionMinutes(sessions[0]) });
    else update({ sessions, durationMin: fitDuration(next).durationMin });
  };

  const under = t.moduleId ? `m:${t.moduleId}` : t.activityId ? `a:${t.activityId}` : '';

  return (
    <Modal
      title={existing ? 'Edit task' : 'New task'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={
            existing
              ? () => {
                  trashItem('task', t.id);
                  close();
                }
              : undefined
          }
          onCancel={close}
          onSave={save}
          canSave={canSave}
        />
      }
    >
      <Field label="What">
        <input
          autoFocus
          value={t.title}
          onChange={(e) => update({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="e.g. CS 642 HW3, Course enrollment"
        />
      </Field>
      <Row>
        <Field label="Type">
          <select value={t.category} onChange={(e) => update({ category: e.target.value as TaskCategory })}>
            <option value="homework">Homework</option>
            <option value="admin">Admin</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Under (optional)">
          <select
            value={under}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':');
              update({ moduleId: kind === 'm' ? id : undefined, activityId: kind === 'a' ? id : undefined });
            }}
          >
            <option value="">None</option>
            {data.modules.length > 0 && (
              <optgroup label="Courses">
                {data.modules.map((mo) => (
                  <option key={mo.id} value={`m:${mo.id}`}>
                    {mo.code}
                  </option>
                ))}
              </optgroup>
            )}
            {data.activities.length > 0 && (
              <optgroup label="CCAs, clubs & activities">
                {data.activities.map((a) => (
                  <option key={a.id} value={`a:${a.id}`}>
                    {a.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      </Row>
      <Row>
        <Field label={t.split ? 'Total time (min)' : 'How long (min)'}>
          <NumberInput min={5} value={t.durationMin} onCommit={(durationMin) => update({ durationMin })} />
        </Field>
        <Field label="Deadline" hint="It won't be scheduled after this; if it has to be, it shows red ⚠️">
          <DateTimeInput
            value={t.deadline ?? ''}
            defaultTime={defaults.deadlineTime}
            onChange={(v) => update({ deadline: v || undefined })}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Not before (optional)">
          <DateTimeInput
            value={t.earliest ?? ''}
            defaultTime={defaults.notBeforeTime}
            onChange={(v) => update({ earliest: v || undefined })}
          />
        </Field>
        <Field label="Location (optional)">
          <LocationInput
            value={t.location ?? ''}
            onChange={(v) => update({ location: v || undefined })}
            places={locationSuggestions(data)}
          />
        </Field>
      </Row>
      <DependsOnPicker
        task={t}
        tasks={data.tasks}
        onChange={(ids) => update({ dependsOn: ids.length ? ids : undefined })}
      />
      <label className="check">
        <input type="checkbox" checked={t.onCalendar} onChange={(e) => update({ onCalendar: e.target.checked })} /> Put
        on calendar
      </label>
      {t.onCalendar && (
        <label className="check">
          <input
            type="checkbox"
            checked={t.autoPlan !== false}
            onChange={(e) => update({ autoPlan: e.target.checked ? undefined : false })}
          />{' '}
          Find times automatically (off: you add and place every session yourself)
        </label>
      )}
      {t.onCalendar && t.autoPlan !== false && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!t.split}
            onChange={(e) => update({ split: e.target.checked ? defaults.split : undefined })}
          />{' '}
          Split into sessions (spread over several days before the deadline)
        </label>
      )}
      {t.onCalendar && t.autoPlan !== false && t.split && (
        <Row>
          <Field label="Longest session (min)">
            <NumberInput
              min={15}
              value={t.split.maxSessionMin}
              onCommit={(maxSessionMin) => update({ split: { ...t.split!, maxSessionMin } })}
            />
          </Field>
          <Field label="Most per day (min)">
            <NumberInput
              min={15}
              value={t.split.maxPerDayMin}
              onCommit={(maxPerDayMin) => update({ split: { ...t.split!, maxPerDayMin } })}
            />
          </Field>
          <Field label="Shortest session (min)">
            <NumberInput
              min={5}
              value={t.split.minSessionMin}
              onCommit={(minSessionMin) => update({ split: { ...t.split!, minSessionMin } })}
            />
          </Field>
        </Row>
      )}
      {t.onCalendar && <SessionList task={t} onChange={setSessions} />}
      <Field label="Notes">
        <textarea rows={2} value={t.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
      </Field>
    </Modal>
  );
}

/** "Do these first": tasks this one waits for, as chips. Type to find more, like a location. */
function DependsOnPicker({ task, tasks, onChange }: { task: Task; tasks: Task[]; onChange: (ids: string[]) => void }) {
  const modules = useStore((s) => s.data.modules);
  const chosen = task.dependsOn ?? [];
  const byId = new Map(tasks.map((x) => [x.id, x]));
  // Not itself, not one already chosen, and not one that waits for this task (that would be a loop).
  const candidates = tasks
    .filter((x) => x.id !== task.id && !x.done && !chosen.includes(x.id) && !dependsOn(x, task.id, tasks))
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.title.localeCompare(b.title));
  const courseOf = (x: Task) => modules.find((m) => m.id === x.moduleId)?.code;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Every word typed must appear in the title or course ("ece mile 2" finds "ECE 555 · Milestone 2").
  const options = candidates.filter((x) => {
    const text = `${x.title} ${courseOf(x) ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const pick = (x: Task) => {
    onChange([...chosen, x.id]);
    setQuery('');
    setActive(0);
  };
  return (
    <Field label="Do these first (optional)" hint="It won't be scheduled until these tasks' sessions are over">
      <div className="chips">
        {chosen.map((id) => {
          const dep = byId.get(id);
          if (!dep) return null;
          return (
            <span key={id} className="chip">
              {dep.done ? '✓ ' : ''}
              {dep.title}{' '}
              <button
                type="button"
                className="linkish"
                aria-label={`Remove ${dep.title}`}
                onClick={() => onChange(chosen.filter((x) => x !== id))}
              >
                ✕
              </button>
            </span>
          );
        })}
      </div>
      <div className="combo">
        <input
          value={query}
          placeholder={candidates.length ? 'Type a task, e.g. Milestone 2' : 'No other open tasks to pick'}
          disabled={!candidates.length}
          role="combobox"
          aria-label="Add a task to do first"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault(); // never save the dialog from here
              if (open && options[active]) pick(options[active]);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation(); // close the list, not the dialog
              setOpen(false);
            } else if (e.key === 'Backspace' && !query && chosen.length) {
              onChange(chosen.slice(0, -1));
            }
          }}
        />
        {open && candidates.length > 0 && (
          <ul className="combo-list" role="listbox">
            {options.length === 0 && <li className="combo-empty">No open task matches “{query}”.</li>}
            {options.map((x, i) => (
              <li
                key={x.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(x);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {courseOf(x) ? `${courseOf(x)} · ` : ''}
                {x.title}
                {x.deadline && <span className="muted small"> · due {format(fromLocal(x.deadline), 'd MMM')}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
