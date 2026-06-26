// frankfurter.dev integration — the ONE place in the app that touches the network.
// Per ARCHITECTURE.md this is the single, explicit carve-out to the "no fetch, ever"
// rule: it is invoked only from a user click (never in render / useEffect / on load),
// and its result is written to the store as a raw input (a PulledRate). The pure
// helpers (buildUrl / parseFrankfurterResponse) are unit-tested; fetchRates is the
// only impure surface.

import type { IsoDate, PulledRate } from '@/store/types'

const API_BASE = 'https://api.frankfurter.dev/v1'

/** A grouped request: every quote symbol for one base on one date is one HTTP call. */
export interface FxRequest {
  base: string
  date: IsoDate
  quotes: string[]
}

/** The frankfurter response shape (the fields we read). */
interface FrankfurterResponse {
  amount: number
  base: string
  /** The date the rate is actually for — may be earlier than requested (weekends). */
  date: string
  rates: Record<string, number>
}

/** `https://api.frankfurter.dev/v1/2024-03-31?base=EUR&symbols=USD,GBP` (pure). */
export function buildUrl(req: FxRequest): string {
  const params = new URLSearchParams({ base: req.base, symbols: req.quotes.join(',') })
  return `${API_BASE}/${req.date}?${params.toString()}`
}

/** Flatten one frankfurter response into PulledRate rows (pure). */
export function parseFrankfurterResponse(
  json: FrankfurterResponse,
  requestedDate: IsoDate,
  fetchedAt: string,
): PulledRate[] {
  return Object.entries(json.rates ?? {}).map(([quote, rate]) => ({
    base: json.base,
    quote,
    date: requestedDate,
    ecbDate: json.date,
    rate,
    fetchedAt,
  }))
}

export interface FetchRatesResult {
  rates: PulledRate[]
  errors: string[]
}

/** Pull every request in parallel. One request failing (e.g. an unsupported currency
 *  → 404) never sinks the batch — its message is collected into `errors` instead. */
export async function fetchRates(requests: FxRequest[]): Promise<FetchRatesResult> {
  const fetchedAt = new Date().toISOString()
  const settled = await Promise.allSettled(
    requests.map(async (req) => {
      const res = await fetch(buildUrl(req))
      if (!res.ok) {
        throw new Error(`${req.base}→${req.quotes.join(',')} @ ${req.date}: HTTP ${res.status}`)
      }
      const json = (await res.json()) as FrankfurterResponse
      return parseFrankfurterResponse(json, req.date, fetchedAt)
    }),
  )

  const rates: PulledRate[] = []
  const errors: string[] = []
  for (const r of settled) {
    if (r.status === 'fulfilled') rates.push(...r.value)
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
  }
  return { rates, errors }
}
