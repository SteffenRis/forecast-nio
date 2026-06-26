// Fund orchestrator: pipeline (inception-quarter timeline) → cashflows →
// costBasis → feeBridge → hurdleCarry → irr per scenario. Produces FundResult
// with itemized §10.10 rows. Cash flows are dated at the calendar quarter that
// each inception quarter maps to (1:1 by block end).

import type {
  FundInput,
  FundResult,
  FundScenarioResult,
  FundQuarterRow,
  Warning,
  Money,
} from './types';
import { runPipeline } from './pipeline';
import { computeCashflows, remainingCallable } from './cashflows';
import { computeCostBasis } from './costBasis';
import { computeFeeBridgeInception } from './feeBridge';
import { computeHurdleCarry } from './hurdleCarry';
import { xirr } from './irr';
import { calQuarterOrdinal } from './util/daycount';

/** The per-scenario inputs to the row/IRR assembly (and the trace view): the
 *  pipeline → cashflows → costBasis → feeBridge → hurdleCarry chain, computed once.
 *  Shared by runFund and the fee-trace builder so the two can never drift. */
export interface ScenarioPrimitives {
  quarters: ReturnType<typeof runPipeline>['scenarios'][number]['quarters'];
  n: number;
  lastActualIndex: number;
  cf: ReturnType<typeof computeCashflows>;
  costBasis: Money[];
  feeBridge: ReturnType<typeof computeFeeBridgeInception>;
  hc: ReturnType<typeof computeHurdleCarry>;
}

export function computeScenarioPrimitives(
  fund: FundInput,
  sc: ReturnType<typeof runPipeline>['scenarios'][number],
  effLiq: Date,
  lastActualOrd: number,
  warnings: Warning[],
): ScenarioPrimitives {
  const quarters = sc.quarters; // calendar quarter per inception index
  const n = quarters.length;
  const lastActualIndex =
    lastActualOrd >= 0
      ? quarters.findIndex((q) => calQuarterOrdinal(q) === lastActualOrd)
      : -1;

  const cf = computeCashflows({
    scenarioId: sc.scenarioId,
    quarters,
    pic: sc.pic,
    dpi: sc.dpi,
    tvpi: sc.tvpi,
    commitment: fund.commitment,
    warnings,
    status: fund.status,
    lastActualIndex,
  });

  const costBasis = computeCostBasis(cf.P, cf.D, sc.terminalTvpi, warnings, sc.scenarioId);

  const feeBridge = computeFeeBridgeInception({
    nInc: n,
    P: cf.P,
    NAV: cf.NAV,
    costBasis,
    commitment: fund.commitment,
    effectiveDate: fund.effectiveDate,
    investmentPeriodEnd: fund.investmentPeriodEnd,
    effLiq,
    fees: fund.fees,
  });

  const hc = computeHurdleCarry({
    p: cf.p,
    d: cf.d,
    P: cf.P,
    D: cf.D,
    hurdleAnnual: fund.fees.hurdleAnnual,
    carryRate: fund.fees.carryRate,
    catchUp: fund.fees.catchUp,
  });

  return { quarters, n, lastActualIndex, cf, costBasis, feeBridge, hc };
}

export function runFund(fund: FundInput): FundResult {
  const warnings: Warning[] = [];
  const pipeline = runPipeline(fund);
  warnings.push(...pipeline.warnings);

  const effLiq = fund.expectedLiquidationDate ?? fund.standardLiquidationDate;

  // Map actuals to last-actual index (status zeroing) via calendar quarter.
  const actualOrds = (fund.actuals ?? []).map((a) => calQuarterOrdinal(a.quarter));
  const lastActualOrd = actualOrds.length ? Math.max(...actualOrds) : -1;

  const scenarios: FundScenarioResult[] = [];

  for (const sc of pipeline.scenarios) {
    const { quarters, n, cf, costBasis, feeBridge, hc } = computeScenarioPrimitives(
      fund,
      sc,
      effLiq,
      lastActualOrd,
      warnings,
    );

    const rows: FundQuarterRow[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const pNet = cf.p[i];
      const dNet = cf.d[i];
      const mgmt = feeBridge.mgmtFee[i];
      const exp = feeBridge.expenses[i];
      const est = feeBridge.establishment[i];
      const carry = hc.carry[i];
      const pg = pNet - mgmt - exp - est; // §10.9 gross paid-in (deployed)
      const dg = dNet + carry; // gross distribution (pre-carry harvest)
      rows[i] = {
        quarter: quarters[i],
        pNet,
        dNet,
        nav: cf.NAV[i],
        netCf: dNet - pNet,
        mgmtFee: mgmt,
        expenses: exp,
        establishment: est,
        carry,
        pGross: pg,
        dGross: dg,
        grossCf: dg - pg,
      };
    }

    // §14.6 terminal IRRs (eval at last quarter).
    const evalIndex = n - 1;
    const navAtEval = cf.NAV[evalIndex];

    const grossCf = rows.map((r) => r.dGross - r.pGross);
    const preCarryCf = rows.map((r) => r.dGross - r.pNet);
    const netCf = rows.map((r) => r.dNet - r.pNet);

    const grossIrr = xirr({ quarters, cf: grossCf, navAtEval, evalIndex });
    const preCarryIrr = xirr({ quarters, cf: preCarryCf, navAtEval, evalIndex });
    const netIrr = xirr({ quarters, cf: netCf, navAtEval, evalIndex });

    const rollingNetIrr: (number | null)[] = new Array(n);
    for (let e = 0; e < n; e++) {
      rollingNetIrr[e] = xirr({
        quarters,
        cf: netCf,
        navAtEval: cf.NAV[e],
        evalIndex: e,
      });
    }

    scenarios.push({
      scenarioId: sc.scenarioId,
      rows,
      grossIrr,
      preCarryIrr,
      netIrr,
      rollingNetIrr,
      hurdleBalance: hc.B,
      costBasis,
      carryCum: hc.carryCum,
      qClearIndex: hc.qClearIndex,
      thresholdN: hc.thresholdN,
    });
  }

  const result: FundResult = {
    fundId: fund.id,
    scenarios,
    warnings,
  };

  if (fund.actuals && fund.actuals.length) {
    const last = fund.actuals.reduce((a, b) =>
      calQuarterOrdinal(b.quarter) > calQuarterOrdinal(a.quarter) ? b : a,
    );
    result.remainingCallable = remainingCallable(
      fund.commitment,
      last.cumulativePaidIn,
      last.recallableBalance ?? 0,
      warnings,
    );
  }

  return result;
}

// Re-export the inception cashflow/fee result type pieces other modules need.
export type { FundResult };
