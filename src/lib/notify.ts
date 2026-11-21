// Delivering notifications (what lib/notifications.ts works out).
// - Android app: exact phone alarms a week ahead, set again whenever the calendar changes or the
//   app comes back to the front. They come on time even with the app closed.
// - Website: while a Kairos tab is open (it can be in the background), checked every 20 seconds.
// Turning them on is per device (each asks its own permission); when they come is in your settings.
import { addDays, addMinutes } from 'date-fns';
import { useStore } from '../store';
import { readJson, writeStored } from './storage';
import { isNativeApp } from './native';
import { EXTEND_MIN, NOTE_COLORS, notifyOf, planNotes, type Note } from './notifications';
import { extendSession, markSessionDone } from './actions';

const DEVICE_KEY = 'kairos:notify';
const SNOOZE_KEY = 'kairos:notify:snoozed';
const WHERE = isNativeApp ? 'app' : 'web';
/** How far ahead the phone's alarms are set. */
const APP_DAYS = 7;
/** Android keeps at most 500 alarms per app; stay well under. */
const APP_MAX = 300;
const WEB_TICK_MS = 20_000;
/** A notification missed by more than this (computer asleep) isn't sent late. */
const WEB_LATE_MS = 5 * 60_000;
const CHANNEL = 'kairos';
type SavedNote = Omit<Note, 'at'> & { at: number };

// ---------- On this device ----------

export const notifyOn = () => readJson<{ on: boolean }>(DEVICE_KEY)?.on === true;

export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function permission(): Promise<Permission> {
  if (isNativeApp) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

/** Turn notifications on or off on this device (on asks for permission). Returns whether they're on. */
export async function setNotifyOn(on: boolean): Promise<boolean> {
  if (on) {
    let ok: boolean;
    if (isNativeApp) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      ok = (await LocalNotifications.requestPermissions()).display === 'granted';
    } else {
      ok = 'Notification' in window && (await Notification.requestPermission()) === 'granted';
    }
    if (!ok) return false;
  }
  writeStored(DEVICE_KEY, { on });
  void reschedule();
  return on;
}

// ---------- Snoozed ones (kept so a re-plan doesn't drop them) ----------

const snoozed = (): Note[] =>
  (readJson<SavedNote[]>(SNOOZE_KEY) ?? [])
    .map((n) => ({ ...n, at: new Date(n.at) }))
    .filter((n) => n.at.getTime() > Date.now() - WEB_LATE_MS);

function snooze(note: Note) {
  const min = notifyOf(useStore.getState().data.settings, WHERE).snoozeMin;
  const again: Note = { ...note, id: `${note.id}:snooze:${Date.now()}`, at: addMinutes(new Date(), min) };
  writeStored(
    SNOOZE_KEY,
    [...snoozed(), again].map((n) => ({ ...n, at: n.at.getTime() })),
  );
  void reschedule();
}

function upcoming(from: Date, to: Date): Note[] {
  const data = useStore.getState().data;
  const later = snoozed().filter((n) => n.at >= from && n.at < to);
  return [...planNotes(data, from, to, notifyOf(data.settings, WHERE)), ...later].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
}

/** What a button on a notification does. */
function act(action: string, note: Note) {
  const s = note.session;
  if (action === 'snooze') snooze(note);
  else if (action === 'done' && s) markSessionDone(s.taskId, s.sessionId);
  else if (action === 'extend' && s) extendSession(s.taskId, s.sessionId, EXTEND_MIN);
}

export const TEST_NOTE: Note = {
  id: 'test',
  at: new Date(),
  kind: 'session',
  title: '🔔 Notifications are on',
  body: 'This is how Kairos will tell you when to leave, eat, start and stop.',
};

// ---------- Android app ----------

/** Android wants a number for each notification. */
function numId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000 || 1;
}

