// Sign in so the laptop and phone share the same data (saved in the cloud), or sign out.
import { useState } from 'react';
import { signIn, signOut, signUp, useAccount } from '../../lib/cloud';
import { KEPT_HERE } from '../../lib/native';
import { hasLocalDb, useSync } from '../../lib/sync';
import { Field, Modal, useUI } from '../ui';

export function AccountDialog() {
  const close = useUI((s) => s.close);
  const account = useAccount((s) => s.account);
  const status = useSync((s) => s.status);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (what: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await what();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const canSubmit = !busy && /\S+@\S+/.test(email) && password.length >= 6;
  const doSignIn = () => canSubmit && void run(() => signIn(email.trim(), password));
  const doSignUp = () =>
    canSubmit &&
    void run(async () => {
      const signedIn = await signUp(email.trim(), password);
      if (!signedIn) setNotice(`Check ${email.trim()} for a confirmation link, open it, then sign in here.`);
    });

  if (account) {
    return (
      <Modal title="Your account" onClose={close}>
        <p>
          Signed in as <strong>{account.email}</strong>.
        </p>
        <p className="muted small">
          {status === 'saved'
            ? 'Everything is saved in the cloud. Sign in with the same account on your other devices to see the same calendar.'
            : status === 'offline'
              ? `Can't reach the cloud right now. Changes are kept ${KEPT_HERE} and saved once you're back online.`
              : 'Saving to the cloud…'}
        </p>
        <div className="row-inline">
          <span className="spacer" />
          <button className="btn" onClick={() => void run(signOut)} disabled={busy}>
            Sign out
          </button>
        </div>
        <p className="muted small">
          {hasLocalDb
            ? 'Signing out goes back to the local database on this computer.'
            : `Signing out keeps changes only ${KEPT_HERE}.`}{' '}
          Your cloud data stays in your account.
        </p>
      </Modal>
    );
  }

  return (
    <Modal title="Sign in to sync" onClose={close}>
      <p className="muted small">
        Sign in to keep your calendar in the cloud, so your laptop and phone show the same thing. The first time,
        what&apos;s on this device is uploaded to your account.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSignIn();
        }}
      >
        <Field label="Email">
          <input type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="bad small">{error}</p>}
        {notice && <p className="small">{notice}</p>}
        <div className="row-inline">
          <button type="button" className="btn" onClick={doSignUp} disabled={!canSubmit}>
            Create account
          </button>
          <span className="spacer" />
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
