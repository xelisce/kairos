// Keeps the app's data in the local database (server/index.mjs -> data/kairos.db).
// The browser copy (localStorage) is only a fallback for when the server isn't running;
// unsaved changes made then are pushed to the database once it's back.
import { create } from 'zustand';
import type { AppData } from '../types';
import { applyRemote, useStore } from '../store';
import { merge3 } from './merge';

export type SyncStatus = 'connecting' | 'saving' | 'saved' | 'offline';

export const useSync = create<{ status: SyncStatus; detail?: string }>(() => ({ status: 'connecting' }));

const META = 'kairos:sync:v1';
interface Meta {
  version: number;
  dirty: boolean;
}
const readMeta = (): Meta => {
  try {
    return { version: 0, dirty: false, ...JSON.parse(localStorage.getItem(META) ?? '{}') };
  } catch {
    return { version: 0, dirty: false };
  }
};
const writeMeta = (m: Meta) => {
  try {
    localStorage.setItem(META, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

let meta = readMeta();
let timer: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let again = false;
let remoteApplying = false;
/** The database's copy as of the last load or save: the common starting point when merging. */
let synced: { data: AppData; json: string } | undefined;
const remember = (data: AppData) => {
  synced = { data: structuredClone(data), json: JSON.stringify(data) };
};

/** Switch to the database's copy (another window changed it, and we have nothing unsaved). */
function takeRemote(data: AppData, version: number) {
  meta = { version, dirty: false };
  writeMeta(meta);
  remoteApplying = true;
  applyRemote(data);
  remoteApplying = false;
  // The app re-plans what it loads, so remember the copy as the app holds it.
  remember(useStore.getState().data);
}

const setStatus = (status: SyncStatus, detail?: string) => useSync.setState({ status, detail });

async function push() {
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = true;
  setStatus('saving');
  const sent = useStore.getState().data;
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: sent, baseVersion: meta.version }),
    });
    if (res.status === 409) {
      // Another window saved first: keep both windows' changes, then save the result.
      const cur = (await res.json()) as { data: AppData; version: number };
      const local = useStore.getState().data;
      // No starting point known (first save after being offline): keep everything from both.
      const merged = merge3(synced?.data ?? ({} as AppData), local, cur.data);
      meta = { version: cur.version, dirty: true };
      writeMeta(meta);
      remoteApplying = true;
      applyRemote(merged);
      remoteApplying = false;
      synced = { data: cur.data, json: JSON.stringify(cur.data) };
      again = true;
      setStatus('saving', 'Merged with changes from another window');
    } else if (res.ok) {
      const { version } = (await res.json()) as { version: number };
      meta = { version, dirty: false };
      writeMeta(meta);
      remember(sent);
      setStatus('saved');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    meta = { ...meta, dirty: true };
    writeMeta(meta);
    setStatus('offline');
    clearTimeout(retry);
    retry = setTimeout(push, 10_000);
  } finally {
    inFlight = false;
    if (again) {
      again = false;
      void push();
    }
  }
}

function schedulePush() {
  // Nothing really changed (the 5-minute re-plan often gives the same plan): don't save, so
  // other windows don't have to merge for nothing.
  if (synced && !meta.dirty && JSON.stringify(useStore.getState().data) === synced.json) return;
  meta = { ...meta, dirty: true };
  writeMeta(meta);
  clearTimeout(timer);
  timer = setTimeout(push, 400);
}

/** Load from the database, move browser-only data into it on first run, then save after every change. */
export async function startSync() {
  useStore.subscribe((s, p) => {
    if (s.data !== p.data && !remoteApplying) schedulePush();
  });
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cur = (await res.json()) as { data: AppData | null; version: number };
    if (cur.data === null || (meta.dirty && cur.version === meta.version)) {
      // First run (database empty) or offline edits on top of the latest version: upload ours.
      await push();
    } else {
      // A browser that has never synced may hold data the database doesn't have:
      // keep it recoverable before switching to the database's copy.
      if (meta.version === 0) {
        try {
          const local = localStorage.getItem('kairos:data:v1');
          if (local) localStorage.setItem('kairos:data:before-database', local);
        } catch {
          /* ignore */
        }
      }
      takeRemote(cur.data, cur.version);
      setStatus('saved');
    }
    // Coming back to this window: pick up what other windows saved meanwhile.
    window.addEventListener('focus', () => void pull());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void pull();
    });
  } catch {
    setStatus('offline');
    clearTimeout(retry);
    retry = setTimeout(startSyncRetry, 10_000);
  }
}

async function startSyncRetry() {
  // Server came back? Push offline edits, or load its copy if we have none.
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error();
    const cur = (await res.json()) as { data: AppData | null; version: number };
    if (cur.data === null || meta.dirty) await push();
    else {
      takeRemote(cur.data, cur.version);
      setStatus('saved');
    }
  } catch {
    retry = setTimeout(startSyncRetry, 10_000);
  }
}

/** Load the database's copy if another window saved since; unsaved changes here get merged on save. */
async function pull() {
  if (inFlight) return;
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return;
    const cur = (await res.json()) as { data: AppData | null; version: number };
    if (!cur.data || cur.version === meta.version) return;
    if (meta.dirty) void push();
    else takeRemote(cur.data, cur.version);
  } catch {
    /* offline: the next save retries */
  }
}
