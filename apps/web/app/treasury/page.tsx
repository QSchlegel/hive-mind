"use client";

import { useEffect, useState } from "react";

interface TreasuryState {
  treasury: {
    account: { provider: string; balance_eur: number; currency: string };
    contributions: { confirmed_count: number; confirmed_eur: number };
    proposals: { open_count: number; approved_count: number; rejected_count: number; funded_count: number; total_voted_xp: number };
    payouts?: { count: number; total_eur: number };
    available_eur: number;
  };
}

interface ProposalRow {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  requested_eur: number;
  yes_xp: number;
  no_xp: number;
  vote_quorum_xp: number;
  voting_deadline: string;
}

export default function TreasuryPage() {
  const [state, setState] = useState<TreasuryState | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [treasuryRes, proposalsRes] = await Promise.all([fetch("/api/treasury"), fetch("/api/treasury/proposals")]);
        const treasuryBody = await treasuryRes.json();
        const proposalsBody = await proposalsRes.json();
        if (!active) {
          return;
        }
        if (!treasuryRes.ok) {
          throw new Error(treasuryBody.error ?? "Could not fetch treasury");
        }
        if (!proposalsRes.ok) {
          throw new Error(proposalsBody.error ?? "Could not fetch proposals");
        }
        setState(treasuryBody);
        setProposals(proposalsBody.proposals ?? []);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load treasury data");
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <div className="page-header">
        <span className="kicker">Treasury</span>
        <h1>Public treasury dashboard</h1>
        <p>See Stripe-backed treasury balances, governance state, and payout history snapshots.</p>
      </div>

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}
      {!state ? <p>Loading treasury...</p> : null}

      {state ? (
        <>
          <section className="card section">
            <h2>Overview</h2>
            <p>
              Custody: <strong>{state.treasury.account.provider}</strong> | Balance:{" "}
              <strong>{state.treasury.account.balance_eur.toFixed(2)} {state.treasury.account.currency.toUpperCase()}</strong>
            </p>
            <p>
              Available: <strong>{state.treasury.available_eur.toFixed(2)} EUR</strong> | Contributions:{" "}
              <strong>{state.treasury.contributions.confirmed_count}</strong> ({state.treasury.contributions.confirmed_eur.toFixed(2)} EUR)
            </p>
            <p>
              Open proposals: <strong>{state.treasury.proposals.open_count}</strong> | Approved:{" "}
              <strong>{state.treasury.proposals.approved_count}</strong> | Funded: <strong>{state.treasury.proposals.funded_count}</strong>
            </p>
            <p>Total voted XP: <strong>{state.treasury.proposals.total_voted_xp}</strong></p>
            {state.treasury.payouts ? (
              <p>
                Payouts: <strong>{state.treasury.payouts.count}</strong> ({state.treasury.payouts.total_eur.toFixed(2)} EUR)
              </p>
            ) : null}
          </section>

          <section className="card section">
            <h2>Proposals</h2>
            {proposals.length === 0 ? <p>No proposals yet.</p> : null}
            <ul>
              {proposals.map((proposal) => (
                <li key={proposal.id}>
                  <strong>{proposal.title}</strong> ({proposal.status}) - {proposal.requested_eur.toFixed(2)} EUR - yes {proposal.yes_xp} / no{" "}
                  {proposal.no_xp} / quorum {proposal.vote_quorum_xp}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
