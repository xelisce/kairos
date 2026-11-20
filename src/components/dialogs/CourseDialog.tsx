import { useStore } from '../../store';
import type { Module } from '../../types';
import { MODULE_COLORS } from '../../lib/defaults';
import { uid } from '../../lib/time';
import { ColorPicker, DialogButtons, Field, Modal, Row, useModal, useUI } from '../ui';
import { upsert, useDraft } from './shared';

/** A course (called "Module" in the data model, as NUS used to). */
export function CourseDialog() {
  const m = useModal('module');
  const { close, open } = useUI();
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const existing = m.id ? data.modules.find((x) => x.id === m.id) : undefined;
  const [course, update] = useDraft<Module>(
    () =>
      existing ?? {
        id: uid(),
        semesterId: m.semesterId ?? data.semesters[0]?.id ?? '',
        code: '',
        name: '',
        color: MODULE_COLORS[data.modules.length % MODULE_COLORS.length],
      },
  );

  if (!data.semesters.length) {
    return (
      <Modal title="New course" onClose={close}>
        <p>Create a semester first.</p>
        <button className="btn primary" onClick={() => open({ kind: 'semester' })}>
          + Semester
        </button>
      </Modal>
    );
  }

  const canSave = !!course.code.trim() && !!course.semesterId;
  const save = (thenAddClass: boolean) => {
    if (!canSave) return;
    commit(existing ? `Edit ${course.code}` : `Add ${course.code}`, (d) =>
      upsert(d.modules, { ...course, code: course.code.trim().toUpperCase() }),
    );
    if (thenAddClass) open({ kind: 'class', moduleId: course.id });
    else close();
  };

  const remove = () => {
    const classCount = data.classes.filter((c) => c.moduleId === course.id).length;
    if (classCount && !confirm(`Delete ${course.code} and its ${classCount} class(es)?`)) return;
    commit(`Delete ${course.code}`, (d) => {
      d.modules = d.modules.filter((x) => x.id !== course.id);
      d.classes = d.classes.filter((x) => x.moduleId !== course.id);
      d.tasks.forEach((t) => {
        if (t.moduleId === course.id) t.moduleId = undefined;
      });
    });
    close();
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.code}` : 'New course'}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={existing ? remove : undefined}
          onCancel={close}
          onSave={() => save(false)}
          canSave={canSave}
          extra={
            !existing && (
              <button className="btn" onClick={() => save(true)} disabled={!canSave}>
                Save & add class
              </button>
            )
          }
        />
      }
    >
      <Row>
        <Field label="Code">
          <input
            autoFocus
            value={course.code}
            onChange={(e) => update({ code: e.target.value })}
            placeholder="CS 642"
          />
        </Field>
        <Field label="Color">
          <ColorPicker value={course.color} onChange={(color) => update({ color })} />
        </Field>
      </Row>
      <Field label="Name">
        <input
          value={course.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Introduction to Information Security"
        />
      </Field>
      <Field label="Semester">
        <select value={course.semesterId} onChange={(e) => update({ semesterId: e.target.value })}>
          {data.semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
