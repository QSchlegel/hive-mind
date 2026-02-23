import { describe, expect, it } from "vitest";
import {
  COST_MICRO_EUR_PER_CHAR,
  computeCashbackMicroEur,
  computeChangedChars,
  computePricing,
  computeTreasuryOutcome
} from "../src/economics";

describe("economics", () => {
  it("computes changed chars for edits", () => {
    expect(computeChangedChars("hello", "hello world")).toBeGreaterThan(0);
    expect(computeChangedChars("same", "same")).toBe(0);
  });

  it("computes pricing with char-based formula", () => {
    const result = computePricing(123);
    expect(result.changedChars).toBe(123);
    expect(result.costMicroEur).toBe(123 * COST_MICRO_EUR_PER_CHAR);
    expect(result.xpMinted).toBe(123);
  });

  it("computes endorsement cashback", () => {
    expect(computeCashbackMicroEur(1000)).toBe(10000);
  });

  it("computes treasury proposal outcome", () => {
    expect(computeTreasuryOutcome({ yesXp: 700, noXp: 200, quorumXp: 1000 })).toEqual({
      totalXp: 900,
      quorumReached: false,
      approved: false
    });

    expect(computeTreasuryOutcome({ yesXp: 900, noXp: 200, quorumXp: 1000 })).toEqual({
      totalXp: 1100,
      quorumReached: true,
      approved: true
    });
  });
});
