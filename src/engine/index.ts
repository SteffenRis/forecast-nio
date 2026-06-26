// Public API barrel. The PUBLIC SURFACE IS JSON-SERIALIZABLE:
//  - accepts ISO date strings (parsed to Date internally),
//  - returns plain objects/arrays/numbers (no Date objects, class instances, or
//    Maps at the boundary) — Web-Worker-ready.
// Internal modules may use Date; this layer translates at the edges.

import { parseISO } from './util/daycount';
import type {
  FundInput,
  PortfolioInput,
  PortfolioFundRef,
  TemplateInput,
  Sliders,
  FeeParams,
  ForecastOverrides,
  ActualRecord,
  FundStatus,
  OverlayParams,
  FxTable,
  CalendarQuarter,
  Money,
} from './types';
import { runFund } from './fund';
import { buildFundFeeTrace } from './feeTrace';
import type { FundFeeTrace } from './feeTrace';
import { runPortfolio } from './portfolio';
import { runOverlay } from './overlay';
import { portfolioIrrStages, kidScenario, annualCostAllocation } from './kid';
import { xirrDated } from './irr';

// ---------------------------------------------------------------------------
// JSON-serializable input shapes (ISO date strings at the boundary).
// ---------------------------------------------------------------------------

export interface FundInputJSON {
  id: string;
  name: string;
  commitment: number;
  currency: string;
  effectiveDate: string; // ISO
  investmentPeriodEnd: string; // ISO
  standardLiquidationDate: string; // ISO
  expectedLiquidationDate?: string; // ISO
  template: TemplateInput;
  sliders: Sliders;
  fees: FeeParams;
  overrides?: ForecastOverrides;
  actuals?: ActualRecord[];
  status: FundStatus;
}

export interface PortfolioFundRefJSON {
  fund: FundInputJSON;
  allocatedCommitment: number;
}

export interface PortfolioInputJSON {
  id: string;
  name: string;
  currency: string;
  size: number;
  effectiveDate: string; // ISO
  investmentPeriodEnd: string; // ISO
  funds: PortfolioFundRefJSON[];
  fx: FxTable;
  overlay: OverlayParams;
  isFoF: boolean;
}

// ---------------------------------------------------------------------------
// JSON-serializable output shapes (plain objects, no Date).
// ---------------------------------------------------------------------------

export interface FundQuarterRowJSON {
  quarter: CalendarQuarter; // {year, q} plain object
  pNet: Money;
  dNet: Money;
  nav: Money;
  netCf: Money;
  mgmtFee: Money;
  expenses: Money;
  establishment: Money;
  carry: Money;
  pGross: Money;
  dGross: Money;
  grossCf: Money;
}

export interface FundScenarioResultJSON {
  scenarioId: string;
  rows: FundQuarterRowJSON[];
  grossIrr: number | null;
  preCarryIrr: number | null;
  netIrr: number | null;
  rollingNetIrr: (number | null)[];
  hurdleBalance: number[];
  costBasis: number[];
  carryCum: number[];
  qClearIndex: number;
  thresholdN: number;
}

export interface FundForecastResult {
  fundId: string;
  scenarios: FundScenarioResultJSON[];
  remainingCallable?: number;
  warnings: { code: string; message: string; context?: Record<string, string | number> }[];
}

export interface PortfolioStageRowJSON {
  quarter: CalendarQuarter;
  paidIn: Money;
  distributions: Money;
}

export interface PortfolioScenarioResultJSON {
  scenarioId: string;
  quarters: CalendarQuarter[];
  /** Aggregated per-quarter line items (reporting ccy). */
  items: {
    quarter: CalendarQuarter;
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
  }[];
  portfolioPic: number[];
  /** §14.7 IRR stages: 3 (overlay off) or 6 (overlay on). */
  irrStages: (number | null)[];
  /** §13 KID three-stage disclosure. */
  kid: {
    stage1: PortfolioStageRowJSON[];
    stage2: PortfolioStageRowJSON[];
    stage3: PortfolioStageRowJSON[];
    annualCostAllocation: number | null;
  };
  /** Overlay detail (present only when overlay enabled). */
  overlay?: {
    overlayMgmtFee: number[];
    overlayExpenses: number[];
    overlayEstablishment: number[];
    overlayTransactionCost: number[];
    overlayCarry: number[];
    stage3P: number[];
    stage3D: number[];
    stage3NetCf: number[];
  };
}

