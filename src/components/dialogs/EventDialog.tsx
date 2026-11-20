import { addDays, addMinutes, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import type { AppData, CalEvent, EventCategory } from '../../types';
import { trashItem } from '../../lib/actions';
import { EVENT_LABELS } from '../../lib/labels';
import { at, fromLocal, toLocal, uid } from '../../lib/time';
import { newDefaults } from '../../lib/newDefaults';
import { DateTimeInput, DialogButtons, Field, LocationInput, Modal, Row, useModal, useUI, type ModalOf } from '../ui';
import { locationSuggestions, upsert, useDraft } from './shared';
import { MAX_TEXT } from '../../lib/limits';

const TITLE_EXAMPLES: Partial<Record<EventCategory, string>> = {
  exam: 'e.g. Midterm 2',
  quiz: 'e.g. Quiz 3',
  presentation: 'e.g. Project demo',
  meeting: 'e.g. Project group meeting',
};

/** Defaults for a new event, using the booked CCA's name, place and usual times when there is one. */
function newEvent(data: AppData, m: ModalOf<'event'>, now: Date): CalEvent {
  const act = m.activityId ? data.activities.find((a) => a.id === m.activityId) : undefined;
  let start = m.start ?? now;
  let end = m.end ?? addMinutes(start, newDefaults(data.settings).eventMin);
  if (act && !m.start) {
    // Tomorrow at the club's usual time.
    const tomorrow = addDays(startOfDay(now), 1);
    start = at(tomorrow, act.start);
    end = at(tomorrow, act.end);
  }
  return {
    id: uid(),
    title: act?.title ?? '',
    category: m.category ?? (act ? 'cca' : 'hangout'),
    moduleId: m.moduleId,
    activityId: act?.id,
    location: act?.location,
    start: toLocal(start),
    end: toLocal(end),
  };
}

export function EventDialog() {
  const m = useModal('event');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.events.find((e) => e.id === m.id) : undefined;
  const [ev, update] = useDraft<CalEvent>(() => existing ?? newEvent(data, m, new Date()));

  const problem = !ev.title.trim() ? 'Give it a name' : ev.end <= ev.start ? 'It ends before it starts' : undefined;
  const canSave = !problem;
  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${ev.title}` : `Add ${ev.title}`, (d) => upsert(d.events, ev));
    close();
  };

  /** Moving the start keeps the same length. */
  const moveStart = (v: string) => {
    if (!v) return;
    const length = fromLocal(ev.end).getTime() - fromLocal(ev.start).getTime();
    update({ start: v, end: toLocal(new Date(fromLocal(v).getTime() + length)) });
  };

  return (
    <Modal
      title={existing ? 'Edit event' : 'New event'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={
            existing
              ? () => {
                  trashItem('event', ev.id);
                  close();
                }
              : undefined
          }
          onCancel={close}
          onSave={save}
          problem={problem}
        />
      }
    >
      <Field label="What">
        <input
          autoFocus
          maxLength={MAX_TEXT}
          value={ev.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={TITLE_EXAMPLES[ev.category] ?? 'e.g. Dinner with friends'}
        />
      </Field>
      <Field label="Type">
        <select value={ev.category} onChange={(e) => update({ category: e.target.value as EventCategory })}>
          {(Object.entries(EVENT_LABELS) as [EventCategory, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {ev.category === 'cca' ? (
        <Field label="CCA, club or activity">
          <select
            value={ev.activityId ?? ''}
            onChange={(e) => {
              const act = data.activities.find((x) => x.id === e.target.value);
              update({
                activityId: act?.id,
                ...(act ? { title: act.title, location: ev.location ?? act.location } : {}),
              });
            }}
          >
            <option value="">None</option>
            {data.activities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Course (optional)">
          <select value={ev.moduleId ?? ''} onChange={(e) => update({ moduleId: e.target.value || undefined })}>
            <option value="">None</option>
            {data.modules.map((mo) => (
              <option key={mo.id} value={mo.id}>
                {mo.code}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Row>
        <Field label="Start">
          <DateTimeInput value={ev.start} onChange={moveStart} />
        </Field>
        <Field label="End">
          <DateTimeInput value={ev.end} onChange={(v) => v && update({ end: v })} />
        </Field>
      </Row>
      <Field label="Location (optional)" hint="Travel time is added automatically if you're going somewhere else">
        <LocationInput
          value={ev.location ?? ''}
          onChange={(v) => update({ location: v || undefined })}
          places={locationSuggestions(data)}
        />
      </Field>
      <Field label="Notes">
        <textarea rows={2} value={ev.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} />
      </Field>
    </Modal>
  );
}
