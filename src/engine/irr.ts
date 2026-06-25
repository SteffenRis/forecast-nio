// §14 IRR (XIRR-style). Actual dates, 365-day year, end-of-quarter dating.
// Brent on [−0.9999, 10], null on edge cases.

import type { CalendarQuarter } from './types';
import { brent } from './util/brent';
import { lastDayOfCalQuarter, actDays } from './util/daycount';

export interface DatedFlow {
  date: Date;
  amount: number;
}

/**
 * §14.3 Core XIRR solver on dated flows.
 * Find r s.t. Σ cf[i]/(1+r)^((date[i]−date[0])/365) = 0.
 * date[0] = earliest non-zero flow. Returns null on edge cases.
 */
export function xirrFromFlows(flows: DatedFlow[]): number | null {
  // Drop zero flows.
  const nz = flows.filter((f) => f.amount !== 0);
  if (nz.length < 2) return null;
  // Sort by date.
  nz.sort((a, b) => a.date.getTime() - b.date.getTime());
  // All same sign → null.
  const hasPos = nz.some((f) => f.amount > 0);
  const hasNeg = nz.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const t0 = nz[0].date;
  const npv = (r: number): number => {
    let acc = 0;
    for (const f of nz) {
      const years = actDays(t0, f.date) / 365;
      acc += f.amount / Math.pow(1 + r, years);
    }
    return acc;
  };

  return brent(npv, -0.9999, 10.0, 1e-10, 300);
}

/**
 * §14.2 Build the dated series from per-quarter cash flows.
 * cf(q) = d(q) − p(q); add NAV(q_eval) to the final flow as virtual liquidation;
 * date each flow at the last day of its calendar quarter.
 */
export interface IrrSeriesInput {
  quarters: CalendarQuarter[];
  /** per-quarter cash flow (already d − p for the chosen metric). */
  cf: number[];
  /** NAV at the evaluation quarter (added to the final flow). */
  navAtEval: number;
  /** index of the evaluation quarter (inclusive). */
  evalIndex: number;
}

export function buildIrrFlows(input: IrrSeriesInput): DatedFlow[] {
  const { quarters, cf, navAtEval, evalIndex } = input;
  const flows: DatedFlow[] = [];
  for (let i = 0; i <= evalIndex; i++) {
    let amount = cf[i];
    if (i === evalIndex) amount += navAtEval;
    flows.push({ date: lastDayOfCalQuarter(quarters[i]), amount });
  }
  return flows;
}

export function xirr(input: IrrSeriesInput): number | null {
  return xirrFromFlows(buildIrrFlows(input));
}

/** Convenience for tests: XIRR over raw {date,amount} pairs. */
export function xirrDated(pairs: { date: Date; amount: number }[]): number | null {
  return xirrFromFlows(pairs.map((p) => ({ date: p.date, amount: p.amount })));
}