export interface PortfolioForecastResult {
  portfolioId: string;
  quarters: CalendarQuarter[];
  scenarios: PortfolioScenarioResultJSON[];
  fundResults: FundForecastResult[];
  warnings: { code: string; message: string; context?: Record<string, string | number> }[];
}

// ---------------------------------------------------------------------------
// Boundary parsing.
// ---------------------------------------------------------------------------

function parseFund(j: FundInputJSON): FundInput {
  return {
    id: j.id,
    name: j.name,
    commitment: j.commitment,
    currency: j.currency,
    effectiveDate: parseISO(j.effectiveDate),
    investmentPeriodEnd: parseISO(j.investmentPeriodEnd),
    standardLiquidationDate: parseISO(j.standardLiquidationDate),
    ...(j.expectedLiquidationDate
      ? { expectedLiquidationDate: parseISO(j.expectedLiquidationDate) }
      : {}),
    template: j.template,
    sliders: j.sliders,
    fees: j.fees,
    ...(j.overrides ? { overrides: j.overrides } : {}),
    ...(j.actuals ? { actuals: j.actuals } : {}),
    status: j.status,
  };
}

function parsePortfolio(j: PortfolioInputJSON): PortfolioInput {
  const funds: PortfolioFundRef[] = j.funds.map((f) => ({
    fund: parseFund(f.fund),
    allocatedCommitment: f.allocatedCommitment,
  }));
  return {
    id: j.id,
    name: j.name,
    currency: j.currency,
    size: j.size,
    effectiveDate: parseISO(j.effectiveDate),
    investmentPeriodEnd: parseISO(j.investmentPeriodEnd),
    funds,
    fx: j.fx,
    overlay: j.overlay,
    isFoF: j.isFoF,
  };
}

