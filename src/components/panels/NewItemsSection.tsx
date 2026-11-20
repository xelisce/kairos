// Settings > New items: what a new task, event, trip, routine or CCA starts with.
import { useStore } from '../../store';
import type { NewItemDefaults, TaskCategory } from '../../types';
import { newDefaults } from '../../lib/newDefaults';
import { Field, NumberInput, Row } from '../ui';

export function NewItemsSection() {
  const settings = useStore((s) => s.data.settings);
  const commit = useStore((s) => s.commit);
  const d = newDefaults(settings);
  const set = <K extends keyof NewItemDefaults>(key: K, value: NewItemDefaults[K]) =>
    commit(`Default ${key}`, (data) => {
      data.settings.newDefaults = { ...data.settings.newDefaults, [key]: value };
    });
  const changed = Object.keys(settings.newDefaults ?? {}).length > 0;
  const reset = () =>
    commit('Reset new-item defaults', (data) => {
      delete data.settings.newDefaults;
    });
  const check = (key: 'taskOnCalendar' | 'taskAutoPlan' | 'taskSplit' | 'quickOnCalendar', label: string) => (
    <label className="check">
      <input type="checkbox" checked={d[key]} onChange={(e) => set(key, e.target.checked)} /> {label}
    </label>
  );
  const time = (key: 'deadlineTime' | 'notBeforeTime' | 'awayStart' | 'awayEnd' | 'activityStart' | 'activityEnd') => (
    <input type="time" value={d[key]} onChange={(e) => e.target.value && set(key, e.target.value)} />
  );

  return (
    <>
      <h3 className="away-head">
        New items
        {changed && (
          <button className="linkish" onClick={reset} title="Back to the built-in defaults">
            Reset
          </button>
        )}
      </h3>
      <p className="muted small">What new things start with. You can still change each one when you make it.</p>

      <h4 className="plans-head">New task</h4>
      <Row>
        <Field label="How long (min)">
          <NumberInput min={5} value={d.taskMin} onCommit={(v) => set('taskMin', v)} />
        </Field>
        <Field label="Type">
          <select value={d.taskCategory} onChange={(e) => set('taskCategory', e.target.value as TaskCategory)}>
            <option value="homework">Homework</option>
            <option value="admin">Admin</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </Row>
      {check('taskOnCalendar', 'Put on calendar')}
      {check('taskAutoPlan', 'Find times automatically')}
      {check('taskSplit', 'Split into sessions')}
      <Row>
        <Field label="Longest session (min)">
          <NumberInput
            min={15}
            value={d.split.maxSessionMin}
            onCommit={(v) => set('split', { ...d.split, maxSessionMin: v })}
          />
        </Field>
        <Field label="Most per day (min)">
          <NumberInput
            min={15}
            value={d.split.maxPerDayMin}
            onCommit={(v) => set('split', { ...d.split, maxPerDayMin: v })}
          />
        </Field>
        <Field label="Shortest session (min)">
          <NumberInput
            min={5}
            value={d.split.minSessionMin}
            onCommit={(v) => set('split', { ...d.split, minSessionMin: v })}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Deadline time" hint="Filled in when you pick a deadline date">
          {time('deadlineTime')}
        </Field>
        <Field label="“Not before” time">{time('notBeforeTime')}</Field>
      </Row>

      <h4 className="plans-head">Brain dump (type a task, press Enter)</h4>
      <Row>
        <Field label="How long (min)">
          <NumberInput min={5} value={d.quickMin} onCommit={(v) => set('quickMin', v)} />
        </Field>
      </Row>
      {check('quickOnCalendar', 'Put on calendar right away (off: it waits in the inbox)')}

      <h4 className="plans-head">New event, routine and CCA</h4>
      <Row>
        <Field label="Event length (min)">
          <NumberInput min={5} value={d.eventMin} onCommit={(v) => set('eventMin', v)} />
        </Field>
        <Field label="Routine length (min)">
          <NumberInput min={5} value={d.routineMin} onCommit={(v) => set('routineMin', v)} />
        </Field>
      </Row>
      <Row>
        <Field label="CCA starts">{time('activityStart')}</Field>
        <Field label="CCA ends">{time('activityEnd')}</Field>
      </Row>

      <h4 className="plans-head">New time away</h4>
      <Row>
        <Field label="Leaves (tomorrow at)">{time('awayStart')}</Field>
        <Field label="Back at">{time('awayEnd')}</Field>
        <Field label="Days away">
          <NumberInput min={0} value={d.awayDays} onCommit={(v) => set('awayDays', v)} />
        </Field>
      </Row>
    </>
  );
}
