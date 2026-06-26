// Pure plan-vs-actual reshaping for the Performance screen. Takes the baseline
// forecast rows (engine output) + the fund's actuals and produces one comparison
// entry per calendar quarter. No engine/React/store-runtime imports — only types
// and the metrics/quarter helpers — so it stays trivially unit-testable.

import type { CalendarQuarterRef } from '@/store/types'
import { fundMultiples, type FundMultiples } from './metrics'
import { quarterFromOrdinal, quarterOfIso, quarterOrdinal } from './quarter'

/** Minimal forecast-row shape — structurally satisfied by the engine's
 *  FundQuarterRowJSON (whose `quarter.q` is the wider `number`). NOTE: `pNet`/`dNet`
 *  are PER-QUARTER flows (not cumulative); `nav` is the cumulative stock. We
 *  prefix-sum the flows to cumulative here. */
export interface ForecastRow {
  quarter: { year: number; q: number }
  pNet: number
  dNet: number
  nav: number
}

/** Minimal actuals shape — structurally satisfied by the store's ActualsRecord.
 *  Contributed/Distributed are already cumulative-to-date. */
export interface ActualRow {
  quarter: CalendarQuarterRef
  cumulativePaidIn: number
  cumulativeDistributions: number
  nav: number
  recallableDistributions?: number
}

/** One side (actual or plan) of a quarter: cumulative amounts + PE multiples.
 *  `recallable` is null when not modeled — the plan never forecasts recallables. */
export interface QuarterAmounts {
  contributed: number
  distributed: number
  recallable: number | null
  nav: number
  multiples: FundMultiples
}

export interface QuarterComparison {
  quarter: CalendarQuarterRef
  actual: QuarterAmounts | null
  forecast: QuarterAmounts | null
}

/** Build one comparison entry per quarter over the union of forecast ∪ actual
 *  quarters, oldest → newest. The plan's cumulative Contributed/Distributed are
 *  reconstructed as a running prefix-sum of the periodic forecast flows. */
export function buildFundComparison(input: {
  commitment: number
  /** ISO 'YYYY-MM-DD'. The plan is re-anchored so its first row lands on this
   *  quarter, matching where actuals are entered (the engine dates the forecast's
   *  first row one block-end quarter later). */
  effectiveDate: string
  actuals: ActualRow[]
  forecastRows: ForecastRow[]
}): QuarterComparison[] {
  const { commitment, effectiveDate, actuals, forecastRows } = input

  // Plan side: prefix-sum periodic paid-in / distributions into cumulative stocks.
  // Re-anchor each forecast row to the fund's effective-date quarter by index, so
  // the plan curve starts where the actuals do (forecast row i → effective-date
  // quarter + i). The engine emits a dense, gap-free quarterly curve, so this is a
  // uniform shift that keeps quarters consecutive.
  const baseOrd = quarterOrdinal(quarterOfIso(effectiveDate))
  const forecastByOrd = new Map<number, QuarterAmounts>()
  const quarterByOrd = new Map<number, CalendarQuarterRef>()
  let cumP = 0
  let cumD = 0
  const orderedRows = forecastRows
    .map((r) => ({
      srcOrd: quarterOrdinal({ year: r.quarter.year, q: r.quarter.q as 1 | 2 | 3 | 4 }),
      pNet: r.pNet,
      dNet: r.dNet,
      nav: r.nav,
    }))
    .sort((a, b) => a.srcOrd - b.srcOrd)
  orderedRows.forEach((row, i) => {
    cumP += row.pNet
    cumD += row.dNet
    const ord = baseOrd + i
    quarterByOrd.set(ord, quarterFromOrdinal(ord))
    forecastByOrd.set(ord, {
      contributed: cumP,
      distributed: cumD,
      recallable: null,
      nav: row.nav,
      multiples: fundMultiples({ commitment, paidIn: cumP, distributed: cumD, nav: row.nav }),
    })
  })

  // Actual side: amounts are already cumulative-to-date.
  const actualByOrd = new Map<number, QuarterAmounts>()
  for (const a of actuals) {
    const ord = quarterOrdinal(a.quarter)
    quarterByOrd.set(ord, a.quarter)
    actualByOrd.set(ord, {
      contributed: a.cumulativePaidIn,
      distributed: a.cumulativeDistributions,
      recallable: a.recallableDistributions ?? null,
      nav: a.nav,
      multiples: fundMultiples({
        commitment,
        paidIn: a.cumulativePaidIn,
        distributed: a.cumulativeDistributions,
        nav: a.nav,
      }),
    })
  }

  const ords = [...new Set([...forecastByOrd.keys(), ...actualByOrd.keys()])].sort((a, b) => a - b)
  return ords.map((ord) => ({
    quarter: quarterByOrd.get(ord)!,
    actual: actualByOrd.get(ord) ?? null,
    forecast: forecastByOrd.get(ord) ?? null,
  }))
}

/** One underlying fund's contribution to a portfolio roll-up: its own
 *  plan-vs-actual comparison (in the fund's currency, at full fund scale) and the
 *  factor that scales it to this portfolio's share + reporting currency
 *  (= allocatedCommitment / fund.commitment × FX). */
export interface PortfolioFundComparison {
  comparison: QuarterComparison[]
  factor: number
}

type CumulativeSide = {
  contributed: number
  distributed: number
  nav: number
  recallable: number | null
}

