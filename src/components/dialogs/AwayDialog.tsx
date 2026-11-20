// A trip or holiday: no tasks get planned then; classes, CCAs and routines are hidden.
import { addDays, setHours, startOfDay } from 'date-fns';
import { useStore } from '../../store';
import type { AwayRange } from '../../types';
import { toLocal, uid } from '../../lib/time';
import { DateTimeInput, DialogButtons, Field, Modal, Row, useModal, useUI } from '../ui';
import { upsert, useDraft } from './shared';

export function AwayDialog() {
  const m = useModal('away');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.away.find((a) => a.id === m.id) : undefined;
  const [a, update] = useDraft<AwayRange>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        // From the chosen time, or tomorrow 06:00 for 2 days.
        start: toLocal(m.start ?? setHours(addDays(startOfDay(new Date()), 1), 6)),
        end: toLocal(m.end ?? setHours(addDays(startOfDay(new Date()), 3), 23)),
      },
  );

  const canSave = a.end > a.start;
  const name = a.title.trim() || 'Away';
  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${name}` : `Add ${name}`, (d) => upsert(d.away, { ...a, title: a.title.trim() }));
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
          <DateTimeInput value={a.end} onChange={(v) => v && update({ end: v })} defaultTime="23:00" />
        </Field>
      </Row>
      <p className="muted small">
        No tasks get planned in this time, and classes, CCAs and routines are hidden. Events and task sessions you
        placed yourself stay.
      </p>
    </Modal>
  );
}
