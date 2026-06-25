// §13 KID three-stage disclosure output + §14.7 portfolio IRR stages.

import type { CalendarQuarter, Money, Warning } from './types';
import type { PortfolioScenarioAgg } from './portfolio';
import type { OverlayScenarioResult } from './overlay';
import { xirr } from './irr';

export interface KidStageRow {
  quarter: CalendarQuarter;
  paidIn: Money;
  distributions: Money;
}

export interface KidScenario {
  scenarioId: string;
  stage1: KidStageRow[]; // gross
  stage2: KidStageRow[]; // net of underlying fees
  stage3: KidStageRow[]; // net of LP-level fees
  /** annualCostAllocation (null when span is 0 / non-finite). */
  annualCostAllocation: number | null;
}

/**
 * §14.7 Portfolio IRR stages.
 *  Overlay off → 3 stages; on → 6 stages.
 * Each stage's per-quarter cash flow series, dated at calendar-quarter ends,
 * with the final flow including the aggregated NAV as virtual liquidation.
 */
export interface PortfolioIrrStages {
  scenarioId: string;
  stages: (number | null)[]; // length 3 or 6
}

export function portfolioIrrStages(
  sc: PortfolioScenarioAgg,
  overlay: OverlayScenarioResult | undefined,
): PortfolioIrrStages {
  const quarters = sc.quarters;
  const n = quarters.length;
  const evalIndex = n - 1;
  const navAtEval = sc.items.reduce(
    (_acc, _it, i) => (i === evalIndex ? sc.items[i].nav : 0),
    0,
  );
  // The aggregated NAV stock at terminal:
  const navTerminal = sc.items[evalIndex].nav;

  const stage1Cf = sc.items.map((it) => it.dGross - it.pGross);
  const stage2Cf = sc.items.map((it) => it.dGross - it.pNet);
  const stage3Cf = sc.items.map((it) => it.dNet - it.pNet);

  const s1 = xirr({ quarters, cf: stage1Cf, navAtEval: navTerminal, evalIndex });
  const s2 = xirr({ quarters, cf: stage2Cf, navAtEval: navTerminal, evalIndex });
  const s3 = xirr({ quarters, cf: stage3Cf, navAtEval: navTerminal, evalIndex });

  if (!overlay) {
    return { scenarioId: sc.scenarioId, stages: [s1, s2, s3] };
  }

  // Stage 4: Stage 3 − overlay_mgmt_fee.
  // Stage 5: Stage 4 − overlay_expenses − overlay_establishment.
  // Stage 6: Stage 5 − overlay_carry.
  const stage4Cf = new Array(n);
  const stage5Cf = new Array(n);
  const stage6Cf = new Array(n);
  for (let i = 0; i < n; i++) {
    const base = sc.items[i].dNet - sc.items[i].pNet;
    stage4Cf[i] = base - overlay.overlayMgmtFee[i];
    stage5Cf[i] = stage4Cf[i] - overlay.overlayExpenses[i] - overlay.overlayEstablishment[i];
    stage6Cf[i] = stage5Cf[i] - overlay.overlayCarry[i];
  }
  const s4 = xirr({ quarters, cf: stage4Cf, navAtEval: navTerminal, evalIndex });
  const s5 = xirr({ quarters, cf: stage5Cf, navAtEval: navTerminal, evalIndex });
  const s6 = xirr({ quarters, cf: stage6Cf, navAtEval: navTerminal, evalIndex });

  return { scenarioId: sc.scenarioId, stages: [s1, s2, s3, s4, s5, s6] };
}

/** §13 KID stages for one scenario. */
export function kidScenario(
  sc: PortfolioScenarioAgg,
  overlay: OverlayScenarioResult | undefined,
  costAllocation: number,
): KidScenario {
  const quarters = sc.quarters;
  const stage1: KidStageRow[] = quarters.map((q, i) => ({
    quarter: q,
    paidIn: sc.items[i].pGross,
    distributions: sc.items[i].dGross,
  }));
  const stage2: KidStageRow[] = quarters.map((q, i) => ({
    quarter: q,
    paidIn: sc.items[i].pNet,
    distributions: sc.items[i].dNet,
  }));
  let stage3: KidStageRow[];
  if (overlay) {
    stage3 = quarters.map((q, i) => ({
      quarter: q,
      paidIn: overlay.stage3P[i],
      distributions: overlay.stage3D[i],
    }));
  } else {
    // Overlay disabled → Stage 3 = Stage 2 identically.
    stage3 = stage2.map((r) => ({ ...r }));
  }

  // annualCostAllocation = costAllocation / (quarters.length / 4).
  const span = quarters.length / 4;
  const annualCostAllocation =
    span === 0 || !Number.isFinite(span) ? null : costAllocation / span;

  return { scenarioId: sc.scenarioId, stage1, stage2, stage3, annualCostAllocation };
}

/** Helper used by tests: annualCostAllocation edge logic in isolation. */
export function annualCostAllocation(
  costAllocation: number,
  quartersLength: number,
): number | null {
  const span = quartersLength / 4;
  if (span === 0 || !Number.isFinite(span)) return null;
  return costAllocation / span;
}

export type { Warning };
