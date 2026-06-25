// §12 LP overlay (the FoF's own fee structure).
// Structurally identical to §10 but on aggregated portfolio cash flows and
// overlay parameters. Commitment basis = Portfolio.size (reporting ccy), fixed
// from establishment. Reuses hurdleCarry/feeBridge mechanics. Stage-3 assembly.

import type {
  PortfolioInput,
  Money,
  CalendarQuarter,
  Warning,
} from './types';
import type { PortfolioResult, PortfolioScenarioAgg } from './portfolio';
import type { FundResult } from './types';
import { computeHurdleCarry } from './hurdleCarry';
import { feeBasisStock } from './feeBridge';
import { computeCostBasis } from './costBasis';
import {
  calQuarterOrdinal,
  quarterOf,
} from './util/daycount';

export interface OverlayScenarioResult {
  scenarioId: string;
  quarters: CalendarQuarter[];
  overlayMgmtFee: Money[];
  overlayExpenses: Money[];
  overlayEstablishment: Money[];
  overlayTransactionCost: Money[];
  overlayCarry: Money[];
  /** Stage-3 paid-in / distributions / net cf (reporting ccy). */
  stage3P: Money[];
  stage3D: Money[];
  stage3NetCf: Money[];
  /** Overlay hurdle balance trajectory. */
  overlayB: Money[];
}

export interface OverlayResult {
  scenarios: OverlayScenarioResult[];
  warnings: Warning[];
}

/**
 * Compute overlay for a portfolio. Requires the aggregated portfolio result and
 * the per-fund results (to build cost_basis / NAV / paid-in basis stocks).
 */
