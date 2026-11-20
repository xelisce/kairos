import { useState } from 'react';
import { useStore } from '../../store';
import { importNusmods } from '../../lib/nusmods';
import { Field, Modal, useModal, useUI } from '../ui';

export function NusmodsDialog() {
  const { semesterId } = useModal('nusmods');
  const close = useUI((s) => s.close);
  const data = useStore((s) => s.data);
  const replaceAll = useStore((s) => s.replaceAll);
  const sem = data.semesters.find((s) => s.id === semesterId);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!sem) return null;

  const run = async () => {
    setBusy(true);
    setStatus('Fetching from NUSMods…');
    try {
      const found = await importNusmods(url, sem, data.modules.length);
      const d = structuredClone(data);
      // Skip courses this semester already has.
      const existingCodes = new Set(d.modules.filter((x) => x.semesterId === sem.id).map((x) => x.code));
      const newCourses = found.modules.filter((x) => !existingCodes.has(x.code));
      const newIds = new Set(newCourses.map((x) => x.id));
      const newClasses = found.classes.filter((c) => newIds.has(c.moduleId));
      d.modules.push(...newCourses);
      d.classes.push(...newClasses);
      replaceAll(d, 'Import from NUSMods');
      const notes = found.warnings.length ? ` ${found.warnings.join(' ')}` : '';
      setStatus(`Imported ${newCourses.length} course(s), ${newClasses.length} class(es).${notes}`);
    } catch (e) {
      setStatus(`Couldn't import: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Import into ${sem.name}`}
      onClose={close}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={close}>
            Close
          </button>
          <button className="btn primary" disabled={!url || busy} onClick={run}>
            Import
          </button>
        </>
      }
    >
      <Field label="NUSMods share link" hint="In NUSMods: Timetable → Share/Sync → copy link">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://nusmods.com/timetable/sem-2/share?CS2040S=LEC:1,TUT:05"
        />
      </Field>
      {status && <p className="muted">{status}</p>}
    </Modal>
  );
}
