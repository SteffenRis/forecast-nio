import { describe, expect, it } from 'vitest';
import { runPortfolio } from '../portfolio';
import type { PortfolioResult } from '../portfolio';
import { calQuarterFromOrdinal, calQuarterOrdinal } from '../util/daycount';
import type { ActualRecord, FxTable, PortfolioInput } from '../types';
import { makeAcmeFund, makeNordicPortfolio, overlayDisabled } from './fixtures/acme';

// Per-quarter §11 FX. Strategy: the aggregation multiplies each fund row by
// pr·rate, so a run scaled by a known rate equals a rate=1 baseline times that
// rate. We assert those ratios rather than absolute cash-flow numbers.

function portfolioWithFx(fx: FxTable, actuals: ActualRecord[]): PortfolioInput {
  const fund = makeAcmeFund({ actuals });
  return { ...makeNordicPortfolio(fund, overlayDisabled), fx };
}

function navAt(res: PortfolioResult, o: number): number {
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  const i = sc.quarters.findIndex((q) => calQuarterOrdinal(q) === o);
  return sc.items[i].nav;
}

// Discover the fund's calendar grid (the same regardless of actuals values).
const probe = runPortfolio(portfolioWithFx({ rates: { 'EUR->USD': 1 } }, []));
const grid = probe.scenarios
  .find((s) => s.scenarioId === 'base')!
  .quarters.map(calQuarterOrdinal);
const q0 = grid[0]; // first historical quarter
const q1 = grid[1]; // second historical quarter (last actual)
const qF = grid[grid.length - 3]; // a forecast quarter, comfortably past q1

const mkActual = (o: number, paidIn: number, nav: number): ActualRecord => ({
  quarter: calQuarterFromOrdinal(o),
  cumulativePaidIn: paidIn,
  cumulativeDistributions: 0,
  nav,
});
const ACTUALS: ActualRecord[] = [mkActual(q0, 6_000_000, 6_000_000), mkActual(q1, 9_000_000, 9_500_000)];

describe('§11 per-quarter portfolio FX', () => {
  it('converts actuals quarters at their historical rate and forecast quarters at the forecast rate', () => {
    const base = runPortfolio(portfolioWithFx({ rates: { 'EUR->USD': 1 } }, ACTUALS));
    const res = runPortfolio(
      portfolioWithFx(
        {
          rates: { 'EUR->USD': 1.08 },
          periodRates: { 'EUR->USD': { [q0]: 1.1, [q1]: 1.2 } },
          forecastRates: { 'EUR->USD': 1.5 },
        },
        ACTUALS,
      ),
    );
    expect(navAt(res, q0)).toBeCloseTo(navAt(base, q0) * 1.1, 2);
    expect(navAt(res, q1)).toBeCloseTo(navAt(base, q1) * 1.2, 2);
    expect(navAt(res, qF)).toBeCloseTo(navAt(base, qF) * 1.5, 2);
  });

  it('carries the last known historical rate forward across a quarter with no pulled rate', () => {
    const base = runPortfolio(portfolioWithFx({ rates: { 'EUR->USD': 1 } }, ACTUALS));
    const res = runPortfolio(
      portfolioWithFx(
        {
          rates: { 'EUR->USD': 1.08 },
          periodRates: { 'EUR->USD': { [q0]: 1.1 } }, // q1 deliberately missing
          forecastRates: { 'EUR->USD': 1.5 },
        },
        ACTUALS,
      ),
    );
    // q1 is historical (≤ last actual) but unpulled → carries 1.1 forward, not the forecast 1.5.
    expect(navAt(res, q1)).toBeCloseTo(navAt(base, q1) * 1.1, 2);
    // Forecast quarter still uses the forecast rate.
    expect(navAt(res, qF)).toBeCloseTo(navAt(base, qF) * 1.5, 2);
  });

  it('flat-only FxTable reproduces the §16 reference numbers (backward compatible)', () => {
    const fund = makeAcmeFund(); // no actuals
    const res = runPortfolio(makeNordicPortfolio(fund, overlayDisabled)); // fx flat 1.08
    const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
    let y1 = 0;
    for (let i = 0; i < 4; i++) y1 += sc.items[i].pNet;
    expect(y1).toBeCloseTo(2_160_000, 0);
    let y5 = 0;
    for (let i = 0; i < 20; i++) y5 += sc.items[i].dNet;
    expect(y5).toBeCloseTo(4_860_000, 0);
  });
});
