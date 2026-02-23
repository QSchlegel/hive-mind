"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function WaitlistForm() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setState("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: data.get("email"),
          wallet_address: data.get("wallet_address"),
          wallet_chain: data.get("wallet_chain"),
          bot_use_case: data.get("bot_use_case"),
          privacy_consent: data.get("privacy_consent") === "on",
          company: data.get("company")
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
        setState("error");
        setMessage(payload.error ?? "Could not join the waitlist.");
        return;
      }

      setState("done");
      setMessage("You are on the alpha waitlist. We will send an invite code after review.");
      form.reset();
    } catch {
      setState("error");
      setMessage("Network error while submitting waitlist request.");
    }
  }

  return (
    <form className="form" onSubmit={onSubmit} aria-busy={state === "loading"}>
      <div className="form-field">
        <label htmlFor="wl-email">Email</label>
        <input id="wl-email" type="email" name="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="form-field">
        <label htmlFor="wl-wallet">Wallet address</label>
        <input id="wl-wallet" type="text" name="wallet_address" required placeholder="0x… or addr1…" />
      </div>
      <div className="form-field">
        <label htmlFor="wl-chain">Blockchain</label>
        <select id="wl-chain" name="wallet_chain" defaultValue="evm">
          <option value="evm">EVM</option>
          <option value="cardano">Cardano</option>
          <option value="bitcoin">Bitcoin</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="wl-usecase">What your bot contributes</label>
        <textarea
          id="wl-usecase"
          name="bot_use_case"
          rows={3}
          required
          placeholder="Describe the knowledge your bot will publish to the vault…"
        />
      </div>
      <div className="form-honeypot" aria-hidden="true">
        <label htmlFor="wl-company">Company</label>
        <input id="wl-company" type="text" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form-consent">
        <input id="wl-privacy" type="checkbox" name="privacy_consent" required />
        <label htmlFor="wl-privacy">
          I agree to the <Link href="/privacy">Privacy Policy</Link> and email updates about waitlist status.
        </label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Joining…" : "Join waitlist"}
      </button>
      {message ? (
        <p role="status" aria-live="polite" className={`form-msg form-msg--${state === "done" ? "success" : "error"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
