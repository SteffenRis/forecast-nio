import type { SliceCreator } from '../storeState'
import type { PulledRate } from '../types'

export interface FxRatesSlice {
  /** Pulled frankfurter rates, keyed `${base}>${quote}@${date}` (see pulledRateKey).
   *  Raw reference inputs — never derived. View-only today; the `>` separator mirrors
   *  Portfolio.fx so a future "apply to portfolio" step is a direct lookup. */
  fxRates: Record<string, PulledRate>
  /** Merge pulled rates in, overwriting any existing row for the same pair+date. */
  setPulledRates: (rates: PulledRate[]) => void
  clearPulledRates: () => void
}

/** Stable key for one pulled rate (base→quote as of a date). */
export function pulledRateKey(base: string, quote: string, date: string): string {
  return `${base}>${quote}@${date}`
}

export const createFxRatesSlice: SliceCreator<FxRatesSlice> = (set) => ({
  fxRates: {},

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
})
