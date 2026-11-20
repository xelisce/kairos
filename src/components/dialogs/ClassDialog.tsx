import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { ClassKind, ClassSeries } from '../../types';
import { trashItem } from '../../lib/actions';
import { WEEKDAYS, uid } from '../../lib/time';
import { DAY_PRESETS, US_DAY_LETTERS, formatWeeks, maxTeachingWeek, parseWeeks } from '../../lib/weeks';
import { DayPicker, DialogButtons, Field, LocationInput, Modal, Row, useModal, useUI } from '../ui';
import { SkippedDates } from './SkippedDates';
import { kindOptions, locationSuggestions, upsert, useDraft } from './shared';

export function ClassDialog() {
  const m = useModal('class');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.classes.find((c) => c.id === m.id) : undefined;
  const [c, update] = useDraft<ClassSeries>(
    () =>
      existing ?? {
        id: uid(),
        moduleId: m.moduleId ?? data.modules[0]?.id ?? '',
        kind: 'Lecture',
        days: [0],
        start: '10:00',
        end: '12:00',
        weeks: [],
        skipDates: [],
        overrides: {},
        kindOverrides: {},
      },
  );

  const mod = data.modules.find((x) => x.id === c.moduleId);
  const sem = data.semesters.find((s) => s.id === mod?.semesterId);
  const maxWeek = maxTeachingWeek(sem);
  // US-style (UW–Madison): several days a week, no odd/even weeks.
  const usStyle = sem?.style === 'us';
  const [weeksText, setWeeksText] = useState(() => (existing ? formatWeeks(existing.weeks, !usStyle) : `1-${maxWeek}`));
  const parsed = useMemo((): { weeks: number[] } | { error: string } => {
    try {
      return { weeks: parseWeeks(weeksText, maxWeek, !usStyle) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [weeksText, maxWeek, usStyle]);

  const problem = !c.moduleId
    ? 'Pick a course'
    : !c.days.length
      ? 'Pick at least one day'
      : c.end <= c.start
        ? 'It ends before it starts'
        : !('weeks' in parsed) || !parsed.weeks.length
          ? 'Check the weeks'
          : undefined;
  const canSave = !problem;
  const save = () => {
    if (!canSave || !('weeks' in parsed)) return;
    commit(existing ? `Edit ${mod?.code} ${c.kind}` : `Add ${mod?.code} ${c.kind}`, (d) =>
      upsert(d.classes, { ...c, weeks: parsed.weeks }),
    );
    close();
  };

  if (!data.modules.length) {
    return (
      <Modal title="Add a class" onClose={close}>
        <p>Add a course first (Classes tab → “+ Course”).</p>
      </Modal>
    );
  }

  const breakWeeks = sem?.layout.flatMap((w) => (w.type === 'break' ? [w.name] : [])) ?? [];

  return (
    <Modal
      title={existing ? 'Edit class' : 'New class'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={
            existing
              ? () => {
                  trashItem('class', c.id);
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
      <Row>
        <Field label="Course">
          <select value={c.moduleId} onChange={(e) => update({ moduleId: e.target.value })}>
            {data.modules.map((mo) => (
              <option key={mo.id} value={mo.id}>
                {mo.code} {mo.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={c.kind} onChange={(e) => update({ kind: e.target.value as ClassKind })}>
            {kindOptions(c.kind).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
      </Row>
      <Row>
        {usStyle ? (
          <Field label="Days">
            <DayPicker
              value={c.days}
              onChange={(days) => update({ days })}
              letters={US_DAY_LETTERS}
              presets={DAY_PRESETS}
            />
          </Field>
        ) : (
          <Field label="Day">
            <select value={c.days[0] ?? 0} onChange={(e) => update({ days: [Number(e.target.value)] })}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Row>
      <Row>
        <Field label="Start">
          <input type="time" value={c.start} onChange={(e) => update({ start: e.target.value })} />
        </Field>
        <Field label="End">
          <input type="time" value={c.end} onChange={(e) => update({ end: e.target.value })} />
        </Field>
      </Row>
      <Field
        label="Teaching weeks"
        hint={
          'error' in parsed ? (
            <span className="bad">{parsed.error}</span>
          ) : (
            <>
              Runs in: {formatWeeks(parsed.weeks, !usStyle)} · examples:{' '}
              {usStyle ? (
                <>
                  <code>1-15</code>, <code>2-15</code>, <code>1-7,9-15</code>
                </>
              ) : (
                <>
                  <code>3-13</code>, <code>odd</code>, <code>even 2-12</code>, <code>1,3,5-7</code>
                </>
              )}
            </>
          )
        }
      >
        <input value={weeksText} onChange={(e) => setWeeksText(e.target.value)} />
      </Field>
      <Field label="Location (optional)">
        <LocationInput
          value={c.location ?? ''}
          onChange={(v) => update({ location: v || undefined })}
          places={locationSuggestions(data)}
        />
      </Field>
      {sem && (
        <p className="muted small">
          Break weeks ({breakWeeks.join(', ') || 'none'}) and holidays are skipped automatically.
        </p>
      )}
      <SkippedDates dates={c.skipDates} onUnskip={(skipDates) => update({ skipDates })} />
    </Modal>
  );
}