export function runOverlay(
  portfolio: PortfolioInput,
  portfolioResult: PortfolioResult,
): OverlayResult {
  const warnings: Warning[] = [];
  const ov = portfolio.overlay;
  const out: OverlayScenarioResult[] = [];

  if (!ov.enabled) {
    return { scenarios: [], warnings };
  }

  const rawEstablishOrd = calQuarterOrdinal(quarterOf(portfolio.effectiveDate));
  const qOverlayIPEndOrd = calQuarterOrdinal(quarterOf(portfolio.investmentPeriodEnd));

  for (const sc of portfolioResult.scenarios) {
    const quarters = sc.quarters;
    const n = quarters.length;
    // Clamp the establishment quarter to the grid: if the portfolio's effective
    // date precedes the first aggregated-flow quarter, establishment (and thus
    // the overlay commitment/fee window) starts at the first grid quarter — the
    // overlay accrues over the same calendar quarters as the underlying flows.
    const gridStartOrd = n > 0 ? calQuarterOrdinal(quarters[0]) : rawEstablishOrd;
    const qEstablishOrd = Math.max(rawEstablishOrd, gridStartOrd);

    // Overlay commitment(q) = 0 before establishment, else Portfolio.size.
    const overlayCommitment: Money[] = quarters.map((q) =>
      calQuarterOrdinal(q) < qEstablishOrd ? 0 : portfolio.size,
    );

    // Basis stocks: cost_basis / nav / paid_in aggregated across funds in
    // reporting ccy, per fee_basis_fx_policy. For 'spot' we use the same flat FX
    // already applied in aggregation (items are in reporting ccy). We reconstruct
    // the aggregated cost_basis / nav / paid_in from per-fund results.
    const aggCostBasis = new Array(n).fill(0) as Money[];
    const aggNav = new Array(n).fill(0) as Money[];
    const aggPaidIn = new Array(n).fill(0) as Money[];

    const ordToIndex = new Map<number, number>();
    quarters.forEach((q, i) => ordToIndex.set(calQuarterOrdinal(q), i));

    for (let fi = 0; fi < portfolio.funds.length; fi++) {
      const fref = portfolio.funds[fi];
      const fr: FundResult = portfolioResult.fundResults[fi];
      const fsc = fr.scenarios.find((s) => s.scenarioId === sc.scenarioId);
      if (!fsc) continue;
      const pr = fref.allocatedCommitment / fref.fund.commitment;
      const rate = fxForOverlay(portfolio, fref.fund.currency, qEstablishOrd, warnings);
      const factor = pr * rate;
      // Cumulative paid-in P(fund,q) and NAV(fund,q) and cost_basis(fund,q).
      let cumP = 0;
      for (let i = 0; i < fsc.rows.length; i++) {
        const row = fsc.rows[i];
        cumP += row.pNet;
        const idx = ordToIndex.get(calQuarterOrdinal(row.quarter));
        if (idx === undefined) continue;
        aggPaidIn[idx] += cumP * factor;
        aggNav[idx] += row.nav * factor;
        aggCostBasis[idx] += fsc.costBasis[i] * factor;
      }
    }

    const overlayMgmtFee: Money[] = new Array(n).fill(0);
    const overlayExpenses: Money[] = new Array(n).fill(0);
    const overlayEstablishment: Money[] = new Array(n).fill(0);
    const overlayTransactionCost: Money[] = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const ord = calQuarterOrdinal(quarters[i]);
      const inIP = ord <= qOverlayIPEndOrd;
      const mBasis = inIP ? ov.mgmtBasisIP : ov.mgmtBasisPostIP;
      const mRate = inIP ? ov.mgmtRateIP : ov.mgmtRatePostIP;
      const eBasis = inIP ? ov.expenseBasisIP : ov.expenseBasisPostIP;
      const eRate = inIP ? ov.expenseRateIP : ov.expenseRatePostIP;

      const mStock = overlayBasisStock(
        mBasis,
        overlayCommitment[i],
        aggCostBasis[i],
        aggNav[i],
        aggPaidIn[i],
      );
      const eStock = overlayBasisStock(
        eBasis,
        overlayCommitment[i],
        aggCostBasis[i],
        aggNav[i],
        aggPaidIn[i],
      );
      overlayMgmtFee[i] = mStock * (mRate / 4);
      overlayExpenses[i] = eStock * (eRate / 4);

      // Establishment once at the establishment quarter (= size·rate).
      if (ord === qEstablishOrd) {
        overlayEstablishment[i] = overlayCommitment[i] * ov.establishmentRate;
      }

      // Transaction cost: per underlying fund whose effective_date is in q.
      let txnCount = 0;
      for (const fref of portfolio.funds) {
        if (calQuarterOrdinal(quarterOf(fref.fund.effectiveDate)) === ord) txnCount++;
      }
      overlayTransactionCost[i] = ov.txnCostPerInvestment * txnCount;
    }

    // Overlay paid-in stream (aggregated portfolio p_net) and Stage-2 dists.
    const stage2P = sc.items.map((it) => it.pNet);
    const stage2D = sc.items.map((it) => it.dNet);

    // Overlay hurdle & carry on the overlay paid-in stream and Stage-2 dists.
    const Pcum: Money[] = new Array(n);
    const Dcum: Money[] = new Array(n);
    let aP = 0;
    let aD = 0;
    for (let i = 0; i < n; i++) {
      aP += stage2P[i];
      aD += stage2D[i];
      Pcum[i] = aP;
      Dcum[i] = aD;
    }
    const hc = computeHurdleCarry({
      p: stage2P,
      d: stage2D,
      P: Pcum,
      D: Dcum,
      hurdleAnnual: ov.hurdleAnnual,
      carryRate: ov.carryRate,
      catchUp: ov.catchUp,
    });

    // Stage-3 assembly (§12).
    const stage3P: Money[] = new Array(n);
    const stage3D: Money[] = new Array(n);
    const stage3NetCf: Money[] = new Array(n);
    for (let i = 0; i < n; i++) {
      stage3D[i] = stage2D[i] - hc.carry[i];
      stage3P[i] =
        stage2P[i] +
        overlayMgmtFee[i] +
        overlayTransactionCost[i] +
        overlayExpenses[i] +
        overlayEstablishment[i];
      stage3NetCf[i] = stage3D[i] - stage3P[i];
    }

    out.push({
      scenarioId: sc.scenarioId,
      quarters,
      overlayMgmtFee,
      overlayExpenses,
      overlayEstablishment,
      overlayTransactionCost,
      overlayCarry: hc.carry,
      stage3P,
      stage3D,
      stage3NetCf,
      overlayB: hc.B,
    });
  }

  return { scenarios: out, warnings };
}

/** FX for overlay fee basis, per fee_basis_fx_policy (here flat → same rate). */
function fxForOverlay(
  portfolio: PortfolioInput,
  fundCcy: string,
  _qEstablishOrd: number,
  warnings: Warning[],
): number {
  if (fundCcy === portfolio.currency) return 1;
  const direct = portfolio.fx.rates[`${fundCcy}->${portfolio.currency}`];
  if (direct !== undefined) return direct;
  const inv = portfolio.fx.rates[`${portfolio.currency}->${fundCcy}`];
  if (inv !== undefined && inv !== 0) return 1 / inv;
  warnings.push({
    code: 'fx_rate_missing',
    message: `Missing FX ${fundCcy}->${portfolio.currency} for overlay basis.`,
  });
  throw new Error(`FXRateMissing: ${fundCcy}->${portfolio.currency}`);
}

function overlayBasisStock(
  basis: PortfolioInput['overlay']['mgmtBasisIP'],
  commitment: Money,
  costBasisQ: Money,
  navQ: Money,
  paidInQ: Money,
): Money {
  // Reuse feeBasisStock with pr=1 (no fund-life pro-rata at FoF level).
  return feeBasisStock(basis, commitment, costBasisQ, navQ, paidInQ, 1);
}

// Re-export for KID/IRR reuse.
export { computeCostBasis };
export type { PortfolioScenarioAgg };
