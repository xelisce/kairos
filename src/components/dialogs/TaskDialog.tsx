import { addMinutes } from 'date-fns';
import { useStore } from '../../store';
import type { Task, TaskCategory } from '../../types';
import { trashItem } from '../../lib/actions';
import { fromLocal, toLocal, uid } from '../../lib/time';
import { DateTimeInput, DialogButtons, Field, LocationInput, Modal, NumberInput, Row, useModal, useUI } from '../ui';
import { DEFAULT_SPLIT } from '../../lib/tasks';
import { SessionList } from './SessionList';
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
        <input type="checkbox" checked={t.onCalendar} onChange={(e) => update({ onCalendar: e.target.checked })} /> Put
        on calendar (auto-finds time)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!t.split}
          onChange={(e) => update({ split: e.target.checked ? DEFAULT_SPLIT : undefined })}
        />{' '}
        Split into sessions (spread over several days before the deadline)
      </label>
      {t.split && (
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
      {t.onCalendar && t.sessions.length > 0 && <SessionList task={t} onChange={(sessions) => update({ sessions })} />}
      <Field label="Notes">
        <textarea rows={2} value={t.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
      </Field>
    </Modal>
  );
}
