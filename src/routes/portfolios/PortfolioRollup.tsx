import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { selectFundBaselineForecast } from '@/store/selectors/forecast'
import {
  buildFundComparison,
  buildPortfolioComparison,
  type PortfolioFundComparison,
} from '@/lib/comparison'
import { portfolioFxRate } from '@/lib/portfolio'
import { PerformanceGrid } from '@/routes/performance/PerformanceGrid'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

interface Aggregated {
  data: ReturnType<typeof buildPortfolioComparison>
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

  // Subscribe to the raw inputs; recompute (via getState for memoized forecasts) when
  // any change. selectFundBaselineForecast returns stable refs while inputs are equal.
  const portfolios = useStore((s) => s.portfolios)
  const funds = useStore((s) => s.funds)
  const templates = useStore((s) => s.templates)

  const portfolio = portfolios[portfolioId]
  const ccy = portfolio?.reportingCurrency ?? 'EUR'

  const agg: Aggregated = useMemo(() => {
    const s = useStore.getState()
    const pf = s.portfolios[portfolioId]
    if (!pf) return { data: [], includedCount: 0, excluded: [] }

    const fundComparisons: PortfolioFundComparison[] = []
    const excluded: string[] = []
    let totalCommitment = 0

    for (const [fundId, alloc] of Object.entries(pf.allocations)) {
      const fund = s.funds[fundId]
      if (!fund) continue
      const rate = portfolioFxRate(pf.fx, fund.currency, pf.reportingCurrency)
      if (rate === null || fund.commitment <= 0) {
        excluded.push(fund.name)
        continue
      }
      const factor = (alloc.allocatedCommitment / fund.commitment) * rate
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
      fundComparisons.push({ comparison, factor })
      totalCommitment += alloc.allocatedCommitment * rate
    }

    return {
      data: buildPortfolioComparison({ totalCommitment, funds: fundComparisons }),
      includedCount: fundComparisons.length,
      excluded,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, funds, templates, portfolioId])

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
    </div>
  )
}
