import type { SliceCreator } from '../storeState'
import type { PulledRate } from '../types'

export interface FxRatesSlice {
  /** Pulled frankfurter rates, keyed `${base}>${quote}@${date}` (see pulledRateKey).
   *  Raw reference inputs — never derived. The `>` separator mirrors Portfolio.fx. */
  fxRates: Record<string, PulledRate>
  /** User forecast-rate overrides, keyed `${base}>${quote}` → rate. Applied to forecast
   *  quarters in §11 portfolio aggregation; when unset the most recent pulled date's rate
   *  is used as the default. Global per pair (set on the Exchange Rates tab). */
  forecastRates: Record<string, number>
  /** Merge pulled rates in, overwriting any existing row for the same pair+date. */
  setPulledRates: (rates: PulledRate[]) => void
  clearPulledRates: () => void
  /** Set (or clear, when rate is null) the forecast override for a pair. */
  setForecastRate: (base: string, quote: string, rate: number | null) => void
}

/** Stable key for one pulled rate (base→quote as of a date). */
export function pulledRateKey(base: string, quote: string, date: string): string {
  return `${base}>${quote}@${date}`
}

export const createFxRatesSlice: SliceCreator<FxRatesSlice> = (set) => ({
  fxRates: {},
  forecastRates: {},

  setPulledRates: (rates) =>
    set((s) => {
      for (const r of rates) {
        s.fxRates[pulledRateKey(r.base, r.quote, r.date)] = r
      }
    }),

  clearPulledRates: () =>
    set((s) => {
      s.fxRates = {}
    }),

  setForecastRate: (base, quote, rate) =>
    set((s) => {
      const key = `${base}>${quote}`
      if (rate == null || !Number.isFinite(rate)) delete s.forecastRates[key]
      else s.forecastRates[key] = rate
    }),
})
