// Portfolio-side helpers that stay independent of the store/engine runtime (only
// primitives in/out), so they're trivially unit-testable and reusable across the
// editor and the roll-up.

import type { PulledRate } from '@/store/types'
import { quarterOfIso, quarterOrdinal } from './quarter'

/** Resolve an FX rate from a portfolio's flat 'FROM>TO' table, mirroring the engine's
 *  §11 auto-inversion: same currency → 1, direct rate, else inverse, else null (no
 *  path — the fund can't be aggregated until a rate exists). */
export function portfolioFxRate(
  fx: Record<string, number>,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1
  const direct = fx[`${from}>${to}`]
  if (direct !== undefined) return direct
  const inverse = fx[`${to}>${from}`]
  if (inverse !== undefined && inverse !== 0) return 1 / inverse
  return null
}

/** Time-varying FX for the portfolio roll-up — the UI-side mirror of the engine's
 *  §11 per-quarter resolver. Actuals quarters (ordinal ≤ lastActualOrd) convert at
 *  their own pulled rate (carrying the nearest earlier rate forward across gaps);
 *  forecast quarters convert at `forecastRate` (a user override, else the most recent
 *  pulled date's rate, else the manual flat rate). `forecastRate` is null only when no
 *  rate is resolvable at all — the signal to exclude the fund from the roll-up. */
export interface PortfolioRateResolver {
  rateForOrd: (ord: number, lastActualOrd: number) => number | null
  forecastRate: number | null
}

export function buildPortfolioRateResolver(args: {
  from: string
  to: string
  /** The portfolio's manual flat 'FROM>TO' rates (fallback). */
  flat: Record<string, number>
  /** Global pulled rates, keyed `${base}>${quote}@${date}`. */
  pulled: Record<string, PulledRate>
  /** Forecast overrides, keyed `${base}>${quote}`. */
  overrides: Record<string, number>
}): PortfolioRateResolver {
  const { from, to, flat, pulled, overrides } = args
  if (from === to) return { rateForOrd: () => 1, forecastRate: 1 }

  // Historical rates for this pair, indexed by quarter ordinal (latest date wins).
  const period = new Map<number, { date: string; rate: number }>()
  let latest: { date: string; rate: number } | null = null
  for (const r of Object.values(pulled)) {
    if (r.base !== from || r.quote !== to) continue
    const ord = quarterOrdinal(quarterOfIso(r.date))
    const cur = period.get(ord)
    if (!cur || r.date > cur.date) period.set(ord, { date: r.date, rate: r.rate })
    if (!latest || r.date > latest.date) latest = { date: r.date, rate: r.rate }
  }

  const flatRate = portfolioFxRate(flat, from, to)
  const forecastRate = overrides[`${from}>${to}`] ?? latest?.rate ?? flatRate

  const rateForOrd = (ord: number, lastActualOrd: number): number | null => {
    if (ord <= lastActualOrd && period.size > 0) {
      const exact = period.get(ord)
      if (exact) return exact.rate
      let bestOrd = -Infinity
      let bestRate: number | undefined
      for (const [ko, v] of period) {
        if (ko <= ord && ko > bestOrd) {
          bestOrd = ko
          bestRate = v.rate
        }
      }
      if (bestRate !== undefined) return bestRate
    }
    return forecastRate
  }

  return { rateForOrd, forecastRate }
}
