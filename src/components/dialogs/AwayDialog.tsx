// A trip or holiday: no tasks get planned then; classes, CCAs and routines are hidden.
// Its travel schedule (flights, bus rides, stays, visits) is kept with it.
import { addDays, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import type { AwayRange, TravelPlan, TravelPlanKind } from '../../types';
import { at, toLocal, uid } from '../../lib/time';
import { newDefaults } from '../../lib/newDefaults';
import { coverPlans, PLAN_KINDS } from '../../lib/travelPlans';
import { DateTimeInput, DialogButtons, Field, Modal, Row, useModal, useUI } from '../ui';
import { upsert, useDraft } from './shared';

export function AwayDialog() {
  const m = useModal('away');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.away.find((a) => a.id === m.id) : undefined;
  const defaults = newDefaults(data.settings);
  const [a, update] = useDraft<AwayRange>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        // From the chosen time, or tomorrow (06:00, for 2 days unless you changed that in Settings).
        start: toLocal(m.start ?? at(addDays(startOfDay(new Date()), 1), defaults.awayStart)),
        end: toLocal(m.end ?? at(addDays(startOfDay(new Date()), 1 + defaults.awayDays), defaults.awayEnd)),
      },
  );

  const plans = a.plans ?? [];
  const setPlans = (next: TravelPlan[]) => update({ plans: next });
  const canSave = a.end > a.start && plans.every((p) => p.start);
  const name = a.title.trim() || 'Away';
  const save = () => {
    if (!canSave) return;
    const tidy = plans.map((p) => ({
      ...p,
      title: p.title.trim(),
      where: p.where?.trim() || undefined,
      notes: p.notes?.trim() || undefined,
      end: p.end && p.end > p.start ? p.end : undefined,
    }));
    const saved = coverPlans({ ...a, title: a.title.trim(), plans: tidy.length ? tidy : undefined });
    commit(existing ? `Edit ${name}` : `Add ${name}`, (d) => upsert(d.away, saved));
    close();
  };
  const remove = () => {
    commit(`Remove ${name}`, (d) => {
      d.away = d.away.filter((x) => x.id !== a.id);
    });
    close();
  };

  return (
    <Modal
      title={existing ? 'Edit time away' : 'Time away'}
      onClose={close}
      footer={
        <DialogButtons onDelete={existing ? remove : undefined} onCancel={close} onSave={save} canSave={canSave} />
      }
    >
      <Field label="What (optional)">
        <input
          autoFocus
          value={a.title}
          onChange={(e) => update({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="e.g. Thanksgiving trip"
        />
      </Field>
      <Row>
        <Field label="From">
          <DateTimeInput value={a.start} onChange={(v) => v && update({ start: v })} />
        </Field>
        <Field label="Until">
          <DateTimeInput value={a.end} onChange={(v) => v && update({ end: v })} defaultTime={defaults.awayEnd} />
        </Field>
      </Row>
      <p className="muted small">
        No tasks get planned in this time, and classes, CCAs and routines are hidden. Events and task sessions you
        placed yourself stay.
      </p>
      <TravelPlans away={a} plans={plans} onChange={setPlans} />
    </Modal>
  );
}

/** The trip's schedule: add a flight, bus ride, stay... and fill in what you know. */
function TravelPlans({
  away,
  plans,
  onChange,
}: {
  away: AwayRange;
  plans: TravelPlan[];
  onChange: (plans: TravelPlan[]) => void;
}) {
  const edit = (id: string, patch: Partial<TravelPlan>) =>
    onChange(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = (kind: TravelPlanKind) => {
    // Starts where the last one ends (or when the trip starts).
    const last = [...plans].sort((x, y) => x.start.localeCompare(y.start)).at(-1);
    const start = last ? (last.end ?? last.start) : away.start;
    onChange([...plans, { id: uid(), kind, title: '', start }]);
  };
  const outside = plans.some((p) => p.start < away.start || (p.end ?? p.start) > away.end);
  return (
    <>
      <h4 className="plans-head">Travel plans</h4>
      {plans.map((p) => (
        <div key={p.id} className="plan-edit">
          <Row>
            <Field label="Kind">
              <select value={p.kind} onChange={(e) => edit(p.id, { kind: e.target.value as TravelPlanKind })}>
                {Object.entries(PLAN_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What">
              <input
                value={p.title}
                placeholder={PLAN_KINDS[p.kind].placeholder}
                onChange={(e) => edit(p.id, { title: e.target.value })}
              />
            </Field>
          </Row>
          <Row>
            <Field label={p.kind === 'stay' ? 'Check in' : 'Leaves'}>
              <DateTimeInput value={p.start} onChange={(v) => v && edit(p.id, { start: v })} />
            </Field>
            <Field label={p.kind === 'stay' ? 'Check out' : 'Arrives (optional)'}>
              <DateTimeInput value={p.end ?? ''} onChange={(v) => edit(p.id, { end: v || undefined })} />
            </Field>
          </Row>
          <Row>
            <Field label="Where (optional)">
              <input
                value={p.where ?? ''}
                placeholder={p.kind === 'flight' ? 'e.g. MSN Terminal, gate B4' : 'Address or station'}
                onChange={(e) => edit(p.id, { where: e.target.value })}
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                value={p.notes ?? ''}
                placeholder="Booking code, seat…"
                onChange={(e) => edit(p.id, { notes: e.target.value })}
              />
            </Field>
          </Row>
          <button className="linkish bad small" onClick={() => onChange(plans.filter((x) => x.id !== p.id))}>
            Remove {PLAN_KINDS[p.kind].label.toLowerCase()}
          </button>
        </div>
      ))}
      <div className="chips">
        {Object.entries(PLAN_KINDS).map(([k, v]) => (
          <button key={k} className="chip" onClick={() => add(k as TravelPlanKind)}>
            + {v.icon} {v.label}
          </button>
        ))}
      </div>
      {outside && (
        <p className="muted small">
          Some plans are outside the dates above: saving stretches the time away to cover them.
        </p>
      )}
    </>
  );
}
