"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/better-auth-client";

type AuthMode = "sign-up" | "sign-in";
type BusyAction =
  | "sign-up-link"
  | "sign-in-link"
  | "sign-in-passkey"
  | "register-signup-passkey"
  | "sign-out";

function parseModeParam(value: string | null): AuthMode | null {
  if (!value) {
    return null;
  }

  if (value === "sign-up" || value === "signup" || value === "register") {
    return "sign-up";
  }

  if (value === "sign-in" || value === "signin" || value === "login") {
    return "sign-in";
  }

  return null;
}

function FingerprintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 6.25A3.5 3.5 0 0 1 8 2.75a3.5 3.5 0 0 1 3.5 3.5v.85m-7.25 1.1v.95c0 1.38-.43 2.73-1.24 3.85m9.98-5.75v2.55a4.95 4.95 0 0 1-1.51 3.56m-4.82-4.8v1.92a5.5 5.5 0 0 1-.95 3.06m2.6-7.24a1.8 1.8 0 0 1 1.79 1.8v4.06"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) {
    return "Hive Mind Member";
  }

  const spaced = localPart.replace(/[._-]+/g, " ").trim();
  if (!spaced) {
    return "Hive Mind Member";
  }

  return spaced
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function generateSignupPassword(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `Hm!${crypto.randomUUID()}A9#`;
  }

  return `Hm!${Math.random().toString(36).slice(2)}A9#`;
}

