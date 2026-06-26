// §11 Portfolio aggregation.
// pr(fund,portfolio) = allocated_commitment / fund.commitment, applied to every
// line item, in the fund's investment currency; then FX to reporting currency
// (with auto-inversion); aggregate per calendar quarter, scenario, line item.

import type {
  PortfolioInput,
  FundResult,
  FundScenarioResult,
  CalendarQuarter,
  Money,
  Warning,
} from './types';
import { runFund } from './fund';
import {
  calQuarterOrdinal,
  calQuarterFromOrdinal,
  quarterOf,
} from './util/daycount';
import { pushWarning } from './warnings';

export interface PortfolioLineItem {
  pNet: Money;
  dNet: Money;
  nav: Money;
  mgmtFee: Money;
  expenses: Money;
  establishment: Money;
  carry: Money;
  pGross: Money;
  dGross: Money;
  netCf: Money;
  grossCf: Money;
}

export interface PortfolioScenarioAgg {
  scenarioId: string;
  quarters: CalendarQuarter[];
  /** Aggregated per-quarter line items (reporting currency). */
  items: PortfolioLineItem[];
  /** Aggregated cumulative paid-in (p_net) for the PIC denominator. */
  cumPNet: Money[];
  /** Portfolio PIC per quarter. */
  portfolioPic: number[];
  /** Aggregated NAV cumulative-equivalent per quarter (stock). */
}

export interface PortfolioResult {
  portfolioId: string;
  /** Per-fund results (for reuse by overlay & KID). */
  fundResults: FundResult[];
  scenarios: PortfolioScenarioAgg[];
  warnings: Warning[];
  /** Calendar quarter grid (union across funds). */
  quarters: CalendarQuarter[];
}

/** §11 FX with auto-inversion; throws (collected as blocking warning) if missing.
 *  This is the flat-rate fallback honoured when no time-varying rates are supplied. */
export function fxRate(
  fx: PortfolioInput['fx'],
  from: string,
  to: string,
  warnings: Warning[],
): number {
  if (from === to) return 1;
  const direct = fx.rates[`${from}->${to}`];
  if (direct !== undefined) return direct;
  const inverse = fx.rates[`${to}->${from}`];
  if (inverse !== undefined && inverse !== 0) {
    pushWarning(warnings, 'fx_rate_inverted', `Inverted FX ${to}->${from} for ${from}->${to}.`, {
      from,
      to,
    });
    return 1 / inverse;
  }
  pushWarning(warnings, 'fx_rate_missing', `Missing FX ${from}->${to}.`, { from, to });
  throw new Error(`FXRateMissing: ${from}->${to}`);
}

/** Time-aware §11 FX. Actuals quarters (ordinal ≤ lastActualOrd) convert at their own
 *  `periodRates` rate (carrying the nearest earlier observation forward across gaps);
 *  forecast quarters convert at `forecastRates`. Anything unresolved falls through to
 *  the flat `fxRate` fallback, so a flat-only FxTable behaves exactly as before. */
export function fxRateAt(
  fx: PortfolioInput['fx'],
  from: string,
  to: string,
  quarter: CalendarQuarter,
  lastActualOrd: number,
  warnings: Warning[],
): number {
  if (from === to) return 1;
  const pair = `${from}->${to}`;
  const ord = calQuarterOrdinal(quarter);
  if (ord <= lastActualOrd) {
    const m = fx.periodRates?.[pair];
    if (m) {
      const exact = m[ord];
      if (exact !== undefined) return exact;
      // Carry forward the most recent observation on or before this quarter.
      let bestOrd = -Infinity;
      let bestRate: number | undefined;
      for (const k in m) {
        const ko = Number(k);
        if (ko <= ord && ko > bestOrd) {
          bestOrd = ko;
          bestRate = m[ko];
        }
      }
      if (bestRate !== undefined) return bestRate;
    }
  }
  const forecast = fx.forecastRates?.[pair];
  if (forecast !== undefined) return forecast;
  return fxRate(fx, from, to, warnings);
}

/** The single forecast/go-forward rate for a pair (PIC commitment denominator). */
export function fxForecastRate(
  fx: PortfolioInput['fx'],
  from: string,
  to: string,
  warnings: Warning[],
): number {
  if (from === to) return 1;
  const forecast = fx.forecastRates?.[`${from}->${to}`];
  if (forecast !== undefined) return forecast;
  return fxRate(fx, from, to, warnings);
}

function emptyItem(): PortfolioLineItem {
  return {
    pNet: 0,
    dNet: 0,
    nav: 0,
    mgmtFee: 0,
    expenses: 0,
    establishment: 0,
    carry: 0,
    pGross: 0,
    dGross: 0,
    netCf: 0,
    grossCf: 0,
  };
}

