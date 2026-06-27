// Pure set-vs-updated reshaping for the Performance screen's comparison tab. Both
// sides are dense forecast row-sets (engine output): the frozen "set forecast" and
// the live "updated forecast with actuals". We prefix-sum each into cumulative
// per-quarter amounts and diff them (drift = Updated − Set). No engine/React/store
// imports — only comparison helpers + types — so it stays trivially unit-testable.

import type { CalendarQuarterRef } from '@/store/types'
import {
  cumulativeForecastByOrdinal,
  quarterDeviation,
  type ForecastRow,
  type QuarterAmounts,
  type QuarterDeviation,
} from './comparison'

export interface SetVsUpdatedRow {
  quarter: CalendarQuarterRef
  /** The frozen "set forecast" side, or null outside its horizon. */
  set: QuarterAmounts | null
  /** The live "updated forecast with actuals" side, or null outside its horizon. */
  updated: QuarterAmounts | null
}

/** Build one row per quarter over the union of the set ∪ updated horizons. Both row
 *  sets share the fund's effective-date anchor, so their quarters align. */
export function buildSetVsUpdatedComparison(input: {
  commitment: number
  effectiveDate: string
  setRows: ForecastRow[]
  updatedRows: ForecastRow[]
}): SetVsUpdatedRow[] {
  const { commitment, effectiveDate, setRows, updatedRows } = input
  const setSide = cumulativeForecastByOrdinal({ commitment, effectiveDate, rows: setRows })
  const updatedSide = cumulativeForecastByOrdinal({ commitment, effectiveDate, rows: updatedRows })

  const quarterByOrd = new Map<number, CalendarQuarterRef>([
    ...setSide.quarterByOrd,
    ...updatedSide.quarterByOrd,
  ])
  const ords = [...new Set([...setSide.byOrd.keys(), ...updatedSide.byOrd.keys()])].sort(
    (a, b) => a - b,
  )
  return ords.map((ord) => ({
    quarter: quarterByOrd.get(ord)!,
    set: setSide.byOrd.get(ord) ?? null,
    updated: updatedSide.byOrd.get(ord) ?? null,
  }))
}

/** Drift = Updated − Set (reuses the plan-vs-actual deviation: actual←updated,
 *  forecast←set), so positive = above the forecast we started with. */
export function quarterDrift(r: SetVsUpdatedRow): QuarterDeviation {
  return quarterDeviation(r.updated, r.set)
}
