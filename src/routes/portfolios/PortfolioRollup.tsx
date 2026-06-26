import { useState } from 'react'
import { useStore } from '@/store'
import { PerformanceGrid } from '@/routes/performance/PerformanceGrid'
import { explainPortfolioCell } from '@/lib/portfolioExplain'
import { usePortfolioComparison } from './usePortfolioComparison'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

export function PortfolioRollup({ portfolioId }: { portfolioId: string }) {
  // Aggregate roll-up of the underlying funds (pro-rata × per-quarter FX). Forecast-first
  // by default — the roll-up is forecast-first and most funds have no actuals yet. Per-fund
  // lookthrough is reached from the Underlying-funds table (a slide-in drawer), not here.
  const [showForecast, setShowForecast] = useState(true)
  const exists = useStore((s) => !!s.portfolios[portfolioId])
  const ccy = useStore((s) => s.portfolios[portfolioId]?.reportingCurrency) ?? 'EUR'
  const agg = usePortfolioComparison(portfolioId)

  if (!exists) return null

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
        commitment={agg.totalCommitment}
        explain={(ref) =>
          explainPortfolioCell(agg.data, ref, agg.totalCommitment, ccy, agg.lookthrough)
        }
        showForecast={showForecast}
        onToggleForecast={setShowForecast}
      />
    </div>
  )
}
