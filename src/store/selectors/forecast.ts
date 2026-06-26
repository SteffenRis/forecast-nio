// The store → engine bridge. Maps raw store entities onto the engine's JSON
// input shapes, runs the pure engine, and memoizes per entity by input identity
// (immer makes an entity's reference change iff a field changed). Components read
// derived forecasts only through here — never by calling the engine in render.

import {
  runFundForecast,
  runPortfolioForecast,
  type ActualRecord,
  type FeeParams,
  type ForecastOverrides,
  type FundForecastResult,
  type FundInputJSON,
  type FxTable,
  type OverlayParams,
  type PortfolioForecastResult,
  type PortfolioInputJSON,
  type TemplateInput,
} from '@/engine'
import { useStore } from '..'
import type { StoreState } from '../storeState'
import type {
  ForecastOverride,
  Fund,
  OverlayParams as StoreOverlay,
  Portfolio,
  PulledRate,
  Template,
} from '../types'
import { quarterOfIso, quarterOrdinal } from '@/lib/quarter'

// ---- mapping: store entities → engine JSON inputs ------------------------

function toTemplateInput(t: Template): TemplateInput {
  return {
    granularity: t.granularity,
    scenarios: t.scenarioOrder.map((id) => {
      const scn = t.scenarios[id]
      return {
        id: scn.id,
        isBase: scn.isBase,
        pic: { points: scn.pic.map((p) => ({ period: p.periodIndex, value: p.value })) },
        dpi: { points: scn.dpi.map((p) => ({ period: p.periodIndex, value: p.value })) },
        tvpi: { points: scn.tvpi.map((p) => ({ period: p.periodIndex, value: p.value })) },
      }
    }),
  }
}

function toFeeParams(f: Fund): FeeParams {
  const x = f.fees
  return {
    mgmtRateIP: x.mgmtRateIp,
    mgmtRatePostIP: x.mgmtRatePostIp,
    mgmtBasisIP: x.mgmtBasisIp,
    mgmtBasisPostIP: x.mgmtBasisPostIp,
    expenseRateIP: x.expenseRateIp,
    expenseRatePostIP: x.expenseRatePostIp,
    expenseBasisIP: x.expenseBasisIp,
    expenseBasisPostIP: x.expenseBasisPostIp,
    establishmentRate: x.establishmentRate,
    carryRate: x.carryRate,
    hurdleAnnual: x.hurdleAnnual,
    catchUp: x.catchUp,
  }
}

function toOverrides(list: ForecastOverride[]): ForecastOverrides | undefined {
  if (list.length === 0) return undefined
  const out: ForecastOverrides = {}
  for (const o of list) {
    const arr = (out[o.curve] ??= [])
    arr.push({ quarter: { year: o.quarter.year, q: o.quarter.q }, value: o.value })
  }
  return out
}

function toActuals(f: Fund): ActualRecord[] | undefined {
  if (f.actuals.length === 0) return undefined
  return f.actuals.map((a) => ({
    quarter: { year: a.quarter.year, q: a.quarter.q },
    cumulativePaidIn: a.cumulativePaidIn,
    cumulativeDistributions: a.cumulativeDistributions,
    nav: a.nav,
    ...(a.recallableDistributions !== undefined
      ? { recallableBalance: a.recallableDistributions }
      : {}),
  }))
}

function toFundInput(f: Fund, t: Template): FundInputJSON {
  return {
    id: f.id,
    name: f.name,
    commitment: f.commitment,
    currency: f.currency,
    effectiveDate: f.effectiveDate,
    investmentPeriodEnd: f.fees.investmentPeriodEnd,
    standardLiquidationDate: f.standardLiquidationDate,
    ...(f.expectedLiquidationDate ? { expectedLiquidationDate: f.expectedLiquidationDate } : {}),
    template: toTemplateInput(t),
    sliders: { ...f.sliders },
    fees: toFeeParams(f),
    ...(toOverrides(f.overrides) ? { overrides: toOverrides(f.overrides) } : {}),
    ...(toActuals(f) ? { actuals: toActuals(f) } : {}),
    status: f.status,
  }
}

/** Build the engine FxTable from three layers (low → high precedence per quarter):
 *  - `rates`: the portfolio's manual flat rates (last-resort fallback).
 *  - `periodRates`: pulled rates indexed by calendar-quarter ordinal — the historical
 *    rate used for actuals quarters (latest date within a quarter wins, so an actuals
 *    quarter-end rate beats an effective-date rate in the same quarter).
 *  - `forecastRates`: the go-forward rate per pair — a user override if set, else the
 *    most recent pulled date's rate. Used for forecast quarters + the PIC denominator. */
