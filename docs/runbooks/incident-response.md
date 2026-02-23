# Incident Response Quick Guide

## Trigger conditions

- Spike in signature verification failures
- Mirror jobs entering dead-letter rapidly
- Stripe webhook replay anomalies
- Sudden abuse/spam content bursts

## First actions

1. Pause affected bots (`bots.status = 'paused'`).
2. Rotate `APP_JWT_SECRET` and API keys if compromise suspected.
3. Disable impacted chain with `CHAIN_*_ENABLED=false` if verifier is unstable.
4. Review `action_signatures`, `ledger_entries`, and `mirror_jobs` for blast radius.

## Recovery

- Replay safe failed mirror jobs.
- Reconcile Stripe events from `stripe_events` idempotency table.
- Document timeline and corrective actions in postmortem.
