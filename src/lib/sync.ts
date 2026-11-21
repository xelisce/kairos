// Keeps the app's data saved: in the cloud (Supabase) when you're signed in, otherwise in the
// local database (server/index.mjs -> data/kairos.db). The browser copy (localStorage) is only a
// fallback for when neither can be reached; unsaved changes made then are saved once it's back.
import { create } from 'zustand';
import type { AppData } from '../types';
import { isNativeApp } from './native';
import { applyRemote, useStore } from '../store';
import { loadCloud, saveCloud, supabase, watchAccount, watchCloud, type Account, type SaveResult } from './cloud';
import { merge3 } from './merge';
import { readJson, readRaw, removeStored, writeStored } from './storage';

/** 'signedout': on the hosted site with nobody signed in, so changes stay in this browser only. */
export type SyncStatus = 'connecting' | 'saving' | 'saved' | 'offline' | 'signedout';

/**
 * The local database only exists when Kairos runs on this computer (npm run dev / npm start).
 * The Android app is also served from "localhost", but has no database server behind it.
 */
export const hasLocalDb = !isNativeApp && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

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
  /** Live updates: call `onVersion` when another device saves. Returns a function that stops it. */
  watch?(onVersion: (version: number) => void, onConnected: () => void): () => void;
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
  watch: (onVersion, onConnected) => watchCloud(account.id, onVersion, onConnected),
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
const readMeta = (key: string): Meta => ({ version: 0, dirty: false, ...readJson<Partial<Meta>>(key) });

let backend = localBackend;
let meta = readMeta(backend.metaKey);
const writeMeta = (m: Meta) => {
  meta = m;
  writeStored(backend.metaKey, m);
};

let timer: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let again = false;
let remoteApplying = false;
/**
 * The saved copy as of the last load or save: the common starting point when merging. Kept in
 * localStorage too, so edits made offline merge properly even after the app was closed.
 */
let synced: { data: AppData; json: string } | undefined;
const baseKey = () => `${backend.metaKey}:base`;
function setSynced(data: AppData | undefined) {
  synced = data && { data: structuredClone(data), json: JSON.stringify(data) };
  // If storage is full, merging after a restart just keeps a bit more from both sides.
  if (synced) writeStored(baseKey(), synced.json);
  else removeStored(baseKey());
}
function readSynced() {
  const json = readRaw(baseKey());
  try {
    synced = json ? { data: JSON.parse(json) as AppData, json } : undefined;
  } catch {
    synced = undefined;
  }
}
let unwatch: (() => void) | undefined;

/** Show data that came from the saved copy, without that counting as an edit to save. */
function applyQuietly(data: AppData) {
  remoteApplying = true;
  applyRemote(data);
  remoteApplying = false;
}

/** Switch to the saved copy (another window or device changed it, and we have nothing unsaved). */
function takeRemote(data: AppData, version: number) {
  writeMeta({ version, dirty: false });
  applyQuietly(data);
  // The app re-plans what it loads, so remember the copy as the app holds it.
  setSynced(useStore.getState().data);
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
      applyQuietly(merged);
      setSynced(res.data);
      again = true;
      setStatus('saving', 'Merged with changes from another window');
    } else {
      writeMeta({ version: res.version, dirty: false });
      setSynced(sent);
      setStatus('saved');
    }
  } catch {
    if (b !== backend) return;
    writeMeta({ ...meta, dirty: true });
    setStatus('offline');
    clearTimeout(retry);
    retry = setTimeout(push, 10_000);
  } finally {
    // Signed in or out meanwhile: the new place has its own save going, so leave it alone.
    if (b === backend) inFlight = false;
    if (b === backend && again) {
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
        writeStored(`kairos:data:before-${b.cloud ? 'cloud' : 'database'}`, useStore.getState().data);
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
function switchBackend(next: Backend | null) {
  clearTimeout(timer);
  clearTimeout(retry);
  unwatch?.();
  unwatch = undefined;
  if (!next) {
    backend = signedOutBackend;
    meta = { version: 0, dirty: false };
    synced = undefined;
    setStatus('signedout');
    return;
  }
  backend = next;
  meta = readMeta(next.metaKey);
  readSynced();
  inFlight = false;
  again = false;
  setStatus('connecting');
  void connect();
  // Another device saved: load it now (or merge, if there are unsaved changes here).
  unwatch = next.watch?.(
    (version) => {
      if (version !== meta.version) void pull();
    },
    () => void pull(),
  );
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
  // Back online: save what was changed offline (or load what changed elsewhere) right away.
  window.addEventListener('online', () => {
    if (useSync.getState().status !== 'offline') return;
    clearTimeout(retry);
    void (meta.dirty ? push() : connect());
  });
  if (!supabase) {
    readSynced();
    void connect();
    return;
  }
  // Supabase reports the saved sign-in (or none) first, then every sign-in and sign-out.
  watchAccount((account) => switchBackend(account ? cloudBackend(account) : hasLocalDb ? localBackend : null));
}
