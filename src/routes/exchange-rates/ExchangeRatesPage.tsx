import { useMemo, useState } from 'react'
import { ArrowRightLeft, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { NumberInput } from '@/components/common/NumberInput'
import { deriveNeededFxRequests, summarizeNeededFx } from '@/store/selectors/fxNeeded'
import { pulledRateKey } from '@/store/slices/fxRatesSlice'
import { fetchRates } from '@/lib/fx/frankfurter'
import type { PulledRate } from '@/store/types'

const primaryBtn =
  'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40'
const secondaryBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50 disabled:opacity-40'
const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const chip =
  'rounded-md border border-border-default bg-slate-50 px-2 py-0.5 text-[12px] font-medium tabular-nums text-body'

const fmtRate = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
const fmtFetched = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function ExchangeRatesPage() {
  const funds = useStore((s) => s.funds)
  const portfolios = useStore((s) => s.portfolios)
  const fxRates = useStore((s) => s.fxRates)
  const forecastRates = useStore((s) => s.forecastRates)
  const setPulledRates = useStore((s) => s.setPulledRates)
  const clearPulledRates = useStore((s) => s.clearPulledRates)
  const setForecastRate = useStore((s) => s.setForecastRate)

  // Scope: only the (pair, date) combinations the system actually references.
  const requests = useMemo(() => deriveNeededFxRequests(funds, portfolios), [funds, portfolios])
  const summary = useMemo(() => summarizeNeededFx(requests), [requests])

  // Distinct base→quote pairs in the system (for the forecast-rate editor).
  const pairList = useMemo(() => {
    const seen = new Map<string, { base: string; quote: string }>()
    for (const r of requests) {
      for (const q of r.quotes) seen.set(`${r.base}>${q}`, { base: r.base, quote: q })
    }
    return [...seen.values()].sort((a, b) =>
      `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`),
    )
  }, [requests])

  // Most recent pulled rate per pair = the forecast default.
  const latestByPair = useMemo(() => {
    const m: Record<string, PulledRate> = {}
    for (const r of Object.values(fxRates)) {
      const k = `${r.base}>${r.quote}`
      if (!m[k] || r.date > m[k].date) m[k] = r
    }
    return m
  }, [fxRates])

  // Needed (pair, date) rates that haven't been pulled yet — the D2 gap nudge.
  const missingCount = useMemo(() => {
    let n = 0
    for (const r of requests) {
      for (const q of r.quotes) if (!fxRates[pulledRateKey(r.base, q, r.date)]) n++
    }
    return n
  }, [requests, fxRates])

  const rows = useMemo(
    () =>
      Object.values(fxRates).sort(
        (a, b) =>
          a.base.localeCompare(b.base) ||
          a.quote.localeCompare(b.quote) ||
          a.date.localeCompare(b.date),
      ),
    [fxRates],
  )

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)

  async function onPull() {
    if (requests.length === 0 || loading) return
    setLoading(true)
    setErrors([])
    setStatus(null)
    try {
      const result = await fetchRates(requests)
      setPulledRates(result.rates)
      setErrors(result.errors)
      setStatus(
        `Pulled ${result.rates.length} rate${result.rates.length === 1 ? '' : 's'}` +
          (result.errors.length
            ? ` · ${result.errors.length} request${result.errors.length === 1 ? '' : 's'} failed`
            : ' · all requests succeeded'),
      )
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
      setStatus('Pull failed — see the error below.')
    } finally {
      setLoading(false)
    }
  }

  function onClear() {
    if (rows.length === 0) return
    if (!window.confirm('Clear all pulled exchange rates? (They can be re-pulled.)')) return
    clearPulledRates()
    setStatus(null)
    setErrors([])
  }

  return (
    <RoutePlaceholder navId="exchange-rates">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Exchange Rates</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Pull ECB reference rates from{' '}
            <a
              href="https://frankfurter.dev/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-navy underline-offset-2 hover:underline"
            >
              frankfurter.dev
            </a>{' '}
            for only the currency pairs and dates your funds and portfolios use. Rates are
            shown for review and do not change any forecast.
          </p>
        </div>
        <button
          type="button"
          className={primaryBtn}
          onClick={onPull}
          disabled={loading || requests.length === 0}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={2.25} />
          )}
          {loading ? 'Pulling…' : rows.length ? 'Refresh rates' : 'Pull rates'}
        </button>
      </div>

      {/* Scope preview — exactly what will be pulled. */}
      <div className={cn(card, 'mt-5')}>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Rates in the system
        </h3>
        {requests.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-muted">
            No cross-currency pairs to pull — every allocated fund already reports in its
            portfolio's currency.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-[13px] text-muted">
              {summary.count} rate{summary.count === 1 ? '' : 's'} across {summary.pairs.length}{' '}
              pair{summary.pairs.length === 1 ? '' : 's'} and {summary.dates.length} date
              {summary.dates.length === 1 ? '' : 's'}, derived from your funds and portfolios.
            </p>
            {missingCount > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                <TriangleAlert className="size-3.5" strokeWidth={2.25} />
                {missingCount} historical rate{missingCount === 1 ? '' : 's'} for your actuals
                {missingCount === 1 ? " hasn't" : " haven't"} been pulled — portfolio actuals fall
                back to the nearest known or forecast rate until you pull.
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Pairs
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {summary.pairs.map((p) => (
                    <span key={p} className={chip}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Dates
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {summary.dates.map((d) => (
                    <span key={d} className={chip}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Forecast rate — applied to forecast quarters at the portfolio level. */}
      {pairList.length > 0 && (
        <div className={cn(card, 'mt-5')}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Forecast rate
          </h3>
          <p className="mt-1.5 text-[13px] text-muted">
            The rate used to convert <span className="font-medium text-body">forecast</span>{' '}
            quarters in portfolio roll-ups. Defaults to the most recent pulled date; override a
            pair to model a different go-forward rate. Historical actuals always convert at their
            own quarter's rate.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 text-left font-semibold">Pair</th>
                  <th className="px-3 pb-2 text-left font-semibold">Default (latest pull)</th>
                  <th className="px-3 pb-2 text-left font-semibold">Forecast rate</th>
                  <th className="w-16 pb-2" />
                </tr>
              </thead>
              <tbody>
                {pairList.map(({ base, quote }) => {
                  const key = `${base}>${quote}`
                  const override = forecastRates[key]
                  const latest = latestByPair[key]
                  return (
                    <tr key={key} className="border-t border-border-subtle">
                      <td className="py-1.5 pr-3 text-left font-medium text-body">
                        {base}
                        <span className="text-slate-400"> → </span>
                        {quote}
                      </td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-muted">
                        {latest ? `${fmtRate(latest.rate)} (as of ${latest.date})` : 'not pulled yet'}
                      </td>
                      <td className="w-40 px-3 py-1.5">
                        <NumberInput
                          value={override}
                          onCommit={(v) => setForecastRate(base, quote, v)}
                          placeholder={latest ? fmtRate(latest.rate) : '—'}
                          decimals={4}
                          align="left"
                          ariaLabel={`Forecast rate ${base} to ${quote}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-left">
                        {override !== undefined && (
                          <button
                            type="button"
                            className="text-[12px] text-muted underline-offset-2 hover:text-body hover:underline"
                            onClick={() => setForecastRate(base, quote, null)}
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status + errors. */}
      {status && (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-body">
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              errors.length ? 'bg-amber-500' : 'bg-positive',
            )}
          />
          {status}
        </p>
      )}
      {errors.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800">
            <TriangleAlert className="size-3.5" strokeWidth={2.25} />
            {errors.length} request{errors.length === 1 ? '' : 's'} could not be pulled
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-amber-800/90">
            {errors.map((e) => (
              <li key={e} className="tabular-nums">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pulled rates. */}
      <div className={cn(card, 'mt-5')}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Pulled rates
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Units of quote per 1 unit of base. As-of is the actual ECB date returned.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              className={cn(secondaryBtn, 'text-negative hover:bg-red-50')}
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
            <div className="max-w-sm px-6">
              <ArrowRightLeft className="mx-auto size-5 text-slate-400" strokeWidth={1.75} />
              <p className="mt-2 text-sm font-semibold text-body">No rates pulled yet</p>
              <p className="mt-1 text-[13px] text-muted">
                {requests.length === 0
                  ? 'Add a fund whose currency differs from its portfolio to need a rate.'
                  : 'Click “Pull rates” to fetch the rates listed above from frankfurter.dev.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 text-left font-semibold">Pair</th>
                  <th className="px-3 pb-2 text-left font-semibold">Date</th>
                  <th className="px-3 pb-2 text-right font-semibold">Rate</th>
                  <th className="px-3 pb-2 text-left font-semibold">As-of (ECB)</th>
                  <th className="px-3 pb-2 text-left font-semibold">Fetched</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const adjusted = r.ecbDate !== r.date
                  return (
                    <tr
                      key={`${r.base}>${r.quote}@${r.date}`}
                      className="border-t border-border-subtle"
                    >
                      <td className="py-1.5 pr-3 text-left font-medium text-body">
                        {r.base}
                        <span className="text-slate-400"> → </span>
                        {r.quote}
                      </td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-muted">{r.date}</td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums text-body">
                        {fmtRate(r.rate)}
                      </td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-muted">
                        {r.ecbDate}
                        {adjusted && (
                          <span
                            className="ml-1 text-amber-600"
                            title={`Requested ${r.date}; ECB published no rate that day, so the nearest prior business day (${r.ecbDate}) was used.`}
                          >
                            *
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-muted">
                        {fmtFetched(r.fetchedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoutePlaceholder>
  )
}
