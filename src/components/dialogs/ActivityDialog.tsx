// A CCA, club or activity: weekly (Robotics MWR 18:00–20:00) or booked session by session (Hoofers).
import { useStore } from '../../store';
import type { Activity } from '../../types';
import { trashItem } from '../../lib/actions';
import { uid } from '../../lib/time';
import { newDefaults } from '../../lib/newDefaults';
import { DAY_PRESETS, US_DAY_LETTERS } from '../../lib/weeks';
import {
  ColorPicker,
  DateInput,
  DayPicker,
  DialogButtons,
  Field,
  LocationInput,
  Modal,
  Row,
  useModal,
  useUI,
} from '../ui';
import { SkippedDates } from './SkippedDates';
import { locationSuggestions, upsert, useDraft } from './shared';

export function ActivityDialog() {
  const m = useModal('activity');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.activities.find((x) => x.id === m.id) : undefined;
  const [a, update] = useDraft<Activity>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        recurring: true,
        days: [0, 2, 3],
        start: newDefaults(data.settings).activityStart,
        end: newDefaults(data.settings).activityEnd,
        color: '#5fa83f',
        skipDates: [],
        overrides: {},
      },
  );

  const canSave = !!a.title.trim() && (!a.recurring || a.days.length > 0) && a.end > a.start;
  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${a.title}` : `Add ${a.title}`, (d) =>
      upsert(d.activities, { ...a, title: a.title.trim() }),
    );
    close();
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.title}` : 'New CCA, club or activity'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={
            existing
              ? () => {
                  trashItem('activity', a.id);
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
      <Field label="Name">
        <input
          autoFocus
          value={a.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={a.recurring ? 'e.g. Wisconsin Robotics' : 'e.g. Hoofers'}
        />
      </Field>
      <div className="segmented" role="radiogroup" aria-label="How it's scheduled">
        <button
          type="button"
          role="radio"
          aria-checked={a.recurring}
          className={a.recurring ? 'on' : ''}
          onClick={() => update({ recurring: true })}
        >
          🔁 Repeats weekly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!a.recurring}
          className={!a.recurring ? 'on' : ''}
          onClick={() => update({ recurring: false })}
        >
          📅 I book each session
        </button>
      </div>
      {a.recurring && (
        <Field label="Days">
          <DayPicker
            value={a.days}
            onChange={(days) => update({ days })}
            letters={US_DAY_LETTERS}
            presets={DAY_PRESETS}
          />
        </Field>
      )}
      <Row>
        <Field label={a.recurring ? 'Start' : 'Usual start'}>
          <input type="time" value={a.start} onChange={(e) => update({ start: e.target.value })} />
        </Field>
        <Field label={a.recurring ? 'End' : 'Usual end'}>
          <input type="time" value={a.end} onChange={(e) => update({ end: e.target.value })} />
        </Field>
      </Row>
      {a.recurring ? (
        <Row>
          <Field label="From (optional)">
            <DateInput value={a.from ?? ''} onChange={(v) => update({ from: v || undefined })} />
          </Field>
          <Field label="Until (optional)">
            <DateInput value={a.until ?? ''} onChange={(v) => update({ until: v || undefined })} />
          </Field>
        </Row>
      ) : (
        <p className="muted small">
          After saving, add each session you book with “+ session” in the Classes tab, or drag on the calendar and pick
          “CCA / activity here”. The usual times above are pre-filled.
        </p>
      )}
      <Field label="Location (optional)" hint="Travel time is added automatically">
        <LocationInput
          value={a.location ?? ''}
          onChange={(v) => update({ location: v || undefined })}
          places={locationSuggestions(data)}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={a.color} onChange={(color) => update({ color })} />
      </Field>
      {a.recurring && <SkippedDates dates={a.skipDates} onUnskip={(skipDates) => update({ skipDates })} />}
    </Modal>
  );
}
