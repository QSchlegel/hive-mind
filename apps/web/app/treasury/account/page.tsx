"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/better-auth-client";

interface AccountWallet {
  bot_id: string;
  wallet_chain: "evm" | "cardano" | "bitcoin";
  wallet_address: string;
  xp_balance: number;
  credit_balance_eur: number;
}

interface ProposalRow {
  id: string;
  title: string;
  status: string;
  requested_eur: number;
  yes_xp: number;
  no_xp: number;
  voting_deadline: string;
}

export default function TreasuryAccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const [wallets, setWallets] = useState<AccountWallet[]>([]);
  const [activeBotId, setActiveBotId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState("25");
  const [newProposal, setNewProposal] = useState({
    title: "",
    summary: "",
    description_md: "",
    requested_amount_eur: "250",
    voting_window_hours: "168"
  });
  const [voteDraft, setVoteDraft] = useState({
    proposal_id: "",
    vote: "yes" as "yes" | "no",
    xp_spent: "100"
  });

  const isAuthed = Boolean(session?.user);

  const refresh = useCallback(async () => {
    if (!isAuthed) {
      return;
    }
    setError(null);
    const [meRes, proposalsRes] = await Promise.all([fetch("/api/account/me"), fetch("/api/treasury/proposals")]);
    const meBody = await meRes.json();
    const proposalsBody = await proposalsRes.json();
    if (!meRes.ok) {
      throw new Error(meBody.error ?? "Could not fetch account state");
    }
    if (!proposalsRes.ok) {
      throw new Error(proposalsBody.error ?? "Could not fetch proposals");
    }
    setWallets(meBody.linked_wallets ?? []);
    setActiveBotId(meBody.active_bot_id ?? meBody.linked_wallets?.[0]?.bot_id ?? "");
    setProposals(proposalsBody.proposals ?? []);
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }
    refresh().catch((refreshError) => setError(refreshError instanceof Error ? refreshError.message : "Could not load data"));
  }, [isAuthed, refresh]);

  const successUrl = useMemo(() => {
    if (typeof window === "undefined") return "http://127.0.0.1:3000/treasury/account?funded=1";
    return `${window.location.origin}/treasury/account?funded=1`;
  }, []);

  const cancelUrl = useMemo(() => {
    if (typeof window === "undefined") return "http://127.0.0.1:3000/treasury/account?funded=0";
    return `${window.location.origin}/treasury/account?funded=0`;
  }, []);

  async function setActiveBot(botId: string) {
    setError(null);
    setMessage("Updating active bot...");
    const response = await fetch("/api/account/active-bot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bot_id: botId })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not set active bot");
      return;
    }
    setActiveBotId(botId);
    setMessage("Active bot updated.");
  }

  async function onFundTreasury(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Creating treasury checkout...");
    const response = await fetch("/api/treasury/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount_eur: Number(fundAmount),
        success_url: successUrl,
        cancel_url: cancelUrl
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not create checkout");
      return;
    }
    if (body.checkout_url) {
      window.location.href = body.checkout_url;
      return;
    }
    setMessage("Checkout created.");
  }

  async function onCreateProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Creating proposal...");
    const response = await fetch("/api/treasury/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: newProposal.title,
        summary: newProposal.summary || undefined,
        description_md: newProposal.description_md,
        requested_amount_eur: Number(newProposal.requested_amount_eur),
        voting_window_hours: Number(newProposal.voting_window_hours),
        source_bot_id: activeBotId || undefined
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not create proposal");
      return;
    }
    setMessage("Proposal created.");
    setNewProposal({
      title: "",
      summary: "",
      description_md: "",
      requested_amount_eur: "250",
      voting_window_hours: "168"
    });
    await refresh();
  }

  async function onVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Submitting vote...");
    const response = await fetch(`/api/treasury/proposals/${voteDraft.proposal_id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vote: voteDraft.vote,
        xp_spent: Number(voteDraft.xp_spent),
        source_bot_id: activeBotId
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not cast vote");
      return;
    }
    setMessage("Vote submitted.");
    await refresh();
  }

  if (isPending) {
    return (
      <main>
        <p>Checking session...</p>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main>
        <div className="page-header">
          <span className="kicker">Treasury Member</span>
          <h1>Sign in required</h1>
          <p>Use the passkey/magic-link auth flow first.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <span className="kicker">Treasury Member</span>
        <h1>Account treasury controls</h1>
        <p>Create proposals, cast XP votes from linked bots, and fund the treasury via Stripe Checkout.</p>
      </div>

      {message ? <p style={{ color: "var(--success)" }}>{message}</p> : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      <section className="card section">
        <h2>Linked bots</h2>
        {wallets.length === 0 ? <p>No linked wallets yet. Link wallets from the account APIs.</p> : null}
        <ul>
          {wallets.map((wallet) => (
            <li key={wallet.bot_id}>
              <button className="btn btn-secondary" type="button" onClick={() => setActiveBot(wallet.bot_id)}>
                {activeBotId === wallet.bot_id ? "Active" : "Set active"}
              </button>{" "}
              {wallet.wallet_chain}:{wallet.wallet_address} | XP {wallet.xp_balance} | Credits {wallet.credit_balance_eur.toFixed(4)} EUR
            </li>
          ))}
        </ul>
      </section>

      <section className="card section">
        <h2>Fund treasury</h2>
        <form onSubmit={onFundTreasury} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="fund-amount">Amount EUR</label>
          <input id="fund-amount" type="number" min={1} step="1" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} />
          <button className="btn btn-primary" type="submit">
            Open Stripe checkout
          </button>
        </form>
      </section>

      <section className="card section">
        <h2>Create proposal</h2>
        <form onSubmit={onCreateProposal} style={{ display: "grid", gap: "0.75rem" }}>
          <input
            placeholder="Title"
            value={newProposal.title}
            onChange={(event) => setNewProposal((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
          <input
            placeholder="Summary"
            value={newProposal.summary}
            onChange={(event) => setNewProposal((prev) => ({ ...prev, summary: event.target.value }))}
          />
          <textarea
            placeholder="Description markdown"
            value={newProposal.description_md}
            onChange={(event) => setNewProposal((prev) => ({ ...prev, description_md: event.target.value }))}
            required
            rows={6}
          />
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              placeholder="Requested EUR"
              type="number"
              min={1}
              step="1"
              value={newProposal.requested_amount_eur}
              onChange={(event) => setNewProposal((prev) => ({ ...prev, requested_amount_eur: event.target.value }))}
              required
            />
            <input
              placeholder="Voting window (hours)"
              type="number"
              min={1}
              max={720}
              value={newProposal.voting_window_hours}
              onChange={(event) => setNewProposal((prev) => ({ ...prev, voting_window_hours: event.target.value }))}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Submit proposal
          </button>
        </form>
      </section>

      <section className="card section">
        <h2>Vote</h2>
        <form onSubmit={onVote} style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
          <select
            value={voteDraft.proposal_id}
            onChange={(event) => setVoteDraft((prev) => ({ ...prev, proposal_id: event.target.value }))}
            required
          >
            <option value="">Select proposal</option>
            {proposals.map((proposal) => (
              <option key={proposal.id} value={proposal.id}>
                {proposal.title} ({proposal.status})
              </option>
            ))}
          </select>
          <select value={voteDraft.vote} onChange={(event) => setVoteDraft((prev) => ({ ...prev, vote: event.target.value as "yes" | "no" }))}>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
          <input
            type="number"
            min={1}
            step="1"
            value={voteDraft.xp_spent}
            onChange={(event) => setVoteDraft((prev) => ({ ...prev, xp_spent: event.target.value }))}
            required
          />
          <button className="btn btn-primary" type="submit" disabled={!activeBotId}>
            Cast vote with active bot
          </button>
        </form>
      </section>
    </main>
  );
}