export interface RunPortfolioResult extends PortfolioResult {}

export function runPortfolio(portfolio: PortfolioInput): PortfolioResult {
  const warnings: Warning[] = [];

  // Run each fund.
  const fundResults = portfolio.funds.map((f) => runFund(f.fund));

  // Determine the union calendar grid across all funds & scenarios.
  let minOrd = Infinity;
  let maxOrd = -Infinity;
  for (const fr of fundResults) {
    for (const sc of fr.scenarios) {
      for (const row of sc.rows) {
        const ord = calQuarterOrdinal(row.quarter);
        if (ord < minOrd) minOrd = ord;
        if (ord > maxOrd) maxOrd = ord;
      }
    }
  }
  const quarters: CalendarQuarter[] = [];
  for (let o = minOrd; o <= maxOrd; o++) quarters.push(calQuarterFromOrdinal(o));
  const ordToIndex = new Map<number, number>();
  quarters.forEach((q, i) => ordToIndex.set(calQuarterOrdinal(q), i));
  const nCal = quarters.length;

  // Collect scenario ids (union).
  const scenarioIds = new Set<string>();
  for (const fr of fundResults) for (const sc of fr.scenarios) scenarioIds.add(sc.scenarioId);

  const scenarios: PortfolioScenarioAgg[] = [];

  for (const scId of scenarioIds) {
    const items: PortfolioLineItem[] = Array.from({ length: nCal }, emptyItem);
    // NAV is a stock — aggregate the NAV at each calendar quarter (sum of funds'
    // NAV at that quarter, held forward for funds that don't span it). For the
    // 1:1 inception→calendar funds, each fund contributes its row NAV at its
    // own quarter; between/after we carry last NAV. We track per-fund last NAV.
    for (let fi = 0; fi < portfolio.funds.length; fi++) {
      const fref = portfolio.funds[fi];
      const fr = fundResults[fi];
      const sc = fr.scenarios.find((s) => s.scenarioId === scId);
      if (!sc) continue;
      const pr = fref.allocatedCommitment / fref.fund.commitment;
      // §11 time-varying FX: actuals quarters convert at their historical rate,
      // forecast quarters at the forecast rate. The split is the fund's last
      // actuals quarter; with no actuals every quarter is treated as forecast.
      const lastActualOrd = (fref.fund.actuals ?? []).reduce(
        (m, a) => Math.max(m, calQuarterOrdinal(a.quarter)),
        -Infinity,
      );

      for (const row of sc.rows) {
        const idx = ordToIndex.get(calQuarterOrdinal(row.quarter));
        if (idx === undefined) continue;
        const rate = fxRateAt(
          portfolio.fx,
          fref.fund.currency,
          portfolio.currency,
          row.quarter,
          lastActualOrd,
          warnings,
        );
        const factor = pr * rate;
        const it = items[idx];
        it.pNet += row.pNet * factor;
        it.dNet += row.dNet * factor;
        it.mgmtFee += row.mgmtFee * factor;
        it.expenses += row.expenses * factor;
        it.establishment += row.establishment * factor;
        it.carry += row.carry * factor;
        it.pGross += row.pGross * factor;
        it.dGross += row.dGross * factor;
        it.netCf += row.netCf * factor;
        it.grossCf += row.grossCf * factor;
        // NAV is a stock: each fund's row carries its NAV at that quarter.
        it.nav += row.nav * factor;
      }
    }

    // Cumulative paid-in (p_net) for PIC denominator.
    const cumPNet: Money[] = new Array(nCal);
    let acc = 0;
    for (let i = 0; i < nCal; i++) {
      acc += items[i].pNet;
      cumPNet[i] = acc;
    }

    // §11 Portfolio PIC denominator (spot commitment-equivalent).
    const qEstablishOrd = portfolio.isFoF
      ? calQuarterOrdinal(quarterOf(portfolio.effectiveDate))
      : -Infinity;
    const portfolioPic: number[] = new Array(nCal);
    for (let i = 0; i < nCal; i++) {
      const ord = calQuarterOrdinal(quarters[i]);
      let denom: number;
      if (portfolio.isFoF && ord < qEstablishOrd) {
        denom = 0;
      } else {
        denom = 0;
        for (const fref of portfolio.funds) {
          const rate = fxForecastRate(
            portfolio.fx,
            fref.fund.currency,
            portfolio.currency,
            warnings,
          );
          denom += fref.allocatedCommitment * rate;
        }
      }
      portfolioPic[i] = denom > 0 ? cumPNet[i] / denom : 0;
    }

    scenarios.push({
      scenarioId: scId,
      quarters,
      items,
      cumPNet,
      portfolioPic,
    });
  }

  return {
    portfolioId: portfolio.id,
    fundResults,
    scenarios,
    warnings,
    quarters,
  };
}
