// Settings > Notifications: on or off for this device, and when they come, separately for the
// Android app and the website.
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../../store';
import type { NotifySettings, RoutineCategory } from '../../types';
import { ROUTINE_ICONS, notifyOf, type NotifyWhere } from '../../lib/notifications';
import { notifyOn, permission, sendTest, setNotifyOn, type Permission } from '../../lib/notify';
import { isNativeApp } from '../../lib/native';
import { NumberInput } from '../ui';

type Flag = { [K in keyof NotifySettings]: NotifySettings[K] extends boolean ? K : never }[keyof NotifySettings];
type Num = { [K in keyof NotifySettings]: NotifySettings[K] extends number ? K : never }[keyof NotifySettings];

const ROUTINE_NAMES: Record<RoutineCategory, string> = {
  meal: 'Meals',
  hygiene: 'Shower & hygiene',
  sleep: 'Sleep',
  chores: 'Chores',
  exercise: 'Exercise',
  other: 'Other',
};
const HERE: NotifyWhere = isNativeApp ? 'app' : 'web';
const PLACES: { id: NotifyWhere; label: string }[] = [
  { id: 'app', label: '📱 Android app' },
  { id: 'web', label: '🌐 Website' },
];

export function NotificationsSection() {
  const settings = useStore((s) => s.data.settings);
  const commit = useStore((s) => s.commit);
  const [where, setWhere] = useState<NotifyWhere>(HERE);
  const n = notifyOf(settings, where);
  const changed = settings.notifications?.[where] !== undefined;
  const set = <K extends keyof NotifySettings>(key: K, value: NotifySettings[K]) =>
    commit(`Notifications ${key}`, (d) => {
      const all = d.settings.notifications ?? {};
      d.settings.notifications = { ...all, [where]: { ...all[where], [key]: value } };
    });

  const check = (key: Flag, label: ReactNode, extra?: ReactNode) => (
    <div className="notify-row">
      <label className="check">
        <input type="checkbox" checked={n[key]} onChange={(e) => set(key, e.target.checked)} /> {label}
      </label>
      {n[key] && extra}
    </div>
  );
  const num = (key: Num, unit: string, max = 600) => (
    <span className="notify-num">
      <NumberInput className="notify-min" max={max} value={n[key]} onCommit={(v) => set(key, v)} aria-label={unit} />{' '}
      {unit}
    </span>
  );

  return (
    <>
      <h3>Notifications</h3>
      <DeviceSwitch />

      <div className="segmented" role="radiogroup" aria-label="Settings for">
        {PLACES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={where === p.id}
            className={where === p.id ? 'on' : ''}
            onClick={() => setWhere(p.id)}
          >
            {p.label}
            {p.id === HERE ? ' (here)' : ''}
          </button>
        ))}
      </div>
      <p className="muted small">
        {where === 'app'
          ? 'In the Android app they come on time even when it’s closed.'
          : 'On the website they come while a Kairos tab is open (it can be in the background).'}{' '}
        {changed && (
          <button
            type="button"
            className="linkish"
            onClick={() =>
              commit(`Reset ${where} notifications`, (d) => {
                if (d.settings.notifications) delete d.settings.notifications[where];
              })
            }
          >
            Reset to the usual
          </button>
        )}
      </p>

      <h4 className="plans-head">Getting there</h4>
      {check(
        'leave',
        'Time to leave',
        <span className="notify-num">heads-up {num('leaveMin', 'min before', 120)}, then “Leave now”</span>,
      )}
      {check('classes', 'Classes', num('classMin', 'min before', 240))}
      {n.classes && <Sub>{check('classSkipIfLeave', 'Not when I already got “Time to leave” for it')}</Sub>}
      {check('ccas', 'CCA / club sessions', num('ccaMin', 'min before', 240))}
      {n.ccas && <Sub>{check('ccaSkipIfLeave', 'Not when I already got “Time to leave” for it')}</Sub>}
      {check('events', 'Events (hangouts, appointments, meetings)', num('eventMin', 'min before', 1440))}
      {check('exams', 'Exams, quizzes, presentations', num('examMin', 'min before', 1440))}
      {n.exams && (
        <Sub>
          {check(
            'examEvening',
            'Also the evening before',
            <span className="notify-num">
              at{' '}
              <input
                type="time"
                value={n.examEveningAt}
                onChange={(e) => e.target.value && set('examEveningAt', e.target.value)}
              />
            </span>,
          )}
        </Sub>
      )}

      <h4 className="plans-head">Your day</h4>
      <div className="notify-row">
        <span>Routines when they start:</span>
      </div>
      <div className="notify-chips">
        {(Object.keys(ROUTINE_NAMES) as RoutineCategory[]).map((c) => (
          <label key={c} className="check">
            <input
              type="checkbox"
              checked={n.routines[c]}
              onChange={(e) => set('routines', { ...n.routines, [c]: e.target.checked })}
            />{' '}
            {ROUTINE_ICONS[c]} {ROUTINE_NAMES[c]}
          </label>
        ))}
      </div>
      {check('windDown', 'Wind down before sleep', num('windDownMin', 'min before', 240))}
      {check('sessionStart', 'Task session starting')}
      {check('sessionEnd', 'Task session ending: “Done?” with ✓ Done and +15 min')}
      {n.sessionEnd && (
        <p className="muted small sub">+15 min makes the session longer and adds the time to the task’s total.</p>
      )}
      {check(
        'deadlines',
        'Deadlines of tasks not done yet',
        <span className="notify-num">
          <NumberInput
            className="notify-min"
            max={720}
            value={n.deadlineHours[0]}
            onCommit={(v) => set('deadlineHours', [v, n.deadlineHours[1]])}
            aria-label="First reminder, hours before"
          />{' '}
          and{' '}
          <NumberInput
            className="notify-min"
            max={720}
            value={n.deadlineHours[1]}
            onCommit={(v) => set('deadlineHours', [n.deadlineHours[0], v])}
            aria-label="Second reminder, hours before"
          />{' '}
          h before
        </span>,
      )}

      <h4 className="plans-head">Trips</h4>
      {check('flights', '✈️ Flights', num('flightHours', 'h before', 168))}
      {check('plans', '🚆 Trains, buses, drives, other plans', num('planMin', 'min before', 1440))}

      <h4 className="plans-head">Quiet</h4>
      {check(
        'quiet',
        'Quiet hours',
        <span className="notify-num">
          <input
            type="time"
            aria-label="Quiet from"
            value={n.quietStart}
            onChange={(e) => e.target.value && set('quietStart', e.target.value)}
          />
          –
          <input
            type="time"
            aria-label="Quiet until"
            value={n.quietEnd}
            onChange={(e) => e.target.value && set('quietEnd', e.target.value)}
          />
        </span>,
      )}
      {check('quietSleep', 'Quiet while I’m asleep (the sleep routine)')}
      <div className="notify-row">
        <span>Snooze for</span> {num('snoozeMin', 'min', 240)}
      </div>
      <p className="muted small">
        Nothing for skipped sessions or while you’re away. Ones a few minutes apart come together.
      </p>
    </>
  );
}

