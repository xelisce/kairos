import { format } from 'date-fns';
import { useStore } from '../../store';
import type { Routine, RoutineCategory } from '../../types';
import { trashItem } from '../../lib/actions';
import { dateKey, fromLocal, uid } from '../../lib/time';
import {
  ColorPicker,
  DayPicker,
  DialogButtons,
  Field,
  LocationInput,
  Modal,
  NumberInput,
  Row,
  useModal,
  useUI,
} from '../ui';
import { locationSuggestions, upsert, useDraft } from './shared';

const CATEGORIES: RoutineCategory[] = ['meal', 'hygiene', 'sleep', 'chores', 'exercise', 'other'];
/** Changing any of these makes hand-made moves from today on stale. */
const TIMING_FIELDS = ['preferredStart', 'durationMin', 'flexible', 'windowStart', 'windowEnd'] as const;

const crossesMidnight = (r: Routine) => r.windowEnd < r.windowStart;
const movesBefore = (overrides: Routine['overrides'], day: string) =>
  Object.fromEntries(Object.entries(overrides).filter(([dk]) => dk < day));

export function RoutineDialog() {
  const m = useModal('routine');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.routines.find((x) => x.id === m.id) : undefined;
  const [r, update] = useDraft<Routine>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        category: 'other',
        enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        durationMin: 30,
        preferredStart: '12:00',
        flexible: true,
        windowStart: '11:00',
        windowEnd: '14:00',
        color: '#3fa76a',
        skipDates: [],
        overrides: {},
      },
  );

  const today = dateKey(new Date());
  const pinnedDays = Object.keys(r.overrides)
    .filter((dk) => dk >= today)
    .sort();
  const canSave = !!r.title.trim() && r.days.length > 0;

  const save = () => {
    if (!canSave) return;
    const timingChanged = existing && TIMING_FIELDS.some((k) => existing[k] !== r[k]);
    const next = timingChanged ? { ...r, overrides: movesBefore(r.overrides, today) } : r;
    commit(existing ? `Edit ${r.title}` : `Add ${r.title}`, (d) => upsert(d.routines, next));
    close();
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.title}` : 'New routine'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={
            existing
              ? () => {
                  trashItem('routine', r.id);
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
      <Row>
        <Field label="Name">
          <input
            autoFocus
            value={r.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Lunch, Gym, Meal prep"
          />
        </Field>
        <Field label="Color">
          <ColorPicker value={r.color} onChange={(color) => update({ color })} />
        </Field>
      </Row>
      <Row>
        <Field label="Type">
          <select value={r.category} onChange={(e) => update({ category: e.target.value as RoutineCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Days">
          <DayPicker value={r.days} onChange={(days) => update({ days })} />
        </Field>
      </Row>
      <Row>
        <Field label="Usual start">
          <input type="time" value={r.preferredStart} onChange={(e) => update({ preferredStart: e.target.value })} />
        </Field>
        <Field label="Length (min)">
          <NumberInput min={5} value={r.durationMin} onCommit={(durationMin) => update({ durationMin })} />
        </Field>
      </Row>
      <label className="check">
        <input type="checkbox" checked={r.flexible} onChange={(e) => update({ flexible: e.target.checked })} />{' '}
        Auto-schedule: find a free time inside a window (otherwise it stays at the usual start)
      </label>
      {r.flexible && (
        <Row>
          <Field label="Not earlier than">
            <input type="time" value={r.windowStart} onChange={(e) => update({ windowStart: e.target.value })} />
          </Field>
          <Field
            label={crossesMidnight(r) ? 'Finish by (next day)' : 'Finish by'}
            hint={
              crossesMidnight(r)
                ? `Window runs ${r.windowStart} → ${r.windowEnd} the next day`
                : 'Pick a time earlier than the start to go past midnight, e.g. 18:00 → 01:00'
            }
          >
            <input type="time" value={r.windowEnd} onChange={(e) => update({ windowEnd: e.target.value })} />
          </Field>
        </Row>
      )}
      <Field
        label="Location (optional)"
        hint="Travel is added automatically when it's somewhere other than where you were"
      >
        <LocationInput
          value={r.location ?? ''}
          onChange={(v) => update({ location: v || undefined })}
          places={locationSuggestions(data)}
        />
      </Field>
      {pinnedDays.length > 0 && (
        <p className="muted small">
          Moved by hand on {pinnedDays.length} upcoming day{pinnedDays.length > 1 ? 's' : ''} (
          {pinnedDays
            .slice(0, 3)
            .map((dk) => format(fromLocal(dk), 'EEE d MMM'))
            .join(', ')}
          {pinnedDays.length > 3 ? '…' : ''}), so it stays put there.{' '}
          <button
            type="button"
            className="linkish"
            onClick={() => update({ overrides: movesBefore(r.overrides, today) })}
          >
            Let it auto-schedule again
          </button>
        </p>
      )}
    </Modal>
  );
}