const scaleSide = (a: QuarterAmounts, factor: number): CumulativeSide => ({
  contributed: a.contributed * factor,
  distributed: a.distributed * factor,
  nav: a.nav * factor,
  recallable: a.recallable === null ? null : a.recallable * factor,
})

/** The latest cumulative side at or before `ord` (carry-forward). Cumulative series
 *  sampled at different quarters per fund must be carried forward to aggregate: a
 *  fund's value at quarter Q is its most recent reading ≤ Q. `series` is ord-sorted. */
function carryForward(series: { ord: number; side: CumulativeSide }[], ord: number): CumulativeSide | null {
  let res: CumulativeSide | null = null
  for (const e of series) {
    if (e.ord <= ord) res = e.side
    else break
  }
  return res
}

/** Aggregate underlying funds' plan-vs-actual comparisons into the portfolio's, on
 *  the union calendar grid. Each fund's cumulative amounts are scaled by its factor
 *  and summed with carry-forward (so funds reporting on different quarters still add
 *  up correctly); portfolio multiples are recomputed from the aggregated cumulatives
 *  against `totalCommitment` (the included funds' allocated commitment, reporting ccy). */
export function buildPortfolioComparison(input: {
  totalCommitment: number
  funds: PortfolioFundComparison[]
}): QuarterComparison[] {
  const { totalCommitment, funds } = input

  const quarterByOrd = new Map<number, CalendarQuarterRef>()
  const planSeries: { ord: number; side: CumulativeSide }[][] = []
  const actualSeries: { ord: number; side: CumulativeSide }[][] = []

  // The actuals horizon ends at the latest quarter ANY fund has reported. Within it,
  // funds reporting on earlier quarters are carried forward; beyond it there's no
  // actual data, so the roll-up shows plan only (never an actual extrapolated past
  // the last real reading).
  let maxActualOrd = -Infinity

  for (const f of funds) {
    const plan: { ord: number; side: CumulativeSide }[] = []
    const actual: { ord: number; side: CumulativeSide }[] = []
    for (const c of f.comparison) {
      const ord = quarterOrdinal(c.quarter)
      quarterByOrd.set(ord, c.quarter)
      if (c.forecast) plan.push({ ord, side: scaleSide(c.forecast, f.factor) })
      if (c.actual) {
        actual.push({ ord, side: scaleSide(c.actual, f.factor) })
        if (ord > maxActualOrd) maxActualOrd = ord
      }
    }
    plan.sort((a, b) => a.ord - b.ord)
    actual.sort((a, b) => a.ord - b.ord)
    planSeries.push(plan)
    actualSeries.push(actual)
  }

  const toAmounts = (s: CumulativeSide): QuarterAmounts => ({
    contributed: s.contributed,
    distributed: s.distributed,
    recallable: s.recallable,
    nav: s.nav,
    multiples: fundMultiples({
      commitment: totalCommitment,
      paidIn: s.contributed,
      distributed: s.distributed,
      nav: s.nav,
    }),
  })

  const ords = [...quarterByOrd.keys()].sort((a, b) => a - b)
  return ords.map((ord) => {
    let planHas = false
    const plan: CumulativeSide = { contributed: 0, distributed: 0, nav: 0, recallable: null }
    for (const s of planSeries) {
      const v = carryForward(s, ord)
      if (v) {
        planHas = true
        plan.contributed += v.contributed
        plan.distributed += v.distributed
        plan.nav += v.nav
      }
    }

    let actualHas = false
    const actual: CumulativeSide = { contributed: 0, distributed: 0, nav: 0, recallable: null }
    if (ord <= maxActualOrd) {
      for (const s of actualSeries) {
        const v = carryForward(s, ord)
        if (v) {
          actualHas = true
          actual.contributed += v.contributed
          actual.distributed += v.distributed
          actual.nav += v.nav
          if (v.recallable !== null) actual.recallable = (actual.recallable ?? 0) + v.recallable
        }
      }
    }

    return {
      quarter: quarterByOrd.get(ord)!,
      actual: actualHas ? toAmounts(actual) : null,
      forecast: planHas ? toAmounts(plan) : null,
    }
  })
}

/** Per-field Actual − Forecast. `recallable` is always null (never on the plan);
 *  a multiple delta is null when either side is null (n.a.). */
export interface QuarterDeviation {
  contributed: number | null
  distributed: number | null
  recallable: null
  nav: number | null
  pic: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
}

export function quarterDeviation(
  actual: QuarterAmounts | null,
  forecast: QuarterAmounts | null,
): QuarterDeviation {
  const diff = (a: number | null | undefined, b: number | null | undefined): number | null =>
    a == null || b == null ? null : a - b
  return {
    contributed: actual && forecast ? actual.contributed - forecast.contributed : null,
    distributed: actual && forecast ? actual.distributed - forecast.distributed : null,
    recallable: null,
    nav: actual && forecast ? actual.nav - forecast.nav : null,
    pic: diff(actual?.multiples.pic, forecast?.multiples.pic),
    dpi: diff(actual?.multiples.dpi, forecast?.multiples.dpi),
    rvpi: diff(actual?.multiples.rvpi, forecast?.multiples.rvpi),
    tvpi: diff(actual?.multiples.tvpi, forecast?.multiples.tvpi),
  }
}