function serializeFund(r: ReturnType<typeof runFund>): FundForecastResult {
  return {
    fundId: r.fundId,
    scenarios: r.scenarios.map((sc) => ({
      scenarioId: sc.scenarioId,
      rows: sc.rows.map((row) => ({ ...row, quarter: { ...row.quarter } })),
      grossIrr: sc.grossIrr,
      preCarryIrr: sc.preCarryIrr,
      netIrr: sc.netIrr,
      rollingNetIrr: sc.rollingNetIrr,
      hurdleBalance: sc.hurdleBalance.slice(),
      costBasis: sc.costBasis.slice(),
      carryCum: sc.carryCum.slice(),
      qClearIndex: sc.qClearIndex,
      thresholdN: sc.thresholdN,
    })),
    ...(r.remainingCallable !== undefined ? { remainingCallable: r.remainingCallable } : {}),
    warnings: r.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      ...(w.context ? { context: w.context } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// Public functions.
// ---------------------------------------------------------------------------

/** Run a single-fund forecast. Accepts ISO date strings; returns plain JSON. */
export function runFundForecast(input: FundInputJSON): FundForecastResult {
  return serializeFund(runFund(parseFund(input)));
}

/**
 * Build the fee/carry calculation trace for a single fund (per-quarter intermediates
 * + scenario scalars). Already JSON-serializable; we copy the quarter objects at the
 * boundary to keep the public surface free of shared internal references.
 */
export function runFundFeeTrace(input: FundInputJSON): FundFeeTrace {
  const t = buildFundFeeTrace(parseFund(input));
  return {
    fundId: t.fundId,
    scenarios: t.scenarios.map((sc) => ({
      ...sc,
      quarters: sc.quarters.map((q) => ({ ...q, quarter: { ...q.quarter } })),
    })),
  };
}

/** Run a portfolio forecast (with optional LP overlay). JSON in/out. */
export function runPortfolioForecast(input: PortfolioInputJSON): PortfolioForecastResult {
  const portfolio = parsePortfolio(input);
  const pres = runPortfolio(portfolio);
  const overlayRes = portfolio.overlay.enabled ? runOverlay(portfolio, pres) : undefined;

  const warnings = [...pres.warnings];
  if (overlayRes) warnings.push(...overlayRes.warnings);

  const scenarios: PortfolioScenarioResultJSON[] = pres.scenarios.map((sc) => {
    const ovsc = overlayRes?.scenarios.find((o) => o.scenarioId === sc.scenarioId);
    const irr = portfolioIrrStages(sc, ovsc);
    // Cost allocation for the KID: total underlying + overlay fees (reporting ccy).
    let costAllocation = 0;
    for (const it of sc.items) {
      costAllocation += it.mgmtFee + it.expenses + it.establishment + it.carry;
    }
    if (ovsc) {
      for (let i = 0; i < ovsc.overlayMgmtFee.length; i++) {
        costAllocation +=
          ovsc.overlayMgmtFee[i] +
          ovsc.overlayExpenses[i] +
          ovsc.overlayEstablishment[i] +
          ovsc.overlayTransactionCost[i] +
          ovsc.overlayCarry[i];
      }
    }
    const kid = kidScenario(sc, ovsc, costAllocation);

    return {
      scenarioId: sc.scenarioId,
      quarters: sc.quarters.map((q) => ({ ...q })),
      items: sc.items.map((it, i) => ({ quarter: { ...sc.quarters[i] }, ...it })),
      portfolioPic: sc.portfolioPic.slice(),
      irrStages: irr.stages,
      kid: {
        stage1: kid.stage1.map((r) => ({ ...r, quarter: { ...r.quarter } })),
        stage2: kid.stage2.map((r) => ({ ...r, quarter: { ...r.quarter } })),
        stage3: kid.stage3.map((r) => ({ ...r, quarter: { ...r.quarter } })),
        annualCostAllocation: kid.annualCostAllocation,
      },
      ...(ovsc
        ? {
            overlay: {
              overlayMgmtFee: ovsc.overlayMgmtFee.slice(),
              overlayExpenses: ovsc.overlayExpenses.slice(),
              overlayEstablishment: ovsc.overlayEstablishment.slice(),
              overlayTransactionCost: ovsc.overlayTransactionCost.slice(),
              overlayCarry: ovsc.overlayCarry.slice(),
              stage3P: ovsc.stage3P.slice(),
              stage3D: ovsc.stage3D.slice(),
              stage3NetCf: ovsc.stage3NetCf.slice(),
            },
          }
        : {}),
    };
  });

  return {
    portfolioId: pres.portfolioId,
    quarters: pres.quarters.map((q) => ({ ...q })),
    scenarios,
    fundResults: pres.fundResults.map(serializeFund),
    warnings: warnings.map((w) => ({
      code: w.code,
      message: w.message,
      ...(w.context ? { context: w.context } : {}),
    })),
  };
}

/**
 * Standalone XIRR over dated flows (ISO date strings). Returns the rate or null.
 * Matches Excel XIRR (ACT/365). Useful for spreadsheet verification.
 */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  return xirrDated(flows.map((f) => ({ date: parseISO(f.date), amount: f.amount })));
}

// Re-export annualCostAllocation edge helper and key types.
export { annualCostAllocation };
export type { FundFeeTrace, FundFeeTraceScenario, FeeTraceQuarter } from './feeTrace';
export type {
  TemplateInput,
  ScenarioTemplate,
  SparseCurve,
  Sliders,
  FeeParams,
  FeeBasis,
  ForecastOverrides,
  AnchorPoint,
  ActualRecord,
  FundStatus,
  OverlayParams,
  FxTable,
  CalendarQuarter,
  Granularity,
  CurveName,
} from './types';