export function buildFxTable(
  pf: Portfolio,
  pulled: Record<string, PulledRate>,
  overrides: Record<string, number>,
): FxTable {
  const rates: Record<string, number> = {}
  for (const [key, value] of Object.entries(pf.fx)) {
    const [from, to] = key.split('>')
    if (from && to) rates[`${from}->${to}`] = value
  }

  const periodRates: Record<string, Record<number, number>> = {}
  const bestPeriodDate: Record<string, Record<number, string>> = {}
  const latestByPair: Record<string, { date: string; rate: number }> = {}
  for (const r of Object.values(pulled)) {
    const pair = `${r.base}->${r.quote}`
    const ord = quarterOrdinal(quarterOfIso(r.date))
    const pdates = (bestPeriodDate[pair] ??= {})
    const prates = (periodRates[pair] ??= {})
    if (pdates[ord] === undefined || r.date > pdates[ord]) {
      pdates[ord] = r.date
      prates[ord] = r.rate
    }
    const cur = latestByPair[pair]
    if (!cur || r.date > cur.date) latestByPair[pair] = { date: r.date, rate: r.rate }
  }

  const forecastRates: Record<string, number> = {}
  for (const pair in latestByPair) forecastRates[pair] = latestByPair[pair].rate
  for (const [key, value] of Object.entries(overrides)) {
    const [from, to] = key.split('>')
    if (from && to) forecastRates[`${from}->${to}`] = value
  }

  return { rates, periodRates, forecastRates }
}

function toOverlay(o: StoreOverlay): OverlayParams {
  return {
    enabled: true,
    mgmtRateIP: o.mgmtRateIp,
    mgmtRatePostIP: o.mgmtRatePostIp,
    mgmtBasisIP: o.mgmtBasisIp,
    mgmtBasisPostIP: o.mgmtBasisPostIp,
    expenseRateIP: o.expenseRate,
    expenseRatePostIP: o.expenseRate,
    expenseBasisIP: o.expenseBasisIp,
    expenseBasisPostIP: o.expenseBasisPostIp,
    establishmentRate: o.establishmentRate,
    carryRate: o.carryRate,
    hurdleAnnual: o.hurdleAnnual,
    catchUp: o.catchUp,
    txnCostPerInvestment: o.txnCostPerInvestment,
    feeBasisFxPolicy: o.feeBasisFxPolicy,
  }
}

function disabledOverlay(): OverlayParams {
  return {
    enabled: false,
    mgmtRateIP: 0,
    mgmtRatePostIP: 0,
    mgmtBasisIP: 'commitment',
    mgmtBasisPostIP: 'commitment',
    expenseRateIP: 0,
    expenseRatePostIP: 0,
    expenseBasisIP: 'commitment',
    expenseBasisPostIP: 'commitment',
    establishmentRate: 0,
    carryRate: 0,
    hurdleAnnual: 0,
    catchUp: false,
    txnCostPerInvestment: 0,
    feeBasisFxPolicy: 'spot',
  }
}

interface FundRef {
  fund: Fund
  template: Template
  allocatedCommitment: number
}

function toPortfolioInput(
  pf: Portfolio,
  refs: FundRef[],
  pulled: Record<string, PulledRate>,
  overrides: Record<string, number>,
): PortfolioInputJSON {
  const earliestEffective =
    refs.map((r) => r.fund.effectiveDate).sort()[0] ?? pf.effectiveDate ?? '2024-01-01'
  return {
    id: pf.id,
    name: pf.name,
    currency: pf.reportingCurrency,
    size: pf.size ?? 0,
    effectiveDate: pf.effectiveDate ?? earliestEffective,
    investmentPeriodEnd: pf.investmentPeriodEndDate ?? '2029-01-01',
    funds: refs.map((r) => ({
      fund: toFundInput(r.fund, r.template),
      allocatedCommitment: r.allocatedCommitment,
    })),
    fx: buildFxTable(pf, pulled, overrides),
    overlay: pf.overlay ? toOverlay(pf.overlay) : disabledOverlay(),
    isFoF: pf.overlay != null,
  }
}

// ---- per-entity memoization (keyed by input reference identity) ----------

function depsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
}

