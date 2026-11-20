import { useState } from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import { useStore } from '../../store';
import type { Semester, SemesterStyle } from '../../types';
import { dateKey, fromLocal, uid } from '../../lib/time';
import {
  LAYOUT_PRESETS,
  SEMESTER_PRESETS,
  formatLayout,
  parseLayout,
  semesterFromPreset,
  weekLabelText,
} from '../../lib/weeks';
import { DateInput, DialogButtons, Field, Modal, Row, useModal, useUI } from '../ui';
import { upsert, useDraft } from './shared';

const mondayOf = (d: Date) => dateKey(startOfWeek(d, { weekStartsOn: 1 }));

export function SemesterDialog() {
  const m = useModal('semester');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.semesters.find((x) => x.id === m.id) : undefined;
  const [sem, update, setSem] = useDraft<Semester>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        style: 'us',
        startDate: mondayOf(new Date()),
        layout: parseLayout(LAYOUT_PRESETS[1].layout),
        holidays: [],
      },
  );
  const [layoutText, setLayoutText] = useState(() => formatLayout(sem.layout));
  const [holiday, setHoliday] = useState({ date: '', name: '' });

  const layout = parseLayout(layoutText);
  const start = fromLocal(sem.startDate);
  const isMonday = start.getDay() === 1;
  const canSave = !!sem.name.trim() && layout.length > 0 && isMonday;

  const save = () => {
    if (!canSave) return;
    commit(existing ? `Edit ${sem.name}` : `Add ${sem.name}`, (d) => upsert(d.semesters, { ...sem, layout }));
    close();
  };

  const remove = () => {
    const courses = data.modules.filter((x) => x.semesterId === sem.id);
    if (courses.length && !confirm(`Delete ${sem.name} and its ${courses.length} course(s)?`)) return;
    commit(`Delete ${sem.name}`, (d) => {
      const ids = new Set(courses.map((x) => x.id));
      d.semesters = d.semesters.filter((x) => x.id !== sem.id);
      d.modules = d.modules.filter((x) => !ids.has(x.id));
      d.classes = d.classes.filter((x) => !ids.has(x.moduleId));
    });
    close();
  };

  const addHoliday = () => {
    const others = sem.holidays.filter((x) => x.date !== holiday.date);
    const holidays = [...others, { date: holiday.date, name: holiday.name || 'Holiday' }];
    update({ holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)) });
    setHoliday({ date: '', name: '' });
  };

  return (
    <Modal
      title={existing ? 'Edit semester' : 'New semester'}
      onClose={close}
      footer={
        <DialogButtons onDelete={existing ? remove : undefined} onCancel={close} onSave={save} canSave={canSave} />
      }
    >
      {!existing && (
        <div className="chips">
          <span className="field-label">Fill from:</span>
          {SEMESTER_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="chip"
              onClick={() => {
                setSem(semesterFromPreset(p, sem.id));
                setLayoutText(p.layout);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <Row>
        <Field label="Name">
          <input
            autoFocus
            value={sem.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Fall 2026"
          />
        </Field>
        <Field label="Monday of first week" hint={!isMonday ? <span className="bad">Pick a Monday</span> : undefined}>
          <DateInput value={sem.startDate} onChange={(v) => v && update({ startDate: mondayOf(fromLocal(v)) })} />
        </Field>
      </Row>
      <Field
        label="Class style"
        hint={
          sem.style === 'us'
            ? 'Classes can meet several days a week (MWF, TR), every week'
            : 'One day per lesson; odd/even week patterns allowed'
        }
      >
        <select value={sem.style} onChange={(e) => update({ style: e.target.value as SemesterStyle })}>
          <option value="us">UW–Madison / US (MWF, TR)</option>
          <option value="nus">NUS (odd/even weeks)</option>
        </select>
      </Field>
      <Field
        label="Weeks in order"
        hint={
          <>
            Numbers are teaching weeks, words are break weeks. Presets:{' '}
            {LAYOUT_PRESETS.map((p) => (
              <button key={p.name} type="button" className="linkish" onClick={() => setLayoutText(p.layout)}>
                {p.name}
              </button>
            ))}
          </>
        }
      >
        <input value={layoutText} onChange={(e) => setLayoutText(e.target.value)} />
      </Field>
      <div className="week-preview">
        {layout.map((w, i) => (
          <div key={i} className={w.type === 'break' ? 'brk' : ''}>
            <b>{weekLabelText(w)}</b> <span>{format(addDays(start, i * 7), 'd MMM')}</span>
          </div>
        ))}
      </div>
      <span className="field-label">Public holidays / no-class days</span>
      <div className="chips">
        {sem.holidays.map((h) => (
          <button
            key={h.date}
            className="chip"
            onClick={() => update({ holidays: sem.holidays.filter((x) => x.date !== h.date) })}
          >
            {format(fromLocal(h.date), 'd MMM')} {h.name} ✕
          </button>
        ))}
      </div>
      <Row>
        <Field label="Date">
          <DateInput value={holiday.date} onChange={(v) => setHoliday({ ...holiday, date: v })} />
        </Field>
        <Field label="Name">
          <input
            value={holiday.name}
            onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}
            placeholder="Good Friday"
          />
        </Field>
        <button type="button" className="btn align-end" disabled={!holiday.date} onClick={addHoliday}>
          Add
        </button>
      </Row>
    </Modal>
  );
}
