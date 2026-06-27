// ---------------------------------------------------------------------------
// Store entity types = the RAW INPUTS of the app. (See ARCHITECTURE.md.)
// Nothing here is derived — no curves, fees, IRRs, or aggregates are ever stored.
// Dates are ISO 'YYYY-MM-DD' strings (JSON-serializable; the engine parses them).
// Calendar quarters are { year, q } to match the engine's CalendarQuarter.
// ---------------------------------------------------------------------------

import type { FundInputJSON } from '@/engine'

export type IsoDate = string // 'YYYY-MM-DD'

export interface CalendarQuarterRef {
  year: number
  q: 1 | 2 | 3 | 4
}

export type CurveKind = 'pic' | 'dpi' | 'tvpi'
export type FeeBasis = 'commitment' | 'cost_basis' | 'nav' | 'paid_in'
export type FundStatus = 'ACTIVE' | 'WOUND_DOWN' | 'ABANDONED'
export type FxPolicy = 'locked' | 'spot'
export type Granularity = 'annual' | 'quarterly'

/** How the go-forward forecast reacts when actuals arrive (§7).
 *  - 'rebase'    : snap the forward curve onto the plan's absolute trajectory (full
 *                  catch-up in the first forecast quarter). The engine's legacy default.
 *  - 'scale'     : catch-up gradually to the original terminal (remaining increments
 *                  scaled by a common factor, relative pacing preserved).
 *  - 'keep_plan' : remaining increments stay at planned size; the terminal floats. */
export type ForecastPolicyMode = 'rebase' | 'scale' | 'keep_plan'

export interface ForecastPolicy {
  mode: ForecastPolicyMode
}

/** Strategy classification for a template. */
export type AssetClass =
  | 'large_cap_buyout'
  | 'mid_cap_buyout'
  | 'small_cap_buyout'
  | 'venture'
  | 'growth'
  | 'private_credit'
  | 'real_assets'

// ---- Templates -----------------------------------------------------------

/** One sparse cumulative-ratio sample on a curve, at an inception-period index. */
export interface SparsePoint {
  periodIndex: number
  value: number
}

/** A scenario = three sparse cumulative ratio curves (PIC/DPI/TVPI).
 *  A template always carries exactly four: Low-low · Low · Base · High. */
export interface Scenario {
  id: string
  name: string
  isBase: boolean
  /** Authoring helper (§3.1-style): ultimate DPI as a fraction of base's, used to
   *  seed dpi/tvpi = base × factor. 1.0 for the base case. Not read by the engine —
   *  the concrete curves below are the source of truth. */
  dpiVsBase: number
  pic: SparsePoint[]
  dpi: SparsePoint[]
  tvpi: SparsePoint[]
}

export interface Template {
  id: string
  name: string
  description: string
  assetClass: AssetClass
  /** Fund life in years — drives the annual row count of every case (§annual). */
  fundLifeYears: number
  granularity: Granularity
  scenarios: Record<string, Scenario>
  scenarioOrder: string[]
  baseScenarioId: string
}

// ---- Funds ---------------------------------------------------------------

export interface FundSliders {
  /** Ultimate DPI multiplier ∈ [0.5, 2.0], default 1.0 (§3.1). */
  dpiMultiplier: number
  /** DPI timing ∈ [-1.0, +1.0], default 0.0 (§3.2). */
  dpiTiming: number
  /** Scenario concentration ∈ [0.0, 2.0], default 1.0 (§4). */
  concentration: number
}

export interface FeeTerms {
  mgmtRateIp: number
  mgmtRatePostIp: number
  mgmtBasisIp: FeeBasis
  mgmtBasisPostIp: FeeBasis
  expenseRateIp: number
  expenseRatePostIp: number
  expenseBasisIp: FeeBasis
  expenseBasisPostIp: FeeBasis
  establishmentRate: number
  /** End of the investment period (§10.1 q_IP_end). */
  investmentPeriodEnd: IsoDate
  carryRate: number
  hurdleAnnual: number
  catchUp: boolean
}

/** User anchor point applied to a calendar-mapped curve (§6). */
export interface ForecastOverride {
  curve: CurveKind
  quarter: CalendarQuarterRef
  value: number
}

/** Realized data for a quarter (§7). */
export interface ActualsRecord {
  quarter: CalendarQuarterRef
  cumulativePaidIn: number
  cumulativeDistributions: number
  nav: number
  recallableDistributions?: number
}

