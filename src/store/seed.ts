import { newId } from '@/lib/id'
import { DEFAULT_FEES, DEFAULT_SLIDERS } from './slices/fundsSlice'
import type { Fund, Portfolio, Scenario, Template } from './types'

/**
 * The CALCULATIONS.md §16 reference example (Acme VII / Nordic FoF), as store
 * entities. Serves three jobs: demo data, the version-reset default, and the
 * fixture that proves "the rule holds" (seed inputs → engine-derived forecast).
 */
export interface SeedData {
  templates: Record<string, Template>
  templateOrder: string[]
  funds: Record<string, Fund>
  fundOrder: string[]
  portfolios: Record<string, Portfolio>
  portfolioOrder: string[]
}

const pts = (...values: number[]) => values.map((value, i) => ({ periodIndex: i + 1, value }))
const scale = (points: { periodIndex: number; value: number }[], factor: number) =>
  points.map((p) => ({ periodIndex: p.periodIndex, value: Math.round(p.value * factor * 1e4) / 1e4 }))

export function buildSeed(): SeedData {
  // ---- Template: annual 10y curves. Base = the exact §16 reference curves; the
  //      three non-base cases are seeded from base via the dpiVsBase generator. ----
  const base: Scenario = {
    id: newId('scn'),
    name: 'Base',
    isBase: true,
    dpiVsBase: 1.0,
    pic: pts(0.2, 0.5, 0.75, 0.95, 1.0), // flat at 1.00 after year 5
    dpi: pts(0, 0, 0.05, 0.2, 0.45, 0.85, 1.3, 1.75, 2.05, 2.2),
    tvpi: pts(0.9, 1.05, 1.3, 1.6, 1.9, 2.1, 2.2, 2.25, 2.22, 2.2),
  }
  const mkCase = (name: string, factor: number): Scenario => ({
    id: newId('scn'),
    name,
    isBase: false,
    dpiVsBase: factor,
    pic: base.pic.map((p) => ({ ...p })),
    dpi: scale(base.dpi, factor),
    tvpi: scale(base.tvpi, factor),
  })
  const lowLow = mkCase('Low-low', 0.6)
  const low = mkCase('Low', 0.8)
  const high = mkCase('High', 1.2)
  const template: Template = {
    id: newId('tpl'),
    name: 'Generic PE — 10y',
    description: 'Reference 10-year buyout curve set (CALCULATIONS.md §16).',
    assetClass: 'large_cap_buyout',
    fundLifeYears: 10,
    granularity: 'annual',
    scenarios: {
      [lowLow.id]: lowLow,
      [low.id]: low,
      [base.id]: base,
      [high.id]: high,
    },
    scenarioOrder: [lowLow.id, low.id, base.id, high.id],
    baseScenarioId: base.id,
  }

  // ---- Fund: Acme VII (§16) ----
  const fund: Fund = {
    id: newId('fund'),
    name: 'Acme VII',
    templateId: template.id,
    commitment: 30_000_000,
    currency: 'EUR',
    effectiveDate: '2024-02-15',
    standardLiquidationDate: '2034-02-15',
    status: 'ACTIVE',
    sliders: { ...DEFAULT_SLIDERS },
    fees: {
      ...DEFAULT_FEES,
      mgmtRateIp: 0.02,
      mgmtRatePostIp: 0.015,
      expenseRateIp: 0.0025,
      expenseRatePostIp: 0.0025,
      establishmentRate: 0.005,
      investmentPeriodEnd: '2029-02-15',
      carryRate: 0.2,
      hurdleAnnual: 0.08,
      catchUp: true,
    },
    overrides: [],
    actuals: [],
  }

  // ---- Portfolio: Nordic FoF (§16) — USD, 1/3 allocation, overlay disabled ----
  const portfolio: Portfolio = {
    id: newId('pf'),
    name: 'Nordic FoF',
    reportingCurrency: 'USD',
    allocations: { [fund.id]: { allocatedCommitment: 10_000_000 } },
    fx: { 'EUR>USD': 1.08 },
    overlay: null,
  }

  return {
    templates: { [template.id]: template },
    templateOrder: [template.id],
    funds: { [fund.id]: fund },
    fundOrder: [fund.id],
    portfolios: { [portfolio.id]: portfolio },
    portfolioOrder: [portfolio.id],
  }
}
