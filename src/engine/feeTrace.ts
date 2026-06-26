// Fee/carry calculation trace. A per-quarter, fully-itemized view of how every fee
// and carry number is produced — the inputs, the intermediates (basis stock, rate,
// the outstanding-balance recurrence, the carry waterfall), and the scenario scalars.
// It REUSES computeScenarioPrimitives (the same chain runFund uses), so the trace
// numbers are the engine's own — never a re-derivation. JSON-serializable surface
// (CalendarQuarter plain objects, numbers, string enums) — Web-Worker-ready.

import type { FundInput, CalendarQuarter, Money, Ratio, FeeBasis, Warning } from './types';
import { runPipeline } from './pipeline';
import { computeScenarioPrimitives } from './fund';
import { calQuarterOrdinal } from './util/daycount';

/** One quarter of the trace — every intermediate behind that quarter's fee/carry. */
export interface FeeTraceQuarter {
  quarter: CalendarQuarter;
  /** 0-based inception index. */
  index: number;
  // ---- shared cashflow context ----
  /** Cumulative paid-in P(q). */
  paidIn: Money;
  /** NAV(q). */
  nav: Money;
  /** cost_basis(q). */
  costBasis: Money;
  /** Periodic paid-in p(q). */
  pNet: Money;
  /** Periodic distributions d(q). */
  dNet: Money;
  /** Cumulative distributions D(q) = N_cum. */
  distributionsCum: Money;
  // ---- management fee & expense bridge ----
  inIP: boolean;
  mgmtBasis: FeeBasis;
  mgmtRate: Ratio;
  mgmtStock: Money;
  mgmtFee: Money;
  expenseBasis: FeeBasis;
  expenseRate: Ratio;
  expenseStock: Money;
  expenses: Money;
  // ---- establishment ----
  establishment: Money;
  // ---- hurdle recurrence ----
  /** B(q−1). */
  bPrev: Money;
  /** owedBeforeDist(q) = B(q−1)·(1+r_q) + p(q). */
  owedBeforeDist: Money;
  /** B(q). */
  b: Money;
  // ---- carry ----
  carryCum: Money;
  carry: Money;
  /** Cumulative gross distribution G_cum(q). */
  gcum: Money;
  /** q ≥ q_clear — the hurdle has durably cleared by this quarter. */
  aboveHurdle: boolean;
}

/** A scenario's trace — its fee/carry scalars plus the per-quarter detail. */
export interface FundFeeTraceScenario {
  scenarioId: string;
  commitment: Money;
  carryRate: Ratio;
  hurdleAnnual: Ratio;
  /** Quarterly hurdle rate r_q = (1+hurdleAnnual)^(1/4) − 1. */
  quarterlyHurdleRate: Ratio;
  catchUp: boolean;
  establishmentRate: Ratio;
  mgmtRateIP: Ratio;
  mgmtRatePostIP: Ratio;
  mgmtBasisIP: FeeBasis;
  mgmtBasisPostIP: FeeBasis;
  expenseRateIP: Ratio;
  expenseRatePostIP: Ratio;
  expenseBasisIP: FeeBasis;
  expenseBasisPostIP: FeeBasis;
  /** 0-based index of the last quarter that still gets the IP rate. */
  qIPEndIndex: number;
  /** Index where carry durably triggers, or -1 if never. */
  qClearIndex: number;
  /** threshold_N (no-catch-up only; else 0). */
  thresholdN: Money;
  // terminal totals (for the lifetime carry identity check)
  carryCumTerminal: Money;
  pTerminal: Money;
  gcumTerminal: Money;
  dTerminal: Money;
  quarters: FeeTraceQuarter[];
}

export interface FundFeeTrace {
  fundId: string;
  scenarios: FundFeeTraceScenario[];
}

/** Build the fee/carry trace for every scenario of a fund. */
export function buildFundFeeTrace(fund: FundInput): FundFeeTrace {
  const warnings: Warning[] = [];
  const pipeline = runPipeline(fund);
  const effLiq = fund.expectedLiquidationDate ?? fund.standardLiquidationDate;

  const actualOrds = (fund.actuals ?? []).map((a) => calQuarterOrdinal(a.quarter));
  const lastActualOrd = actualOrds.length ? Math.max(...actualOrds) : -1;

  const scenarios = pipeline.scenarios.map((sc) => {
    const { quarters, n, cf, costBasis, feeBridge, hc } = computeScenarioPrimitives(
      fund,
      sc,
      effLiq,
      lastActualOrd,
      warnings,
    );

    const qtrs: FeeTraceQuarter[] = new Array(n);
    let bPrev = 0;
    for (let i = 0; i < n; i++) {
      qtrs[i] = {
        quarter: quarters[i],
        index: i,
        paidIn: cf.P[i],
        nav: cf.NAV[i],
        costBasis: costBasis[i],
        pNet: cf.p[i],
        dNet: cf.d[i],
        distributionsCum: cf.D[i],
        inIP: feeBridge.inIP[i],
        mgmtBasis: feeBridge.mgmtBasis[i],
        mgmtRate: feeBridge.mgmtRate[i],
        mgmtStock: feeBridge.mgmtStock[i],
        mgmtFee: feeBridge.mgmtFee[i],
        expenseBasis: feeBridge.expenseBasis[i],
        expenseRate: feeBridge.expenseRate[i],
        expenseStock: feeBridge.expenseStock[i],
        expenses: feeBridge.expenses[i],
        establishment: feeBridge.establishment[i],
        bPrev,
        owedBeforeDist: hc.owedBeforeDist[i],
        b: hc.B[i],
        carryCum: hc.carryCum[i],
        carry: hc.carry[i],
        gcum: hc.Gcum[i],
        aboveHurdle: hc.qClearIndex >= 0 && i >= hc.qClearIndex,
      };
      bPrev = hc.B[i];
    }

    const last = n - 1;
    return {
      scenarioId: sc.scenarioId,
      commitment: fund.commitment,
      carryRate: fund.fees.carryRate,
      hurdleAnnual: fund.fees.hurdleAnnual,
      quarterlyHurdleRate: hc.rq,
      catchUp: fund.fees.catchUp,
      establishmentRate: fund.fees.establishmentRate,
      mgmtRateIP: fund.fees.mgmtRateIP,
      mgmtRatePostIP: fund.fees.mgmtRatePostIP,
      mgmtBasisIP: fund.fees.mgmtBasisIP,
      mgmtBasisPostIP: fund.fees.mgmtBasisPostIP,
      expenseRateIP: fund.fees.expenseRateIP,
      expenseRatePostIP: fund.fees.expenseRatePostIP,
      expenseBasisIP: fund.fees.expenseBasisIP,
      expenseBasisPostIP: fund.fees.expenseBasisPostIP,
      qIPEndIndex: feeBridge.qIPEndIndex,
      qClearIndex: hc.qClearIndex,
      thresholdN: hc.thresholdN,
      carryCumTerminal: n > 0 ? hc.carryCum[last] : 0,
      pTerminal: n > 0 ? cf.P[last] : 0,
      gcumTerminal: n > 0 ? hc.Gcum[last] : 0,
      dTerminal: n > 0 ? cf.D[last] : 0,
      quarters: qtrs,
    };
  });

  return { fundId: fund.id, scenarios };
}
