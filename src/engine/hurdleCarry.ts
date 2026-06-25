// §10.7–§10.8 — Hurdle schedule (outstanding-balance) and carry waterfall.
// THE CRUX. B(q) = max(0, B(q−1)·(1+r_q) + p(q) − d(q)).
// Carry triggers at q_clear = the quarter B clears AND STAYS clear through
// terminal (scan backward from terminal, not first momentary zero).

import type { Money, Ratio } from './types';

export interface HurdleCarryInput {
  /** periodic paid-in p(q), index 0..n-1 (end-of-quarter timing). */
  p: Money[];
  /** periodic distributions d(q). */
  d: Money[];
  /** cumulative paid-in P(q). */
  P: Money[];
  /** cumulative distributions D(q) = N_cum. */
  D: Money[];
  hurdleAnnual: Ratio;
  carryRate: Ratio;
  catchUp: boolean;
}

export interface HurdleCarryResult {
  /** Outstanding balance B(q). */
  B: Money[];
  /** Cumulative carry carry_cum(q). */
  carryCum: Money[];
  /** Per-quarter carry carry(q). */
  carry: Money[];
  /** Index where carry durably triggered, or -1 if never. */
  qClearIndex: number;
  /** threshold_N (no-catch-up only; else 0). */
  thresholdN: Money;
  /** Cumulative gross distribution G_cum(q) (for IRRs / invariants). */
  Gcum: Money[];
}

/** Quarterly rate from annual: r_q = (1+r_annual)^(1/4) − 1. */
export function quarterlyRate(rAnnual: Ratio): Ratio {
  return Math.pow(1 + rAnnual, 0.25) - 1;
}

export function computeHurdleCarry(input: HurdleCarryInput): HurdleCarryResult {
  const { p, d, P, D, hurdleAnnual, carryRate, catchUp } = input;
  const n = p.length;
  const rq = quarterlyRate(hurdleAnnual);

  // §10.7 Outstanding balance recurrence.
  const B: Money[] = new Array(n);
  // owedBeforeDist(q) = B(q−1)·(1+r_q) + p(q) — the balance the LP must be made
  // whole on at quarter q BEFORE that quarter's distribution pays it down. This
  // is the spec's "B_pre(q*)" used for threshold_N (the hurdle the LP must reach
  // through cumulative distributions at the durable-clear quarter).
  const owedBeforeDist: Money[] = new Array(n);
  let prev = 0;
  for (let q = 0; q < n; q++) {
    const owed = prev * (1 + rq) + p[q];
    owedBeforeDist[q] = owed;
    const bq = Math.max(0, owed - d[q]);
    B[q] = bq;
    prev = bq;
  }

  // §10.8 Trigger: q_clear = quarter B clears to 0 AND stays clear through
  // terminal. Scan backward from terminal: find the LAST index where B > 0;
  // the clear quarter is the next index (if any). If terminal B > 0, never.
  let qClear = -1;
  const terminalCleared = B[n - 1] <= 1e-9;
  if (terminalCleared) {
    // last index with B > tolerance
    let lastPositive = -1;
    for (let q = n - 1; q >= 0; q--) {
      if (B[q] > 1e-9) {
        lastPositive = q;
        break;
      }
    }
    qClear = lastPositive + 1; // first durably-clear quarter
    if (qClear >= n) qClear = n - 1; // safety (all clear)
    // If B was never positive at all, carry could start from q where balance
    // first becomes (and stays) 0. lastPositive = -1 → qClear = 0.
    if (lastPositive === -1) qClear = 0;
  }

  const carryCum: Money[] = new Array(n).fill(0);
  const carry: Money[] = new Array(n).fill(0);
  const Gcum: Money[] = new Array(n).fill(0);

  // threshold_N for no-catch-up = D(q*−1) + B_pre(q*) captured at durable clear.
  let thresholdN = 0;

  if (qClear >= 0 && carryRate > 0 && carryRate < 1) {
    if (catchUp) {
      // q >= q_clear: carry_cum = carry_rate·(N_cum − P)/(1 − carry_rate)
      // G_cum = (N_cum − carry_rate·P)/(1 − carry_rate)
      for (let q = 0; q < n; q++) {
        if (q < qClear) {
          carryCum[q] = 0;
          Gcum[q] = D[q];
        } else {
          const Ncum = D[q];
          const cc = (carryRate * (Ncum - P[q])) / (1 - carryRate);
          carryCum[q] = Math.max(0, cc);
          Gcum[q] = (Ncum - carryRate * P[q]) / (1 - carryRate);
        }
      }
    } else {
      // threshold_N = D(q*−1) + owedBeforeDist(q*)
      //             = D(q*−1) + B(q*−1)·(1+r_q) + p(q*)
      const Dprev = qClear > 0 ? D[qClear - 1] : 0;
      thresholdN = Dprev + owedBeforeDist[qClear];
      for (let q = 0; q < n; q++) {
        if (q < qClear) {
          carryCum[q] = 0;
          Gcum[q] = D[q];
        } else {
          const Ncum = D[q];
          const cc = (carryRate * (Ncum - thresholdN)) / (1 - carryRate);
          carryCum[q] = Math.max(0, cc);
          Gcum[q] = thresholdN + (Ncum - thresholdN) / (1 - carryRate);
        }
      }
    }
  } else {
    // No carry: G_cum = D.
    for (let q = 0; q < n; q++) Gcum[q] = D[q];
  }

  // Per-quarter carry.
  let prevCC = 0;
  for (let q = 0; q < n; q++) {
    carry[q] = carryCum[q] - prevCC;
    prevCC = carryCum[q];
  }

  return { B, carryCum, carry, qClearIndex: qClear, thresholdN, Gcum };
}
