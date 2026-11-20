// Kairos in the cloud (Supabase): your account, and your data stored under it, so the laptop
// and phone share the same calendar. Keys come from .env.local (see supabase/schema.sql).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { AppData } from '../types';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;

/** null when this build has no cloud keys: the app then only uses the local database. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

/** The client, for calls that only happen once the cloud is in use (signed in, or signing in). */
function client(): SupabaseClient {
  if (!supabase) throw new Error('This build has no cloud keys (VITE_SUPABASE_URL in .env.local).');
  return supabase;
}

// --- Account ---

export interface Account {
  id: string;
  email: string;
}

/** Who's signed in. `ready` is false until the saved sign-in (if any) has been checked. */
export const useAccount = create<{ ready: boolean; account: Account | null }>(() => ({
  ready: !supabase,
  account: null,
}));

// --- Your data ---

export type SaveResult = { version: number; conflict?: false } | { conflict: true; data: AppData; version: number };

export async function loadCloud(): Promise<{ data: AppData | null; version: number }> {
  const { data, error } = await client().from('kairos_data').select('data, version').maybeSingle();
  if (error) throw error;
  return data ? { data: data.data as AppData, version: data.version as number } : { data: null, version: 0 };
}

export async function saveCloud(data: AppData, baseVersion: number): Promise<SaveResult> {
  const { data: res, error } = await client().rpc('kairos_save', { base_version: baseVersion, new_data: data });
  if (error) throw error;
  return res as SaveResult;
}

// --- Signing in ---

/** Plain-language versions of Supabase's sign-in errors. */
function explain(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link Supabase sent you.';
  if (/already registered/i.test(message)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'The password needs at least 6 characters.';
  if (/rate limit/i.test(message)) return 'Too many emails sent. Wait an hour, then try again.';
  return message;
}

export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw new Error(explain(error.message));
}

/** Returns true if you're signed in straight away, false if you need to confirm your email first. */
export async function signUp(email: string, password: string) {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(explain(error.message));
  // Supabase hides "already registered" by returning a user with no identities.
  if (data.user && !data.user.identities?.length) throw new Error(explain('already registered'));
  return !!data.session;
}

export async function signOut() {
  await client().auth.signOut();
}

/** Keep useAccount up to date, and tell sync whenever a different account (or none) is signed in. */
export function watchAccount(onChange: (account: Account | null) => void) {
  if (!supabase) return;
  let current: string | null | undefined;
  supabase.auth.onAuthStateChange((_event, session) => {
    const account = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
    useAccount.setState({ ready: true, account });
    if ((account?.id ?? null) === current) return; // token refresh etc.: same account
    current = account?.id ?? null;
    // Supabase asks not to call it from inside this callback, so let it finish first.
    setTimeout(() => onChange(account), 0);
  });
}

// --- Backups ---

/** Your account's automatic backups (hourly, newest first). */
export async function listCloudBackups(): Promise<{ id: number; created_at: string }[]> {
  const { data, error } = await client()
    .from('kairos_backups')
    .select('id, created_at')
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function loadCloudBackup(id: number): Promise<AppData> {
  const { data, error } = await client().from('kairos_backups').select('data').eq('id', id).single();
  if (error) throw error;
  return data.data as AppData;
}

// --- Live updates ---

/**
 * Hear about saves to your row from other devices, within seconds. `onVersion` gets the new
 * version number; `onConnected` runs each time the live connection is (re)established, since
 * saves made while it was down weren't heard. Returns a function that stops listening.
 */
export function watchCloud(userId: string, onVersion: (version: number) => void, onConnected: () => void) {
  const db = client();
  const channel = db
    .channel(`kairos-data-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kairos_data', filter: `user_id=eq.${userId}` },
      (payload) => {
        const version = (payload.new as { version?: number } | null)?.version;
        if (typeof version === 'number') onVersion(version);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onConnected();
    });
  return () => void db.removeChannel(channel);
}
