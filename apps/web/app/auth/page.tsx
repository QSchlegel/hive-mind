"use client";

import { FormEvent, useMemo, useState } from "react";
import { authClient } from "@/lib/better-auth-client";

export default function AuthPage() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAuthed = Boolean(session?.user);
  const callbackURL = useMemo(() => "/treasury/account", []);

  async function onMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("Sending magic link...");

    const result = await authClient.signIn.magicLink({
      email,
      callbackURL
    });

    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not send magic link");
      return;
    }

    setStatus("Magic link sent. Check your inbox.");
  }

  async function onPasskeySignIn() {
    setError(null);
    setStatus("Requesting passkey...");
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Passkey sign-in failed");
      return;
    }
    setStatus("Signed in with passkey.");
  }

  async function onAddPasskey() {
    setError(null);
    setStatus("Creating passkey...");
    const result = await authClient.passkey.addPasskey();
    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not add passkey");
      return;
    }
    setStatus("Passkey added to your account.");
  }

  async function onSignOut() {
    setError(null);
    setStatus("Signing out...");
    const result = await authClient.signOut();
    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not sign out");
      return;
    }
    setStatus("Signed out.");
  }

  return (
    <main>
      <div className="page-header">
        <span className="kicker">Identity</span>
        <h1>Passkey and email login</h1>
        <p>Sign in with passkey first. If your device doesn&apos;t support it, use a magic-link email fallback.</p>
      </div>

      <section className="card section">
        <h2>Session</h2>
        {isPending ? <p>Checking session...</p> : null}
        {isAuthed ? (
          <>
            <p>
              Signed in as <strong>{session?.user.email}</strong>
            </p>
            <div className="actions">
              <button className="btn btn-primary" type="button" onClick={onAddPasskey}>
                Add passkey
              </button>
              <button className="btn btn-secondary" type="button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="actions">
              <button className="btn btn-primary" type="button" onClick={onPasskeySignIn}>
                Sign in with passkey
              </button>
            </div>
            <form onSubmit={onMagicLinkSubmit} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", maxWidth: 420 }}>
              <label htmlFor="magic-email">Magic-link fallback email</label>
              <input
                id="magic-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button className="btn btn-secondary" type="submit">
                Send magic link
              </button>
            </form>
          </>
        )}

        {status ? <p style={{ color: "var(--success)" }}>{status}</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>
    </main>
  );
}

