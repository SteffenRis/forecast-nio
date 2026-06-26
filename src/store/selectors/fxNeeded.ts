// Derives exactly which exchange rates the system needs — the scope rule for the
// frankfurter pull. Pure: components feed it `funds` + `portfolios` (so React can
// memo on those references) and it returns the grouped requests to fetch.
//
// Scope rule: for each portfolio P (reporting currency R) and each allocated fund F
// (currency C) where C ≠ R, we need C→R at every relevant date — F's effectiveDate,
// P's effectiveDate, and each quarter-end present in F's actuals. Nothing else.

import type { Fund, Portfolio } from '../types'
import type { StoreState } from '../storeState'
import { quarterEndIso } from '@/lib/quarter'
import type { FxRequest } from '@/lib/fx/frankfurter'

/** Build the de-duplicated, grouped set of frankfurter requests (one per date+base). */
export function deriveNeededFxRequests(
  funds: Record<string, Fund>,
  portfolios: Record<string, Portfolio>,
): FxRequest[] {
  // `${date}|${base}` → quote symbols needed for that call.
  const groups = new Map<string, { base: string; date: string; quotes: Set<string> }>()
  const add = (base: string, quote: string, date: string) => {
    if (base === quote) return
    const key = `${date}|${base}`
    let g = groups.get(key)
    if (!g) {
      g = { base, date, quotes: new Set() }
      groups.set(key, g)
    }
    g.quotes.add(quote)
  }

  for (const pf of Object.values(portfolios)) {
    const reporting = pf.reportingCurrency
    for (const fundId of Object.keys(pf.allocations)) {
      const fund = funds[fundId]
      if (!fund || fund.currency === reporting) continue

      const dates = new Set<string>()
      if (fund.effectiveDate) dates.add(fund.effectiveDate)
      if (pf.effectiveDate) dates.add(pf.effectiveDate)
      for (const a of fund.actuals) dates.add(quarterEndIso(a.quarter))

      for (const date of dates) add(fund.currency, reporting, date)
    }
  }

  return [...groups.values()]
    .map((g) => ({ base: g.base, date: g.date, quotes: [...g.quotes].sort() }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.base.localeCompare(b.base))
}

/** Store-bound wrapper (mirrors the forecast selectors' shape). */
export function selectNeededFxRequests(s: StoreState): FxRequest[] {
  return deriveNeededFxRequests(s.funds, s.portfolios)
}

export interface FxNeededSummary {
  /** Distinct 'BASE→QUOTE' pairs in the system. */
  pairs: string[]
  /** Distinct relevant dates. */
  dates: string[]
  /** Total (pair, date) combinations — the number of rate cells we will pull. */
  count: number
}

/** Headline counts + lists for the "will pull" preview. */
export function summarizeNeededFx(requests: FxRequest[]): FxNeededSummary {
  const pairs = new Set<string>()
  const dates = new Set<string>()
  let count = 0
  for (const r of requests) {
    dates.add(r.date)
    for (const q of r.quotes) {
      pairs.add(`${r.base}→${q}`)
      count++
    }
  }
  return {
    pairs: [...pairs].sort(),
    dates: [...dates].sort(),
    count,
  }
}