// Wrapped in an object: a Capacitor plugin answers to any name, `then` too, so a promise that
// resolves to the plugin itself would wait forever.
let appReady: Promise<{ ln: typeof import('@capacitor/local-notifications').LocalNotifications }> | null = null;
function appPlugin() {
  appReady ??= import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Reminders',
      description: 'When to leave, classes, routines, task sessions and deadlines',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#6d5dfc',
    });
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'session',
          actions: [
            { id: 'done', title: '✓ Done' },
            { id: 'extend', title: `+${EXTEND_MIN} min` },
            { id: 'snooze', title: 'Snooze' },
          ],
        },
        { id: 'basic', actions: [{ id: 'snooze', title: 'Snooze' }] },
      ],
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      const note = notification.extra as SavedNote | undefined;
      if (note) act(actionId, { ...note, at: new Date(note.at) });
    });
    return { ln: LocalNotifications };
  });
  return appReady;
}

const toApp = (n: Note) => ({
  id: numId(n.id),
  title: n.title,
  body: n.body,
  largeBody: n.body,
  schedule: { at: n.at, allowWhileIdle: true },
  smallIcon: 'ic_stat_kairos',
  iconColor: NOTE_COLORS[n.kind],
  channelId: CHANNEL,
  actionTypeId: n.session ? 'session' : 'basic',
  extra: { ...n, at: n.at.getTime() } satisfies SavedNote,
});

async function scheduleApp() {
  const { ln } = await appPlugin();
  const { notifications: pending } = await ln.getPending();
  if (pending.length) await ln.cancel({ notifications: pending.map((p) => ({ id: p.id })) });
  if (!notifyOn() || (await permission()) !== 'granted') return;
  const now = new Date();
  const notes = upcoming(addMinutes(now, 0.2), addDays(now, APP_DAYS)).slice(0, APP_MAX);
  if (notes.length) await ln.schedule({ notifications: notes.map(toApp) });
}

// ---------- Website ----------

let webNotes: Note[] = [];
let lastTick = Date.now();

async function showWeb(n: Note) {
  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: n.body,
    tag: n.id, // two open tabs show it once
    icon: '/notify-icon.png',
    badge: '/notify-badge.png',
    data: { ...n, at: n.at.getTime() } satisfies SavedNote,
    actions: n.session
      ? [
          { action: 'done', title: '✓ Done' },
          { action: 'extend', title: `+${EXTEND_MIN} min` },
        ]
      : [{ action: 'snooze', title: 'Snooze' }],
  };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) return reg.showNotification(n.title, options);
  // No service worker (running on this computer): a plain one, without buttons.
  const { actions: _ignored, ...plain } = options;
  void _ignored;
  const shown = new Notification(n.title, plain);
  shown.onclick = () => window.focus();
}

function tickWeb() {
  const now = Date.now();
  if (notifyOn() && Notification.permission === 'granted')
    for (const n of webNotes) {
      const t = n.at.getTime();
      if (t > lastTick && t <= now && t > now - WEB_LATE_MS) void showWeb(n);
    }
  lastTick = now;
}

// ---------- Keeping them up to date ----------

let timer: ReturnType<typeof setTimeout> | undefined;
/** Work the notifications out again (soon, so a burst of edits does it once). */
export function reschedule() {
  clearTimeout(timer);
  return new Promise<void>((done) => {
    timer = setTimeout(async () => {
      try {
        if (isNativeApp) await scheduleApp();
        else webNotes = notifyOn() ? upcoming(new Date(Date.now() - WEB_LATE_MS), addDays(new Date(), 1)) : [];
      } catch (e) {
        console.warn('Notifications could not be set', e);
      }
      done();
    }, 1500);
  });
}

/** Show one right now, to see what they look like. */
export async function sendTest() {
  const n = { ...TEST_NOTE, id: `test:${Date.now()}`, at: new Date(Date.now() + 1500) };
  if (isNativeApp) await (await appPlugin()).ln.schedule({ notifications: [toApp(n)] });
  else await showWeb(n);
}

export function startNotifications() {
  useStore.subscribe((s, p) => {
    if (s.data !== p.data) void reschedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reschedule();
  });
  // The next day comes into view, and things roll forward.
  setInterval(() => void reschedule(), 15 * 60_000);
  if (isNativeApp) void appPlugin();
  else if ('Notification' in window) {
    setInterval(tickWeb, WEB_TICK_MS);
    // Buttons pressed on a notification come here through the service worker.
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as { type?: string; action?: string; note?: SavedNote };
      if (msg?.type === 'kairos-notification' && msg.action && msg.note)
        act(msg.action, { ...msg.note, at: new Date(msg.note.at) });
    });
  }
  void reschedule();
}
