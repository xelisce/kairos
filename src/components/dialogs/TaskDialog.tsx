import { addMinutes } from 'date-fns';
import { useStore } from '../../store';
import type { Task, TaskCategory } from '../../types';
import { trashItem } from '../../lib/actions';
import { fromLocal, toLocal, uid } from '../../lib/time';
import { DateTimeInput, DialogButtons, Field, LocationInput, Modal, NumberInput, Row, useModal, useUI } from '../ui';
import { locationSuggestions, upsert, useDraft } from './shared';

export function TaskDialog() {
  const m = useModal('task');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.tasks.find((t) => t.id === m.id) : undefined;

  const [t, update] = useDraft<Task>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        category: m.activityId ? 'personal' : 'homework',
        moduleId: m.moduleId,
        activityId: m.activityId,
        durationMin: m.start && m.end ? Math.round((m.end.getTime() - m.start.getTime()) / 60000) : 60,
        onCalendar: true,
        // Made by drag-selecting a time: it stays there.
        pinned: !!m.start,
        done: false,
        createdAt: toLocal(new Date()),
        scheduled: m.start && m.end ? { start: toLocal(m.start), end: toLocal(m.end) } : undefined,
      },
  );

  const canSave = !!t.title.trim();
  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${t.title}` : `Add ${t.title}`, (d) => {
      const next = { ...t, title: t.title.trim() };
      // Changing the length of a pinned task keeps its start.
      if (next.pinned && next.scheduled) {
        const start = next.scheduled.start;
        next.scheduled = { start, end: toLocal(addMinutes(fromLocal(start), next.durationMin)) };
      }
      upsert(d.tasks, next);
    });
    close();
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
        <Field label="How long (min)">
          <NumberInput min={5} value={t.durationMin} onCommit={(durationMin) => update({ durationMin })} />
        </Field>
        <Field label="Deadline" hint="It won't be scheduled after this; if it has to be, it shows red ⚠️">
          <DateTimeInput
            value={t.deadline ?? ''}
            defaultTime="23:59"
            onChange={(v) => update({ deadline: v || undefined })}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Not before (optional)">
          <DateTimeInput value={t.earliest ?? ''} onChange={(v) => update({ earliest: v || undefined })} />
        </Field>
        <Field label="Location (optional)">
          <LocationInput
            value={t.location ?? ''}
            onChange={(v) => update({ location: v || undefined })}
            places={locationSuggestions(data)}
          />
        </Field>
      </Row>
      <label className="check">
        <input
          type="checkbox"
          checked={t.onCalendar}
          onChange={(e) => update({ onCalendar: e.target.checked, pinned: e.target.checked ? t.pinned : false })}
        />{' '}
        Put on calendar (auto-finds a slot)
      </label>
      {t.onCalendar && t.pinned && (
        <label className="check">
          <input type="checkbox" checked={!t.pinned} onChange={() => update({ pinned: false })} /> Let auto-schedule
          move it
        </label>
      )}
      <Field label="Notes">
        <textarea rows={2} value={t.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
      </Field>
    </Modal>
  );
}
