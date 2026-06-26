import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, SquareChartGantt } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { useFundBaselineForecast } from '@/store/selectors/forecast'
import { buildFundComparison } from '@/lib/comparison'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { KebabMenu } from '@/components/common/KebabMenu'
import { PerformanceGrid } from './PerformanceGrid'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const primaryBtn =
  'rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90'

export function PerformancePage() {
  const navigate = useNavigate()
  const fundOrder = useStore((s) => s.fundOrder)
  const funds = useStore((s) => s.funds)
  const templates = useStore((s) => s.templates)
  const select = useStore((s) => s.select)

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedFundId
    return sel && st.fundOrder.includes(sel) ? sel : (st.fundOrder[0] ?? '')
  })

  // View preference: persists across fund switches (read-only page, no draft state).
  const [showForecast, setShowForecast] = useState(false)

  const effectiveId = fundOrder.includes(activeId) ? activeId : (fundOrder[0] ?? '')
  const fund = effectiveId ? funds[effectiveId] : undefined

  const baseline = useFundBaselineForecast(effectiveId)

  const data = useMemo(() => {
    if (!fund || !baseline) return []
    const template = templates[fund.templateId]
    const baseId = template?.baseScenarioId
    const scenario =
      baseline.scenarios.find((sc) => sc.scenarioId === baseId) ?? baseline.scenarios[0]
    return buildFundComparison({
      commitment: fund.commitment,
      effectiveDate: fund.effectiveDate,
      actuals: fund.actuals,
      forecastRows: scenario?.rows ?? [],
    })
  }, [fund, baseline, templates])

  function choose(id: string) {
    setActiveId(id)
    select({ selectedFundId: id || undefined })
  }

  /** Open a fund sub-page (editor / actuals) scoped to the selected fund. */
  function openFor(route: string) {
    if (fund) select({ selectedFundId: fund.id })
    navigate(route)
  }

  return (
    <RoutePlaceholder navId="performance">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Funds</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Compare each quarter's realized actuals against the original plan. Toggle the forecast
            to reveal the underwriting plan across the fund's life and the deviation (Actual −
            Forecast) wherever an actual exists.
          </p>
        </div>
        {fund && (
          <KebabMenu
            ariaLabel="Fund actions"
            items={[
              { label: 'Edit fund', icon: SquareChartGantt, onClick: () => openFor('/funds') },
              { label: 'Actuals', icon: ClipboardList, onClick: () => openFor('/actuals') },
            ]}
          />
        )}
      </div>

      {fundOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No funds yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create your first fund to start forecasting, then upload its actuals to track
              plan-vs-actual.
            </p>
            <button
              type="button"
              className={cn(primaryBtn, 'mt-4')}
              onClick={() => navigate('/funds')}
            >
              New fund
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select
              className={cn(fieldCls, 'min-w-[220px] pr-8')}
              value={effectiveId}
              onChange={(e) => choose(e.target.value)}
              aria-label="Select fund"
            >
              {fundOrder.map((id) => (
                <option key={id} value={id}>
                  {funds[id]?.name}
                </option>
              ))}
            </select>
          </div>

          {fund && (
            <PerformanceGrid
              key={fund.id}
              currency={fund.currency}
              data={data}
              showForecast={showForecast}
              onToggleForecast={setShowForecast}
            />
          )}
        </>
      )}
    </RoutePlaceholder>
  )
}
