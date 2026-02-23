import { diffChars } from "diff";
import type { PricingResult } from "./types";

export const MICRO_EUR_PER_EUR = 1_000_000;
// Alpha pricing: make storage writes 100x cheaper.
export const COST_MICRO_EUR_PER_CHAR = 1;
export const DAILY_ENDORSE_XP_CAP = 5_000;
export const DEFAULT_TREASURY_VOTE_QUORUM_XP = 1_000;

export function computeChangedChars(previousContent: string, nextContent: string): number {
  if (previousContent === nextContent) {
    return 0;
  }

  return diffChars(previousContent, nextContent).reduce((total, change) => {
    if (change.added || change.removed) {
      return total + change.count;
    }
    return total;
  }, 0);
}

export function computePricing(changedChars: number): PricingResult {
  if (!Number.isFinite(changedChars) || changedChars < 0) {
    throw new Error("changedChars must be a non-negative finite number");
  }

  const normalizedChars = Math.floor(changedChars);
  return {
    changedChars: normalizedChars,
    costMicroEur: normalizedChars * COST_MICRO_EUR_PER_CHAR,
    xpMinted: normalizedChars
  };
}

export function computeCashbackMicroEur(endorseXp: number): number {
  if (!Number.isFinite(endorseXp) || endorseXp < 0) {
    throw new Error("endorseXp must be a non-negative finite number");
  }

  return Math.floor(endorseXp * 10);
}

export function computeTreasuryOutcome(input: {
  yesXp: number;
  noXp: number;
  quorumXp: number;
}): { totalXp: number; quorumReached: boolean; approved: boolean } {
  const yesXp = Math.floor(input.yesXp);
  const noXp = Math.floor(input.noXp);
  const quorumXp = Math.floor(input.quorumXp);

  if (![yesXp, noXp, quorumXp].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Treasury vote totals must be finite non-negative numbers");
  }

  if (quorumXp <= 0) {
    throw new Error("quorumXp must be positive");
  }

  const totalXp = yesXp + noXp;
  const quorumReached = totalXp >= quorumXp;
  return {
    totalXp,
    quorumReached,
    approved: quorumReached && yesXp > noXp
  };
}