function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-up");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signInEmail, setSignInEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);

  const isAuthed = Boolean(session?.user);
  const callbackURL = "/account";
  const normalizedSignUpEmail = useMemo(() => signUpEmail.trim().toLowerCase(), [signUpEmail]);
  const normalizedSignInEmail = useMemo(() => signInEmail.trim().toLowerCase(), [signInEmail]);
  const isBusy = busyAction !== null;
  const modeParam = searchParams.get("mode");

  useEffect(() => {
    const nextMode = parseModeParam(modeParam);
    if (nextMode) {
      setMode(nextMode);
    }
  }, [modeParam]);

  useEffect(() => {
    if (!isPending && isAuthed) {
      router.replace(callbackURL);
    }
  }, [isPending, isAuthed, router, callbackURL]);

  async function sendMagicLink(email: string, intent: "sign-up" | "sign-in") {
    return authClient.signIn.magicLink(
      intent === "sign-up"
        ? {
            email,
            name: deriveNameFromEmail(email),
            callbackURL,
            newUserCallbackURL: callbackURL
          }
        : {
            email,
            callbackURL
          }
    );
  }

  async function onSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!normalizedSignUpEmail) {
      setStatus(null);
      setError("Enter an email to create your account.");
      return;
    }

    setBusyAction("sign-up-link");
    setStatus("Sending sign-up link...");
    const result = await sendMagicLink(normalizedSignUpEmail, "sign-up");
    setBusyAction(null);

    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not send sign-up link");
      return;
    }

    setStatus("Sign-up link sent. Open it from your inbox to finish account setup.");
  }

  async function onSignInMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!normalizedSignInEmail) {
      setStatus(null);
      setError("Enter your email to get a sign-in link.");
      return;
    }

    setBusyAction("sign-in-link");
    setStatus("Sending sign-in link...");
    const result = await sendMagicLink(normalizedSignInEmail, "sign-in");
    setBusyAction(null);

    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not send sign-in link");
      return;
    }

    setStatus("Sign-in link sent. Check your inbox.");
  }

  async function onPasskeySignIn() {
    if (isAuthed) {
      setError(null);
      setStatus("You are already signed in.");
      return;
    }

    setError(null);
    setStatus("Requesting passkey...");
    setBusyAction("sign-in-passkey");
    const result = await authClient.signIn.passkey();
    setBusyAction(null);

    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Passkey sign-in failed");
      return;
    }

    setStatus("Signed in with passkey.");
    router.replace(callbackURL);
  }

  async function onSignUpPasskeyRegister() {
    setBusyAction("register-signup-passkey");
    setError(null);

    if (!isAuthed) {
      if (!normalizedSignUpEmail) {
        setBusyAction(null);
        setStatus(null);
        setError("Enter an email first, then tap fingerprint.");
        return;
      }

      setStatus("Creating account for passkey setup...");
      const signUpResult = await authClient.signUp.email({
        email: normalizedSignUpEmail,
        name: deriveNameFromEmail(normalizedSignUpEmail),
        password: generateSignupPassword()
      });

      if (signUpResult.error) {
        setBusyAction(null);
        const message = signUpResult.error.message ?? "Could not create account for passkey setup";
        if (/already|exist/i.test(message)) {
          setMode("sign-in");
          setError("This email already has an account. Sign in first, then register your passkey.");
          setStatus(null);
          return;
        }

        setStatus(null);
        setError(message);
        return;
      }
    }

    setStatus("Registering passkey...");
    const result = await authClient.passkey.addPasskey();
    setBusyAction(null);

    if (result.error) {
      setStatus(null);
      setError(result.error.message ?? "Could not register passkey");
      return;
    }

    setStatus("Passkey registered. You can use fingerprint sign-in next time.");
    router.replace(callbackURL);
  }

  async function onSignOut() {
    setError(null);
    setStatus("Signing out...");
    setBusyAction("sign-out");
    const result = await authClient.signOut();
    setBusyAction(null);

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
        <h1>Sign up and sign in</h1>
        <p>Use email links and passkeys together. Sign up with email, then register fingerprint passkey access.</p>
      </div>

      <section className="card section auth-shell">
        <div className="auth-session-row">
          <p className="auth-session-pill">
            {isPending ? "Checking session..." : isAuthed ? `Signed in as ${session?.user.email}` : "Not signed in"}
          </p>
          {isAuthed ? (
            <div className="actions auth-session-actions">
              <button className="btn btn-secondary" type="button" onClick={onSignOut} disabled={isBusy}>
                {busyAction === "sign-out" ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode" data-mode={mode}>
          <button
            id="auth-tab-sign-up"
            type="button"
            role="tab"
            aria-selected={mode === "sign-up"}
            aria-controls="auth-panel-sign-up"
            className="auth-mode-btn"
            data-active={mode === "sign-up"}
            onClick={() => setMode("sign-up")}
          >
            Sign up
          </button>
          <button
            id="auth-tab-sign-in"
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            aria-controls="auth-panel-sign-in"
            className="auth-mode-btn"
            data-active={mode === "sign-in"}
            onClick={() => setMode("sign-in")}
          >
            Sign in
          </button>
        </div>

        <div className="auth-panels" data-mode={mode}>
          <article
            id="auth-panel-sign-up"
            role="tabpanel"
            aria-labelledby="auth-tab-sign-up"
            aria-hidden={mode !== "sign-up"}
            className="auth-panel auth-panel--sign-up"
          >
            <h2>Create account</h2>
            <p>Start with email, then register your fingerprint passkey.</p>
            <form className="form auth-form" onSubmit={onSignUpSubmit}>
              <div className="form-field">
                <label htmlFor="sign-up-email">Email</label>
                <input
                  id="sign-up-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={signUpEmail}
                  onChange={(event) => setSignUpEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="actions auth-panel-actions">
                <button className="btn btn-secondary" type="submit" disabled={isBusy}>
                  {busyAction === "sign-up-link" ? "Sending..." : "Send sign-up link"}
                </button>
                <button className="btn btn-primary btn-fingerprint" type="button" onClick={onSignUpPasskeyRegister} disabled={isBusy}>
                  <FingerprintIcon />
                  {isAuthed ? "Register passkey" : "Create account + register passkey"}
                </button>
              </div>
              <p className="auth-panel-note">
                {!isAuthed
                  ? "Passkey setup no longer needs email verification. Enter email and tap fingerprint."
                  : "Account verified. Register passkey now for fast biometric sign-in."}
              </p>
            </form>
          </article>

          <article
            id="auth-panel-sign-in"
            role="tabpanel"
            aria-labelledby="auth-tab-sign-in"
            aria-hidden={mode !== "sign-in"}
            className="auth-panel auth-panel--sign-in"
          >
            <h2>Welcome back</h2>
            <p>Use passkey first, or request an email sign-in link.</p>
            <div className="actions auth-panel-actions">
              <button className="btn btn-primary" type="button" onClick={onPasskeySignIn} disabled={isBusy || isAuthed}>
                {busyAction === "sign-in-passkey" ? "Requesting..." : "Sign in with passkey"}
              </button>
            </div>
            <form className="form auth-form" onSubmit={onSignInMagicLinkSubmit}>
              <div className="form-field">
                <label htmlFor="sign-in-email">Email sign-in fallback</label>
                <input
                  id="sign-in-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={isBusy}>
                {busyAction === "sign-in-link" ? "Sending..." : "Send sign-in link"}
              </button>
            </form>
          </article>
        </div>

        {status ? (
          <p role="status" aria-live="polite" className="form-msg form-msg--success auth-feedback">
            {status}
          </p>
        ) : null}
        {error ? (
          <p role="status" aria-live="polite" className="form-msg form-msg--error auth-feedback">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading auth...</p>
        </main>
      }
    >
      <AuthPageClient />
    </Suspense>
  );
}
