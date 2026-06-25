// ---------------------------------------------------------------------------
// Store entity types = the RAW INPUTS of the app. (See ARCHITECTURE.md.)
// Nothing here is derived — no curves, fees, IRRs, or aggregates are ever stored.
// Dates are ISO 'YYYY-MM-DD' strings (JSON-serializable; the engine parses them).
// Calendar quarters are { year, q } to match the engine's CalendarQuarter.
// ---------------------------------------------------------------------------

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
