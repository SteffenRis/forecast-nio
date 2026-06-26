import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '@/store'
import { selectFundBaselineForecast } from '@/store/selectors/forecast'
import {
  buildFundComparison,
  buildPortfolioComparison,
  type PortfolioFundComparison,
} from '@/lib/comparison'
import { buildPortfolioRateResolver } from '@/lib/portfolio'
import { quarterOrdinal } from '@/lib/quarter'
import { PerformanceGrid } from '@/routes/performance/PerformanceGrid'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'

const fmtPct = (n: number) => `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

/** One underlying fund's contribution to this portfolio, in the reporting currency
 *  (pro-rata × per-quarter FX) — the lookthrough decomposition of the aggregate. */
interface LookthroughEntry {
  fundId: string
  name: string
  /** allocatedCommitment / fund.commitment. */
  sharePct: number
  data: ReturnType<typeof buildPortfolioComparison>
}

interface Aggregated {
  data: ReturnType<typeof buildPortfolioComparison>
  lookthrough: LookthroughEntry[]
  includedCount: number
  excluded: string[]
}

export function PortfolioRollup({ portfolioId }: { portfolioId: string }) {
  // Mirror the Funds plan-vs-actual table: aggregate each underlying fund's baseline
  // comparison (plan = underwriting, actuals stripped) scaled by its pro-rata × FX,
  // then render the shared grid with the Show-forecast-&-deviations toggle. Default to
  // showing the forecast — the roll-up is forecast-first, and most funds have no
  // actuals yet.
  const [showForecast, setShowForecast] = useState(true)
  const [openFunds, setOpenFunds] = useState<Set<string>>(new Set())
  const toggleFund = (id: string) =>
    setOpenFunds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Subscribe to the raw inputs; recompute (via getState for memoized forecasts) when
  // any change. selectFundBaselineForecast returns stable refs while inputs are equal.
  const portfolios = useStore((s) => s.portfolios)
  const funds = useStore((s) => s.funds)
  const templates = useStore((s) => s.templates)
  // FX now varies per quarter, sourced from the global pulled rates + forecast overrides.
  const fxRates = useStore((s) => s.fxRates)
  const forecastOverrides = useStore((s) => s.forecastRates)

  const portfolio = portfolios[portfolioId]
  const ccy = portfolio?.reportingCurrency ?? 'EUR'

  const agg: Aggregated = useMemo(() => {
    const s = useStore.getState()
    const pf = s.portfolios[portfolioId]
    if (!pf) return { data: [], lookthrough: [], includedCount: 0, excluded: [] }

    const fundComparisons: PortfolioFundComparison[] = []
    const lookthrough: LookthroughEntry[] = []
    const excluded: string[] = []
    let totalCommitment = 0

    for (const [fundId, alloc] of Object.entries(pf.allocations)) {
      const fund = s.funds[fundId]
      if (!fund) continue
      const resolver = buildPortfolioRateResolver({
        from: fund.currency,
        to: pf.reportingCurrency,
        flat: pf.fx,
        pulled: s.fxRates,
        overrides: s.forecastRates,
      })
      // No resolvable rate at all (no pull, no override, no manual) → can't aggregate.
      if (resolver.forecastRate === null || fund.commitment <= 0) {
        excluded.push(fund.name)
        continue
      }
      const pr = alloc.allocatedCommitment / fund.commitment
      // Historical actuals convert at their quarter's rate, forecast quarters at the
      // forecast rate. The split is the fund's last actuals quarter.
      const lastActualOrd = fund.actuals.reduce(
        (m, a) => Math.max(m, quarterOrdinal(a.quarter)),
        -Infinity,
      )
      const factorForOrd = (ord: number) => pr * (resolver.rateForOrd(ord, lastActualOrd) ?? 0)
      const baseline = selectFundBaselineForecast(s, fundId)
      const template = s.templates[fund.templateId]
      const baseId = template?.baseScenarioId
      const scenario =
        baseline?.scenarios.find((sc) => sc.scenarioId === baseId) ?? baseline?.scenarios[0]
      const comparison = buildFundComparison({
        commitment: fund.commitment,
        effectiveDate: fund.effectiveDate,
        actuals: fund.actuals,
        forecastRows: scenario?.rows ?? [],
      })
      fundComparisons.push({ comparison, factorForOrd })
      // Commitment denominator (portfolio multiples) at the go-forward forecast rate.
      totalCommitment += alloc.allocatedCommitment * resolver.forecastRate
      // Lookthrough: the same aggregator over this one fund → its contribution in the
      // reporting currency, with multiples against its own allocated commitment. Because
      // buildPortfolioComparison is linear in amounts, these sum back to the aggregate.
      lookthrough.push({
        fundId,
        name: fund.name,
        sharePct: pr,
        data: buildPortfolioComparison({
          totalCommitment: alloc.allocatedCommitment * resolver.forecastRate,
          funds: [{ comparison, factorForOrd }],
        }),
      })
    }

    return {
      data: buildPortfolioComparison({ totalCommitment, funds: fundComparisons }),
      lookthrough,
      includedCount: fundComparisons.length,
      excluded,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, funds, templates, portfolioId, fxRates, forecastOverrides])

  if (!portfolio) return null

  if (agg.includedCount === 0) {
    return (
      <div className={card}>
        <SectionHeader title="Plan vs actual" sub="Pro-rata roll-up of the underlying funds." />
        <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
          <div className="max-w-sm px-6">
            <p className="text-[13px] font-semibold text-body">Nothing to roll up yet</p>
            <p className="mt-1 text-[12px] text-muted">
              {agg.excluded.length > 0
                ? `Add fund commitments the roll-up can aggregate. ${agg.excluded.length} fund${agg.excluded.length === 1 ? '' : 's'} need an FX rate to ${ccy}.`
                : 'Add fund commitments above to see the portfolio plan vs actual.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {agg.excluded.length > 0 && (
        <p className="px-1 text-[12px] text-muted">
          Excluded from the roll-up (no FX rate to {ccy}): {agg.excluded.join(', ')}.
        </p>
      )}
      <PerformanceGrid
        currency={ccy}
        data={agg.data}
        showForecast={showForecast}
        onToggleForecast={setShowForecast}
      />

      {/* Lookthrough: drill from the aggregate into each underlying fund's contribution. */}
      {agg.lookthrough.length > 0 && (
        <div className="space-y-2 pt-3">
          <div className="px-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Underlying funds (lookthrough)
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Each fund's share of this portfolio in {ccy} — the roll-up decomposed. Per-fund
              amounts sum to the aggregate above.
            </p>
          </div>
          {agg.lookthrough.map((lt) => {
            const open = openFunds.has(lt.fundId)
            return (
              <div key={lt.fundId}>
                <button
                  type="button"
                  onClick={() => toggleFund(lt.fundId)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-default bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    {open ? (
                      <ChevronDown className="size-4 text-slate-400" strokeWidth={2} />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" strokeWidth={2} />
                    )}
                    <span className="text-[13px] font-medium text-body">{lt.name}</span>
                  </span>
                  <span className="text-[12px] tabular-nums text-muted">
                    {fmtPct(lt.sharePct)} of fund
                  </span>
                </button>
                {open && (
                  <PerformanceGrid
                    title={`${lt.name} — contribution to ${portfolio.name}`}
                    hideToggle
                    currency={ccy}
                    data={lt.data}
                    showForecast={showForecast}
                    onToggleForecast={setShowForecast}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
