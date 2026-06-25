// All input + output types for the engine.
// Two NEVER-conflated index spaces:
//   - InceptionQuarter: 1-indexed integer relative to a fund's effective date.
//   - CalendarQuarter:   {year, q} absolute calendar position.
// Unit-discipline aliases (compile-time only): Ratio vs Money.

import type { CalendarQuarter } from './util/daycount';
import type { Warning } from './warnings';

export type { CalendarQuarter } from './util/daycount';
export type { Warning, WarningCode } from './warnings';

/** A dimensionless ratio (PIC/DPI/TVPI multiplier, share, rate...). */
export type Ratio = number;
/** A currency amount in some currency's minor-unit-aware major unit. */
export type Money = number;
/** 1-indexed inception-quarter integer. */
export type InceptionQuarter = number;

// ---------------------------------------------------------------------------
// Template curves (§2)
// ---------------------------------------------------------------------------

export type CurveName = 'pic' | 'dpi' | 'tvpi';

export type Granularity = 'annual' | 'quarterly';

/** A sparse cumulative ratio curve: control points at period indices. */
export interface SparseCurve {
  /** Period index points (1-indexed). For annual, this is a year index; for
   *  quarterly it is an inception-quarter index. */
  points: { period: number; value: Ratio }[];
}

/** A scenario's three template curves. */
export interface ScenarioTemplate {
  /** Scenario id, e.g. "base", "low", "high". */
  id: string;
  /** Whether this is the base scenario (sliders + concentration anchor). */
  isBase: boolean;
  pic: SparseCurve;
  dpi: SparseCurve;
  tvpi: SparseCurve;
}

export interface TemplateInput {
  granularity: Granularity;
  scenarios: ScenarioTemplate[];
}

// ---------------------------------------------------------------------------
// Sliders (§3) & concentration (§4)
// ---------------------------------------------------------------------------

export interface Sliders {
  /** §3.1 Ultimate DPI multiplier ∈ [0.5, 2.0], default 1.0. */
  dpiMultiplier: Ratio;
  /** §3.2 DPI timing ∈ [−1.0, +1.0], default 0.0. */
  dpiTiming: Ratio;
  /** §4 Concentration ∈ [0.0, 2.0], default 1.0. */
  concentration: Ratio;
}

// ---------------------------------------------------------------------------
// Fee / carry parameters (§10)
// ---------------------------------------------------------------------------

export type FeeBasis = 'commitment' | 'cost_basis' | 'nav' | 'paid_in';

export interface FeeParams {
  /** Management fee rate during IP (annual, e.g. 0.02). */
  mgmtRateIP: Ratio;
  /** Management fee rate post-IP (annual). */
  mgmtRatePostIP: Ratio;
  /** Management fee basis during IP. Default 'commitment'. */
  mgmtBasisIP: FeeBasis;
  /** Management fee basis post-IP. Default 'cost_basis'. */
  mgmtBasisPostIP: FeeBasis;

  /** Expense rate during IP (annual). */
  expenseRateIP: Ratio;
  /** Expense rate post-IP (annual). */
  expenseRatePostIP: Ratio;
  /** Expense basis during IP. */
  expenseBasisIP: FeeBasis;
  /** Expense basis post-IP. */
  expenseBasisPostIP: FeeBasis;

  /** One-time establishment rate on commitment (e.g. 0.005). */
  establishmentRate: Ratio;

  /** Carry rate (e.g. 0.20). */
  carryRate: Ratio;
  /** Hurdle annual rate (e.g. 0.08). */
  hurdleAnnual: Ratio;
  /** Whether a 100% GP catch-up applies. */
  catchUp: boolean;
}

// ---------------------------------------------------------------------------
// Overrides (§6) & actuals (§7)
// ---------------------------------------------------------------------------

export interface AnchorPoint {
  /** Calendar quarter of the anchor. */
  quarter: CalendarQuarter;
  value: Ratio;
}

export interface ForecastOverrides {
  pic?: AnchorPoint[];
  dpi?: AnchorPoint[];
  tvpi?: AnchorPoint[];
}

export type FundStatus = 'ACTIVE' | 'WOUND_DOWN' | 'ABANDONED';

export interface ActualRecord {
  quarter: CalendarQuarter;
  cumulativePaidIn: Money;
  cumulativeDistributions: Money;
  nav: Money;
  /** Recallable-distributions balance for remaining-callable scalar (§9). */
  recallableBalance?: Money;
}

// ---------------------------------------------------------------------------
// Fund input (internal — uses Date / CalendarQuarter)
// ---------------------------------------------------------------------------

export interface FundInput {
  id: string;
  name: string;
  /** Commitment in the fund's investment currency. */
  commitment: Money;
  /** Investment currency code, e.g. "EUR". */
  currency: string;
  /** Effective date. */
  effectiveDate: Date;
  /** Expected investment-period end. */
  investmentPeriodEnd: Date;
  /** Standard liquidation date (fund-life end if no expected override). */
  standardLiquidationDate: Date;
  /** Expected liquidation date override (optional). */
  expectedLiquidationDate?: Date;