const fundCache = new Map<string, { deps: unknown[]; result: FundForecastResult }>()
const baselineCache = new Map<string, { deps: unknown[]; result: FundForecastResult }>()
const portfolioCache = new Map<string, { deps: unknown[]; result: PortfolioForecastResult }>()

function forecastFund(f: Fund, t: Template): FundForecastResult {
  const deps = [f, t]
  const hit = fundCache.get(f.id)
  if (hit && depsEqual(hit.deps, deps)) return hit.result
  const result = runFundForecast(toFundInput(f, t))
  fundCache.set(f.id, { deps, result })
  return result
}

/** The fund's forecast with actuals stripped — the original underwriting plan
 *  (no §7 rebasing, no actuals-driven status zeroing; overrides still applied).
 *  The Performance screen diffs this against actuals to show real deviations. */
function forecastFundBaseline(f: Fund, t: Template): FundForecastResult {
  const deps = [f, t]
  const hit = baselineCache.get(f.id)
  if (hit && depsEqual(hit.deps, deps)) return hit.result
  const baseInput: FundInputJSON = { ...toFundInput(f, t) }
  delete baseInput.actuals
  const result = runFundForecast(baseInput)
  baselineCache.set(f.id, { deps, result })
  return result
}

function forecastPortfolio(
  pf: Portfolio,
  refs: FundRef[],
  pulled: Record<string, PulledRate>,
  overrides: Record<string, number>,
): PortfolioForecastResult {
  // FX depends on the global pulled rates + overrides, so they join the memo deps.
  const deps: unknown[] = [pf, pulled, overrides]
  for (const r of refs) deps.push(r.fund, r.template)
  const hit = portfolioCache.get(pf.id)
  if (hit && depsEqual(hit.deps, deps)) return hit.result
  // The engine throws on a hard failure (e.g. a missing FX rate for a fund in a
  // currency other than the portfolio's — §11). Catch it into a blocking warning
  // so a render never crashes; the screen reads `warnings` to explain the gap.
  let result: PortfolioForecastResult
  try {
    result = runPortfolioForecast(toPortfolioInput(pf, refs, pulled, overrides))
  } catch (e) {
    result = {
      portfolioId: pf.id,
      quarters: [],
      scenarios: [],
      fundResults: [],
      warnings: [
        {
          code: 'portfolio_forecast_failed',
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    }
  }
  portfolioCache.set(pf.id, { deps, result })
  return result
}

// ---- state-bound selectors (pure; reused by hooks + tests) ---------------

export function selectFundForecast(s: StoreState, fundId: string): FundForecastResult | null {
  const fund = s.funds[fundId]
  if (!fund) return null
  const template = s.templates[fund.templateId]
  if (!template) return null
  return forecastFund(fund, template)
}

/** The baseline plan (forecast with actuals stripped) — see forecastFundBaseline. */
export function selectFundBaselineForecast(
  s: StoreState,
  fundId: string,
): FundForecastResult | null {
  const fund = s.funds[fundId]
  if (!fund) return null
  const template = s.templates[fund.templateId]
  if (!template) return null
  return forecastFundBaseline(fund, template)
}

export function selectPortfolioForecast(
  s: StoreState,
  portfolioId: string,
): PortfolioForecastResult | null {
  const pf = s.portfolios[portfolioId]
  if (!pf) return null
  const refs: FundRef[] = []
  for (const [fundId, alloc] of Object.entries(pf.allocations)) {
    const fund = s.funds[fundId]
    if (!fund) continue
    const template = s.templates[fund.templateId]
    if (!template) continue
    refs.push({ fund, template, allocatedCommitment: alloc.allocatedCommitment })
  }
  return forecastPortfolio(pf, refs, s.fxRates, s.forecastRates)
}

// ---- React hooks ---------------------------------------------------------

/** Memoized fund forecast — stable reference while inputs are unchanged. */
export function useFundForecast(fundId: string): FundForecastResult | null {
  return useStore((s) => selectFundForecast(s, fundId))
}

/** Memoized baseline plan (forecast with actuals stripped). */
export function useFundBaselineForecast(fundId: string): FundForecastResult | null {
  return useStore((s) => selectFundBaselineForecast(s, fundId))
}

/** Memoized portfolio forecast (with optional LP overlay). */
export function usePortfolioForecast(portfolioId: string): PortfolioForecastResult | null {
  return useStore((s) => selectPortfolioForecast(s, portfolioId))
}