/** A frozen "the forecast we started with" — the original underwriting plan.
 *  It is a fully-resolved engine input (template inlined BY VALUE, actuals removed),
 *  so re-running the engine on it reproduces the original forecast and is immune to
 *  later edits of the fund, its template, sliders, fees, or overrides. This is still
 *  RAW INPUTS — `FundInputJSON` carries zero derived numbers; the forecast itself is
 *  derived on read by `selectFundSetForecast`. (See ARCHITECTURE.md.) */
export interface SetForecastSnapshot {
  /** ISO timestamp the snapshot was set. Descriptive only — never read by the engine. */
  setAt: string
  /** The frozen engine input (no actuals). Feed straight to runFundForecast. */
  input: FundInputJSON
}

export interface Fund {
  id: string
  name: string
  /** The GP / manager name. Descriptive only — not read by the engine. */
  gpName?: string
  templateId: string
  commitment: number
  /** GP fund size at final close. Descriptive context only — not read by the engine. */
  fundSizeActual?: number
  /** GP target size at first close. Descriptive context only — not read by the engine. */
  targetFundSize?: number
  currency: string
  /** When the LP committed (signed). Descriptive only — the engine uses effectiveDate. */
  acceptanceDate?: IsoDate
  effectiveDate: IsoDate
  /** If unset, falls back to standardLiquidationDate (§6 / §10.1). */
  expectedLiquidationDate?: IsoDate
  /** Derived in the editor from effectiveDate + the template's fundLifeYears; the
   *  engine's liquidation fallback when expectedLiquidationDate is unset. */
  standardLiquidationDate: IsoDate
  status: FundStatus
  sliders: FundSliders
  fees: FeeTerms
  overrides: ForecastOverride[]
  actuals: ActualsRecord[]
  /** §7 actuals-update policy. Defaults to { mode: 'scale' } when absent. */
  policy?: ForecastPolicy
  /** The frozen "set forecast" baseline (the one we started with). Absent until set. */
  setForecast?: SetForecastSnapshot
}

// ---- Portfolios ----------------------------------------------------------

export interface Allocation {
  allocatedCommitment: number
}

/** The FoF's own (LP-level) fee structure (§12). */
export interface OverlayParams {
  mgmtRateIp: number
  mgmtRatePostIp: number
  mgmtBasisIp: FeeBasis
  mgmtBasisPostIp: FeeBasis
  expenseRate: number
  expenseBasisIp: FeeBasis
  expenseBasisPostIp: FeeBasis
  establishmentRate: number
  carryRate: number
  hurdleAnnual: number
  catchUp: boolean
  txnCostPerInvestment: number
  valueFees: number
  feeBasisFxPolicy: FxPolicy
}

export interface Portfolio {
  id: string
  name: string
  reportingCurrency: string
  /** FoF committed capital — overlay commitment basis (§12). */
  size?: number
  effectiveDate?: IsoDate
  investmentPeriodEndDate?: IsoDate
  /** fundId → allocation. */
  allocations: Record<string, Allocation>
  /** 'FROM>TO' (e.g. 'EUR>USD') → flat rate. Per-quarter FX is a later refinement. */
  fx: Record<string, number>
  /** null = overlay disabled. */
  overlay: OverlayParams | null
}

// ---- Exchange rates ------------------------------------------------------

/** One exchange rate pulled from frankfurter.dev (ECB reference rates).
 *  Observed reference data = a RAW INPUT, never a derived/engine number.
 *  `base → quote` is the rate as requested for `date`; see ARCHITECTURE.md for
 *  the single, user-triggered network call that produces these. */
export interface PulledRate {
  base: string
  quote: string
  /** The date we asked for — one of the system's relevant dates. */
  date: IsoDate
  /** The date frankfurter actually returned. ECB rates skip weekends/holidays,
   *  so this can be the nearest prior business day (ecbDate ≤ date). */
  ecbDate: IsoDate
  /** Units of `quote` per 1 unit of `base`. */
  rate: number
  /** ISO timestamp of when the pull happened. */
  fetchedAt: string
}

// ---- Settings & UI -------------------------------------------------------

export interface Settings {
  defaultCurrency: string
  locale: string
  /** Headline IRR convention etc. can grow here. */
  showRollingIrr: boolean
}

export interface UiState {
  sidebarCollapsed: boolean
  selectedTemplateId?: string
  selectedFundId?: string
  selectedPortfolioId?: string
  activeScenarioId?: string
}