  template: TemplateInput;
  sliders: Sliders;
  fees: FeeParams;

  overrides?: ForecastOverrides;
  actuals?: ActualRecord[];
  status: FundStatus;
}

// ---------------------------------------------------------------------------
// Dense per-scenario curve output (§5–§8)
// ---------------------------------------------------------------------------

/** Dense, calendar-indexed curves for one scenario. */
export interface DenseScenarioCurves {
  scenarioId: string;
  /** Aligned arrays; quarters[i] corresponds to pic[i] etc. */
  quarters: CalendarQuarter[];
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
}

// ---------------------------------------------------------------------------
// Cash flows (§9)
// ---------------------------------------------------------------------------

export interface ScenarioCashflows {
  scenarioId: string;
  quarters: CalendarQuarter[];
  P: Money[]; // cumulative paid-in
  D: Money[]; // cumulative distributions
  NAV: Money[]; // stock
  p: Money[]; // periodic paid-in
  d: Money[]; // periodic distributions
  N: Money[]; // periodic net cash flow d − p
}

// ---------------------------------------------------------------------------
// Fee bridge (§10) per-quarter itemized output
// ---------------------------------------------------------------------------

export interface FundQuarterRow {
  quarter: CalendarQuarter;
  pNet: Money;
  dNet: Money;
  nav: Money;
  netCf: Money; // dNet − pNet
  mgmtFee: Money;
  expenses: Money;
  establishment: Money;
  carry: Money;
  pGross: Money;
  dGross: Money;
  grossCf: Money; // dGross − pGross
}

export interface FundScenarioResult {
  scenarioId: string;
  rows: FundQuarterRow[];
  /** Terminal IRRs (§14.6). null if undefined. */
  grossIrr: number | null;
  preCarryIrr: number | null;
  netIrr: number | null;
  /** Per-quarter rolling IRRs (net), aligned with rows. */
  rollingNetIrr: (number | null)[];
  /** Hurdle balance trajectory B(q), aligned with rows. */
  hurdleBalance: Money[];
  /** Cost basis trajectory, aligned with rows. */
  costBasis: Money[];
  /** Cumulative carry, aligned with rows. */
  carryCum: Money[];
  /** Quarter index (into rows) where carry durably triggered, or -1. */
  qClearIndex: number;
  /** threshold_N for no-catch-up funds (else 0). */
  thresholdN: Money;
}

export interface FundResult {
  fundId: string;
  scenarios: FundScenarioResult[];
  /** remaining_callable scalar (§9), if actuals present. */
  remainingCallable?: Money;
  warnings: Warning[];
}

// ---------------------------------------------------------------------------
// Portfolio (§11) & overlay (§12)
// ---------------------------------------------------------------------------

export interface OverlayParams {
  enabled: boolean;
  mgmtRateIP: Ratio;
  mgmtRatePostIP: Ratio;
  mgmtBasisIP: FeeBasis;
  mgmtBasisPostIP: FeeBasis;
  expenseRateIP: Ratio;
  expenseRatePostIP: Ratio;
  expenseBasisIP: FeeBasis;
  expenseBasisPostIP: FeeBasis;
  establishmentRate: Ratio;
  carryRate: Ratio;
  hurdleAnnual: Ratio;
  catchUp: boolean;
  /** Per-underlying-fund transaction cost (reporting ccy, default 0). */
  txnCostPerInvestment: Money;
  /** Fee-basis FX policy. */
  feeBasisFxPolicy: 'locked' | 'spot';
}

export interface PortfolioFundRef {
  fund: FundInput;
  /** Allocated commitment (in the fund's currency). */
  allocatedCommitment: Money;
}

/**
 * FX rates keyed by "FROM->TO". Per-quarter rates may be supplied; here we use
 * a flat rate map for simplicity (a function could be supplied at the boundary).
 */
export interface FxTable {
  /** key: `${from}->${to}` → rate (multiply amount in `from` to get `to`). */
  rates: Record<string, number>;
}

export interface PortfolioInput {
  id: string;
  name: string;
  /** Reporting currency. */
  currency: string;
  /** Portfolio committed size in reporting currency (overlay commitment basis). */
  size: Money;
  effectiveDate: Date;
  investmentPeriodEnd: Date;
  funds: PortfolioFundRef[];
  fx: FxTable;
  overlay: OverlayParams;
  /** Whether this is a FoF (establishment-gates the PIC denominator). */
  isFoF: boolean;
}

// ---------------------------------------------------------------------------
// Internal calendar-mapped scenario after §5/§6/§7
// ---------------------------------------------------------------------------

export interface PipelineScenarioOutput extends DenseScenarioCurves {
  /** Terminal TVPI (= terminal DPI) for this scenario, for cost basis. */
  terminalTvpi: Ratio;
}

export interface PipelineOutput {
  scenarios: PipelineScenarioOutput[];
  warnings: Warning[];
  /** Quarter range covered (calendar). */
  quarters: CalendarQuarter[];
}
