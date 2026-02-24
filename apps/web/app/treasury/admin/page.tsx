"use client";

import { FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/better-auth-client";

interface ProposalRow {
  id: string;
  title: string;
  status: string;
  requested_eur: number;
  voting_deadline: string;
}

interface PayoutRow {
  id: string;
  proposal_id: string;
  proposal_title: string | null;
  amount_eur: number;
  transfer_reference: string;
  receipt_url: string | null;
  funded_at: string;
  funded_by_email: string | null;
}

export default function TreasuryAdminPage() {
  const { data: session, isPending } = authClient.useSession();
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [fundDraft, setFundDraft] = useState({
    proposal_id: "",
    transfer_reference: "",
    receipt_url: "",
    notes: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAuthed = Boolean(session?.user);

  async function refresh() {
    const [proposalsRes, payoutsRes] = await Promise.all([fetch("/api/treasury/proposals"), fetch("/api/treasury/payouts")]);
    const proposalsBody = await proposalsRes.json();
    const payoutsBody = await payoutsRes.json();
    if (!proposalsRes.ok) {
      throw new Error(proposalsBody.error ?? "Could not load proposals");
    }
    if (!payoutsRes.ok) {
      throw new Error(payoutsBody.error ?? "Could not load payouts");
    }
    setProposals(proposalsBody.proposals ?? []);
    setPayouts(payoutsBody.payouts ?? []);
  }

  useEffect(() => {
    if (!isAuthed) {
      return;
    }
    refresh().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load admin data"));
  }, [isAuthed]);

  async function finalizeProposal(proposalId: string) {
    setError(null);
    setMessage("Finalizing proposal...");
    const response = await fetch(`/api/treasury/proposals/${proposalId}/finalize`, {
      method: "POST"
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not finalize proposal");
      return;
    }
    setMessage("Proposal finalized.");
    await refresh();
  }

  async function markFunded(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Recording payout...");
    const response = await fetch(`/api/treasury/proposals/${fundDraft.proposal_id}/fund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transfer_reference: fundDraft.transfer_reference,
        receipt_url: fundDraft.receipt_url || undefined,
        notes: fundDraft.notes || undefined
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not mark proposal funded");
      return;
    }
    setMessage("Payout recorded.");
    setFundDraft({
      proposal_id: "",
      transfer_reference: "",
      receipt_url: "",
      notes: ""
    });
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
          <span className="kicker">Treasury Admin</span>
          <h1>Sign in required</h1>
          <p>Only allowlisted operators can access this panel.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <span className="kicker">Treasury Admin</span>
        <h1>Manual payout operations</h1>
        <p>Finalize expired proposals and record manual payout references for approved proposals.</p>
      </div>

      {message ? <p className="form-msg form-msg--success">{message}</p> : null}
      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      <section className="card section">
        <h2>Finalize proposals</h2>
        <ul>
          {proposals
            .filter((proposal) => proposal.status === "open")
            .map((proposal) => (
              <li key={proposal.id}>
                <strong>{proposal.title}</strong> ({proposal.status}) ends {new Date(proposal.voting_deadline).toLocaleString()}{" "}
                <button className="btn btn-secondary" type="button" onClick={() => finalizeProposal(proposal.id)}>
                  Finalize
                </button>
              </li>
            ))}
        </ul>
      </section>

      <section className="card section">
        <h2>Mark approved proposal funded</h2>
        <form onSubmit={markFunded} className="form treasury-admin-form">
          <select
            value={fundDraft.proposal_id}
            onChange={(event) => setFundDraft((prev) => ({ ...prev, proposal_id: event.target.value }))}
            required
          >
            <option value="">Select approved proposal</option>
            {proposals
              .filter((proposal) => proposal.status === "approved")
              .map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.title} ({proposal.requested_eur.toFixed(2)} EUR)
                </option>
              ))}
          </select>
          <input
            placeholder="Transfer reference"
            value={fundDraft.transfer_reference}
            onChange={(event) => setFundDraft((prev) => ({ ...prev, transfer_reference: event.target.value }))}
            required
          />
          <input
            placeholder="Receipt URL (optional)"
            value={fundDraft.receipt_url}
            onChange={(event) => setFundDraft((prev) => ({ ...prev, receipt_url: event.target.value }))}
          />
          <textarea
            rows={4}
            placeholder="Notes (optional)"
            value={fundDraft.notes}
            onChange={(event) => setFundDraft((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <button className="btn btn-primary" type="submit">
            Record payout
          </button>
        </form>
      </section>

      <section className="card section">
        <h2>Payout log</h2>
        {payouts.length === 0 ? <p>No payouts recorded yet.</p> : null}
        <ul>
          {payouts.map((payout) => (
            <li key={payout.id}>
              <strong>{payout.proposal_title ?? payout.proposal_id}</strong> - {payout.amount_eur.toFixed(2)} EUR - ref{" "}
              {payout.transfer_reference} - by {payout.funded_by_email ?? "unknown"} - {new Date(payout.funded_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