const Sub = ({ children }: { children: ReactNode }) => <div className="sub">{children}</div>;

/** On or off here, with the permission that needs. */
function DeviceSwitch() {
  const [on, setOn] = useState(notifyOn);
  const [perm, setPerm] = useState<Permission>('prompt');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void permission().then(setPerm);
  }, [on]);
  const toggle = async (want: boolean) => {
    setBusy(true);
    try {
      setOn(await setNotifyOn(want));
      setPerm(await permission());
    } finally {
      setBusy(false);
    }
  };
  const blocked = perm === 'denied';
  return (
    <>
      <div className="notify-row">
        <label className="check">
          <input
            type="checkbox"
            checked={on && !blocked}
            disabled={busy || perm === 'unsupported'}
            onChange={(e) => void toggle(e.target.checked)}
          />{' '}
          <b>Notifications on this {isNativeApp ? 'phone' : 'browser'}</b>
        </label>
        {on && !blocked && (
          <button type="button" className="chip" onClick={() => void sendTest()}>
            Send a test
          </button>
        )}
      </div>
      {blocked && (
        <p className="warn small">
          {isNativeApp
            ? 'Notifications are blocked for Kairos. Allow them in the phone’s Settings → Apps → Kairos → Notifications.'
            : 'This browser blocks notifications from Kairos. Allow them in the site settings (the icon left of the address).'}
        </p>
      )}
      {perm === 'unsupported' && <p className="muted small">This browser can’t show notifications.</p>}
    </>
  );
}
