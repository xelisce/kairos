// Keeps the app's data saved: in the cloud (Supabase) when you're signed in, otherwise in the
// local database (server/index.mjs -> data/kairos.db). The browser copy (localStorage) is only a
// fallback for when neither can be reached; unsaved changes made then are saved once it's back.
import { create } from 'zustand';
import type { AppData } from '../types';
import { applyRemote, useStore } from '../store';
import { loadCloud, saveCloud, supabase, watchAccount, type Account, type SaveResult } from './cloud';
import { merge3 } from './merge';

/** 'signedout': on the hosted site with nobody signed in, so changes stay in this browser only. */
export type SyncStatus = 'connecting' | 'saving' | 'saved' | 'offline' | 'signedout';

/** The local database only exists when Kairos runs on this computer (npm run dev / npm start). */
export const hasLocalDb = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export const useSync = create<{ status: SyncStatus; cloud: boolean; detail?: string }>(() => ({
  status: 'connecting',
  cloud: false,
}));

/** Where the data is saved: the local database, or your cloud account. */
interface Backend {
  /** Where this backend's sync state is kept in localStorage. */
  metaKey: string;
  cloud: boolean;
  load(): Promise<{ data: AppData | null; version: number }>;
  save(data: AppData, baseVersion: number): Promise<SaveResult>;
}

const localBackend: Backend = {
  metaKey: 'kairos:sync:v1',
  cloud: false,
  async load() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { data: AppData | null; version: number };
  },
  async save(data, baseVersion) {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseVersion }),
    });
    if (res.status === 409) return { conflict: true, ...((await res.json()) as { data: AppData; version: number }) };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { version: number };
  },
};

const cloudBackend = (account: Account): Backend => ({
  metaKey: `kairos:sync:cloud:${account.id}`,
  cloud: true,
  load: loadCloud,
  save: saveCloud,
});

/** Hosted site, signed out: saves go nowhere (the browser copy still keeps them). */
const signedOutBackend: Backend = {
  metaKey: 'kairos:sync:none',
  cloud: false,
  load: () => Promise.reject(new Error('signed out')),
  save: () => Promise.reject(new Error('signed out')),
};

interface Meta {
  version: number;
  dirty: boolean;
}
const readMeta = (key: string): Meta => {
  try {
    return { version: 0, dirty: false, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return { version: 0, dirty: false };
  }
};

let backend = localBackend;
let meta = readMeta(backend.metaKey);
const writeMeta = (m: Meta) => {
  meta = m;
  try {
    localStorage.setItem(backend.metaKey, JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

let timer: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let again = false;
let remoteApplying = false;
/** The saved copy as of the last load or save: the common starting point when merging. */
let synced: { data: AppData; json: string } | undefined;
const remember = (data: AppData) => {
  synced = { data: structuredClone(data), json: JSON.stringify(data) };
};

/** Switch to the saved copy (another window or device changed it, and we have nothing unsaved). */
function takeRemote(data: AppData, version: number) {
  writeMeta({ version, dirty: false });
  remoteApplying = true;
  applyRemote(data);
  remoteApplying = false;
  // The app re-plans what it loads, so remember the copy as the app holds it.
  remember(useStore.getState().data);
}

const setStatus = (status: SyncStatus, detail?: string) => useSync.setState({ status, detail, cloud: backend.cloud });

async function push() {
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = true;
  setStatus('saving');
  const b = backend;
  const sent = useStore.getState().data;
  try {
    const res = await b.save(sent, meta.version);
    if (b !== backend) return; // signed in or out meanwhile: the new place loads on its own
    if (res.conflict) {
      // Another window or device saved first: keep both sides' changes, then save the result.
      const local = useStore.getState().data;
      // No starting point known (first save after being offline): keep everything from both.
      const merged = merge3(synced?.data ?? ({} as AppData), local, res.data);
      writeMeta({ version: res.version, dirty: true });
      remoteApplying = true;
      applyRemote(merged);
      remoteApplying = false;
      synced = { data: res.data, json: JSON.stringify(res.data) };
      again = true;
      setStatus('saving', 'Merged with changes from another window');
    } else {
      writeMeta({ version: res.version, dirty: false });
      remember(sent);
      setStatus('saved');
    }
  } catch {
    if (b !== backend) return;
    writeMeta({ ...meta, dirty: true });
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
  if (backend === signedOutBackend) return;
  // Nothing really changed (the 5-minute re-plan often gives the same plan): don't save, so
  // other windows don't have to merge for nothing.
  if (synced && !meta.dirty && JSON.stringify(useStore.getState().data) === synced.json) return;
  writeMeta({ ...meta, dirty: true });
  clearTimeout(timer);
  timer = setTimeout(push, 400);
}

/** Load from where the data is saved; upload ours if it's empty there, or if we have unsaved edits on top. */
async function connect() {
  const b = backend;
  try {
    const cur = await b.load();
    if (b !== backend) return;
    if (cur.data === null || meta.dirty) {
      // Nothing saved there yet, or edits made while offline: upload ours (merged with theirs if
      // it changed meanwhile).
      await push();
    } else {
      // A place this browser has never synced with may not have what's on screen now:
      // keep it recoverable before switching to the saved copy.
      if (meta.version === 0) {
        try {
          localStorage.setItem(
            `kairos:data:before-${b.cloud ? 'cloud' : 'database'}`,
            JSON.stringify(useStore.getState().data),
          );
        } catch {
          /* ignore */
        }
      }
      takeRemote(cur.data, cur.version);
      setStatus('saved');
    }
  } catch {
    if (b !== backend) return;
    setStatus('offline');
    clearTimeout(retry);
    retry = setTimeout(connect, 10_000);
  }
}

/** Start saving somewhere else (after signing in or out); null: nowhere, until you sign in. */
function useBackend(next: Backend | null) {
  clearTimeout(timer);
  clearTimeout(retry);
  if (!next) {
    backend = signedOutBackend;
    meta = { version: 0, dirty: false };
    synced = undefined;
    setStatus('signedout');
    return;
  }
  backend = next;
  meta = readMeta(next.metaKey);
  synced = undefined;
  inFlight = false;
  again = false;
  setStatus('connecting');
  void connect();
}

/** Load the saved copy if another window or device saved since; unsaved changes here get merged on save. */
async function pull() {
  if (inFlight || backend === signedOutBackend) return;
  const b = backend;
  try {
    const cur = await b.load();
    if (b !== backend || !cur.data || cur.version === meta.version) return;
    if (meta.dirty) void push();
    else takeRemote(cur.data, cur.version);
  } catch {
    /* offline: the next save retries */
  }
}

/** Save after every change, to the cloud when signed in, else to the local database. */
export function startSync() {
  useStore.subscribe((s, p) => {
    if (s.data !== p.data && !remoteApplying) schedulePush();
  });
  // Coming back to this window: pick up what other windows saved meanwhile.
  window.addEventListener('focus', () => void pull());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pull();
  });
  if (!supabase) {
    void connect();
    return;
  }
  // Supabase reports the saved sign-in (or none) first, then every sign-in and sign-out.
  watchAccount((account) => useBackend(account ? cloudBackend(account) : hasLocalDb ? localBackend : null));
}
