// Pure fee/carry roll-up for the Fund "Fees" overview tab. Takes the engine's
// per-quarter fund rows + the fund's actuals and folds them into annual fee lines,
// lifetime totals (split realized-to-date vs projected), and a few headline ratios.
// No engine/React/store-runtime imports — only types + the quarter helper — so it
// stays trivially unit-testable, mirroring lib/comparison.ts and lib/metrics.ts.

import type { CalendarQuarterRef } from '@/store/types'
import { quarterOrdinal } from './quarter'

/** Minimal per-quarter fee row — structurally satisfied by the engine's
 *  FundQuarterRowJSON (whose `quarter.q` is the wider `number`). All four fee
 *  figures are PER-QUARTER amounts (not cumulative). */
export interface FeeRow {
  quarter: { year: number; q: number }
  mgmtFee: number
  expenses: number
  establishment: number
  carry: number
}

/** A year's position relative to the fund's last reported actual:
 *  - actual: every quarter realized, - forecast: every quarter projected,
 *  - in-progress: the year straddling the actual→forecast boundary. */
export type FeePhase = 'actual' | 'forecast' | 'in-progress'

/** One quarter inside a year — the drill-down detail behind each annual line. A
 *  single quarter is fully realized or fully projected (never in-progress). */
export interface FeeQuarterRow {
  quarter: CalendarQuarterRef
  mgmtFee: number
  expenses: number
  establishment: number
  carry: number
  /** mgmtFee + expenses + establishment + carry. */
  total: number
  phase: 'actual' | 'forecast'
}

export interface FeeYearRow {
  year: number
  mgmtFee: number
  expenses: number
  establishment: number
  carry: number
  /** mgmtFee + expenses + establishment + carry. */
  total: number
  phase: FeePhase
  /** The quarters that roll up into this year, oldest → newest. */
  quarters: FeeQuarterRow[]
}

/** A lifetime figure split into the realized (actual) and projected (forecast)
 *  portions. lifetime = toDate + projected. */
export interface FeeSplit {
  lifetime: number
  toDate: number
  projected: number
}

export interface FeeTotals {
  mgmtFee: FeeSplit
  expenses: FeeSplit
  establishment: FeeSplit
  carry: FeeSplit
  /** mgmt + expenses + establishment — the LP's ongoing fund costs (excludes carry). */
  fundCosts: FeeSplit
  /** fundCosts + carry — total economic cost to the LP. */
  totalToLp: FeeSplit
}

export interface FeeOverview {
  years: FeeYearRow[]
  totals: FeeTotals
  /** fundCosts.lifetime / commitment (fraction). null when commitment is 0. */
  feeLoadPct: number | null
  /** True when any quarter carries a positive carry figure. */
  carryActive: boolean
  /** Quarter carry first turns on (the durable hurdle-clear), or null when none. */
  carryStart: CalendarQuarterRef | null
}

const blankSplit = (): FeeSplit => ({ lifetime: 0, toDate: 0, projected: 0 })

const blankTotals = (): FeeTotals => ({
  mgmtFee: blankSplit(),
  expenses: blankSplit(),
  establishment: blankSplit(),
  carry: blankSplit(),
  fundCosts: blankSplit(),
  totalToLp: blankSplit(),
})

/** Accumulate an amount into a split, attributing it to to-date or projected. */
function add(s: FeeSplit, amount: number, actual: boolean): void {
  s.lifetime += amount
  if (actual) s.toDate += amount
  else s.projected += amount
}

/**
 * Roll the engine's per-quarter fee rows up into annual lines + lifetime totals.
 *
 * Actual vs forecast mirrors the engine's own lastActualIndex boundary
 * (fund.ts): a quarter is realized when its ordinal is ≤ the latest actual's.
 * With no actuals the whole life is the underwriting plan (everything forecast).
 */
export function buildFeeOverview(input: {
  commitment: number
  rows: FeeRow[]
  actuals: { quarter: CalendarQuarterRef }[]
}): FeeOverview {
  const { commitment, rows, actuals } = input

  // -Infinity when there are no actuals → every period reads as forecast.
  const lastActualOrd = actuals.length
    ? Math.max(...actuals.map((a) => quarterOrdinal(a.quarter)))
    : -Infinity

  // The engine emits rows oldest→newest; sort defensively so the carry-start
  // detection and year ordering don't depend on input order.
  const sorted = [...rows].sort(
    (a, b) => quarterOrdinal(a.quarter as CalendarQuarterRef) - quarterOrdinal(b.quarter as CalendarQuarterRef),
  )

  const totals = blankTotals()
  interface YearAcc {
    year: number
    mgmtFee: number
    expenses: number
    establishment: number
    carry: number
    total: number
    quarters: FeeQuarterRow[]
    hasActual: boolean
    hasForecast: boolean
  }
  const yearMap = new Map<number, YearAcc>()

  let carryActive = false
  let carryStart: CalendarQuarterRef | null = null

  for (const r of sorted) {
    const actual = quarterOrdinal(r.quarter as CalendarQuarterRef) <= lastActualOrd
    const fundCost = r.mgmtFee + r.expenses + r.establishment
    const rowTotal = fundCost + r.carry

    let entry = yearMap.get(r.quarter.year)
    if (!entry) {
      entry = {
        year: r.quarter.year,
        mgmtFee: 0,
        expenses: 0,
        establishment: 0,
        carry: 0,
        total: 0,
        quarters: [],
        hasActual: false,
        hasForecast: false,
      }
      yearMap.set(r.quarter.year, entry)
    }
    entry.mgmtFee += r.mgmtFee
    entry.expenses += r.expenses
    entry.establishment += r.establishment
    entry.carry += r.carry
    entry.total += rowTotal
    entry.quarters.push({
      quarter: { year: r.quarter.year, q: r.quarter.q as 1 | 2 | 3 | 4 },
      mgmtFee: r.mgmtFee,
      expenses: r.expenses,
      establishment: r.establishment,
      carry: r.carry,
      total: rowTotal,
      phase: actual ? 'actual' : 'forecast',
    })
    if (actual) entry.hasActual = true
    else entry.hasForecast = true

    add(totals.mgmtFee, r.mgmtFee, actual)
    add(totals.expenses, r.expenses, actual)
    add(totals.establishment, r.establishment, actual)
    add(totals.carry, r.carry, actual)
    add(totals.fundCosts, fundCost, actual)
    add(totals.totalToLp, rowTotal, actual)

    if (r.carry > 0) {
      carryActive = true
      if (!carryStart) carryStart = { year: r.quarter.year, q: r.quarter.q as 1 | 2 | 3 | 4 }
    }
  }

  const years: FeeYearRow[] = [...yearMap.values()]
    .sort((a, b) => a.year - b.year)
    .map((e) => ({
      year: e.year,
      mgmtFee: e.mgmtFee,
      expenses: e.expenses,
      establishment: e.establishment,
      carry: e.carry,
      total: e.total,
      quarters: [...e.quarters].sort((a, b) => a.quarter.q - b.quarter.q),
      phase: e.hasActual && e.hasForecast ? 'in-progress' : e.hasActual ? 'actual' : 'forecast',
    }))

  const feeLoadPct = commitment > 0 ? totals.fundCosts.lifetime / commitment : null

  return { years, totals, feeLoadPct, carryActive, carryStart }
}
