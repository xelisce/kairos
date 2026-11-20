// Settings: when tasks may go and the gaps around things, what new things start with, backups,
// and everything you deleted.
import { useStore } from '../../store';
import type { Settings } from '../../types';
import { hmToMin } from '../../lib/time';
import { usePref } from '../../hooks/usePref';
import { Field, NumberInput, Row } from '../ui';
import { BackupSection } from './BackupSection';
import { DeletedSection } from './DeletedSection';
import { NewItemsSection } from './NewItemsSection';

type Section = 'settings' | 'deleted';

export function SettingsPanel() {
  const [{ section }, setSection] = usePref<{ section: Section }>('kairos:settingsSection', { section: 'settings' });
  const deletedCount = useStore(
    (s) =>
      s.data.trash.length +
      [...s.data.classes, ...s.data.routines, ...s.data.activities].reduce(
        (n, x) => n + (x.deletedDates?.length ?? 0),
        0,
      ),
  );
  return (
    <div className="panel">
      <div className="segmented" role="group" aria-label="Settings section">
        <button className={section === 'settings' ? 'on' : ''} onClick={() => setSection({ section: 'settings' })}>
          ⚙ Settings
        </button>
        <button className={section === 'deleted' ? 'on' : ''} onClick={() => setSection({ section: 'deleted' })}>
          🗑 Deleted{deletedCount ? ` (${deletedCount})` : ''}
        </button>
      </div>
      {section === 'settings' ? (
        <>
          <SchedulingSection />
          <NewItemsSection />
          <BackupSection />
        </>
      ) : (
        <DeletedSection />
      )}
    </div>
  );
}

function SchedulingSection() {
  const settings = useStore((s) => s.data.settings);
  const commit = useStore((s) => s.commit);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    commit(`Setting ${key}`, (d) => {
      d.settings[key] = value;
    });
  return (
    <>
      <h3>Scheduling</h3>
      <label className="check">
        <input type="checkbox" checked={!!settings.anyTime} onChange={(e) => set('anyTime', e.target.checked)} /> Tasks
        any time of day (only sleep, classes and other things on the calendar get in the way)
      </label>
      {!settings.anyTime && (
        <Row>
          <Field label="Tasks no earlier than">
            <input type="time" value={settings.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
          </Field>
          <Field
            label="Tasks no later than"
            hint={
              hmToMin(settings.dayEnd) <= hmToMin(settings.dayStart)
                ? `Next day: tasks go from ${settings.dayStart} to ${settings.dayEnd} the next morning`
                : 'Pick a time before the start (e.g. 02:00) to go past midnight'
            }
          >
            <input type="time" value={settings.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} />
          </Field>
        </Row>
      )}
      <Row>
        <Field label="Gap between things (min)">
          <NumberInput value={settings.bufferMin} onCommit={(v) => set('bufferMin', v)} />
        </Field>
        <Field label="Extra per trip (min)">
          <NumberInput value={settings.travelBufferMin} onCommit={(v) => set('travelBufferMin', v)} />
        </Field>
        <Field label="Unknown trip (min)">
          <NumberInput value={settings.defaultTravelMin} onCommit={(v) => set('defaultTravelMin', v)} />
        </Field>
      </Row>
    </>
  );
}
