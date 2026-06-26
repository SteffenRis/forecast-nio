import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { currencySymbol } from '@/lib/currency'
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/format'
import { quarterLabel, quarterOfIso, quarterOrdinal, compareByQuarter } from '@/lib/quarter'
import { useFundFeeTrace, useFundForecast } from '@/store/selectors/forecast'
import { buildFeeOverview, type FeeRow, type FeePhase, type FeeSplit } from '@/lib/feeOverview'
import { explainCell, type CellRef } from '@/lib/feeExplain'
import { CalcDrawer } from '@/components/common/CalcDrawer'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const DASH = '—'

/** Grouped-integer amounts; the currency is named in the section caption (matching
 *  the density of the Performance / Actuals grids). Exact zeros read as a dash. */
const fmtAmount = (n: number) =>
  Math.round(n) === 0 ? DASH : Math.round(n).toLocaleString('en-US')

const PHASE_TAG: Record<FeePhase, { label: string; className: string }> = {
  actual: { label: 'Actual', className: 'bg-brand-navy/10 text-brand-navy' },
  'in-progress': { label: 'In progress', className: 'bg-amber-100 text-amber-700' },
  forecast: { label: 'Forecast', className: 'bg-slate-100 text-slate-500' },
}

function StatCard({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: string
  sub: string
  accent?: string
  onClick?: () => void
}) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'mt-1 block text-left text-lg font-bold tabular-nums underline-offset-2 hover:underline',
            accent ?? 'text-body',
          )}
        >
          {value}
        </button>
      ) : (
        <p className={cn('mt-1 text-lg font-bold tabular-nums', accent ?? 'text-body')}>{value}</p>
      )}
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

interface Props {
  fundId: string
  /** The Terms tab has unsaved edits — figures here reflect the last saved fund. */
  dirty: boolean
}

export function FundFeesOverview({ fundId, dirty }: Props) {
  const fund = useStore((s) => s.funds[fundId])
  const templates = useStore((s) => s.templates)
  const forecast = useFundForecast(fundId)
  const feeTrace = useFundFeeTrace(fundId)

  const template = fund ? templates[fund.templateId] : undefined

  const scenario = useMemo(() => {
    if (!forecast) return null
    const baseId = template?.baseScenarioId
    return forecast.scenarios.find((s) => s.scenarioId === baseId) ?? forecast.scenarios[0] ?? null
  }, [forecast, template])

  // The matching trace scenario powers the calculation drawer.
  const traceScenario = useMemo(() => {
    if (!feeTrace) return null
    const baseId = template?.baseScenarioId
    return feeTrace.scenarios.find((s) => s.scenarioId === baseId) ?? feeTrace.scenarios[0] ?? null
  }, [feeTrace, template])

  // The number whose calculation the drawer is tracing (null = closed).
  const [selected, setSelected] = useState<CellRef | null>(null)

  const overview = useMemo(() => {
    if (!fund || !scenario) return null
    const rows: FeeRow[] = scenario.rows.map((r) => ({
      quarter: r.quarter,
      mgmtFee: r.mgmtFee,
      expenses: r.expenses,
      establishment: r.establishment,
      carry: r.carry,
    }))
    return buildFeeOverview({ commitment: fund.commitment, rows, actuals: fund.actuals })
  }, [fund, scenario])

  // Which year rows are drilled down to their quarters. Reset when the fund changes.
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    setOpenYears(new Set())
    setSelected(null)
  }, [fundId])
  const toggleYear = (year: number) =>
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })

  if (!fund) return null

  const currency = fund.currency

  if (!overview || !scenario) {
    return (
      <div className="mt-5">
        <div className="grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No fee forecast available</p>
            <p className="mt-1 text-[13px] text-muted">
              This fund has no forecast scenario yet. Check its template on the Templates screen.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { totals, years, feeLoadPct, carryActive, carryStart } = overview

  // Lifecycle: IP vs post-IP relative to the latest reported quarter (or, before any
  // actuals, the effective-date quarter). Deterministic — no wall clock, like the engine.
  const ipEndQ = quarterOfIso(fund.fees.investmentPeriodEnd)
  const lastActual = fund.actuals.length
    ? [...fund.actuals].sort(compareByQuarter).at(-1)
    : undefined
  const currentQ = lastActual?.quarter ?? quarterOfIso(fund.effectiveDate)
  const inIP = quarterOrdinal(currentQ) <= quarterOrdinal(ipEndQ)

  const money = (n: number) => formatMoney(n, currency)
  const compact = (n: number) => formatMoneyCompact(n, currency)
  const splitSub = (s: FeeSplit) => `${compact(s.toDate)} to date · ${compact(s.projected)} projected`

  // A numeric table cell: clickable (opens the calculation drawer) when non-zero,
  // a plain dash otherwise. stopPropagation so it doesn't toggle the year row.
  const numCell = (value: number, ref: CellRef) => {
    const text = fmtAmount(value)
    if (text === DASH) return <span className="text-slate-300">{DASH}</span>
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setSelected(ref)
        }}
        className="tabular-nums underline-offset-2 hover:text-brand-navy hover:underline focus:text-brand-navy focus:outline-none"
      >
        {text}
      </button>
    )
  }

  // The first forecast year after a realized one gets a stronger divider.
  const firstForecastYear = years.find((y) => y.phase === 'forecast' && years[0].phase !== 'forecast')

  return (
    <div className="mt-5 space-y-5">
      {dirty && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          <span className="inline-block size-2 shrink-0 rounded-full bg-amber-500" />
          Showing saved values. Save your changes on the Terms tab to refresh these figures.
        </div>
      )}

      {/* Lifecycle / hurdle status */}
      <div className={cn(card, 'flex flex-wrap items-start justify-between gap-4')}>
        <div>
          <p className="text-[13px] font-semibold text-body">
            {inIP ? 'Investment period' : 'Post-investment period'}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {inIP
              ? `Higher fee rate applies until the investment period ends in ${quarterLabel(ipEndQ)}.`
              : `Investment period ended ${quarterLabel(ipEndQ)} — the reduced post-IP rate now applies.`}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[13px] font-semibold text-body">
            {carryActive ? 'Carry active' : 'Below hurdle'}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {carryActive && carryStart
              ? `GP carried interest accrues from ${quarterLabel(carryStart)}, once the hurdle clears.`
              : 'No carried interest projected — returns stay below the preferred return.'}
          </p>
        </div>
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Management fees"
          value={money(totals.mgmtFee.lifetime)}
          sub={splitSub(totals.mgmtFee)}
          onClick={() => setSelected({ kind: 'lifetime', metric: 'mgmtFee' })}
        />
        <StatCard
          label="Fund expenses"
          value={money(totals.expenses.lifetime)}
          sub={splitSub(totals.expenses)}
          onClick={() => setSelected({ kind: 'lifetime', metric: 'expenses' })}
        />
        <StatCard
          label="Establishment"
          value={money(totals.establishment.lifetime)}
          sub="One-time, at fund inception"
          onClick={() => setSelected({ kind: 'lifetime', metric: 'establishment' })}
        />
        <StatCard
          label="Carried interest"
          value={money(totals.carry.lifetime)}
          sub={carryActive ? splitSub(totals.carry) : 'Below hurdle — none projected'}
          onClick={() => setSelected({ kind: 'lifetime', metric: 'carry' })}
        />
        <StatCard
          label="Total cost to LP"
          value={money(totals.totalToLp.lifetime)}
          accent="text-brand-navy"
          sub={
            feeLoadPct !== null
              ? `Fund costs ${formatPercent(feeLoadPct, 1)} of commitment (ex-carry)`
              : 'Set a commitment to see the fee load'
          }
          onClick={() => setSelected({ kind: 'lifetime', metric: 'totalToLp' })}
        />
      </div>

      {/* Annual breakdown */}
      <div className={card}>
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fees by year
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Amounts in {currency} ({currencySymbol(currency)}). Each year is realized (Actual) or
            projected (Forecast) by where the fund sits in its lifecycle. Click a year to break it
            into quarters.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-20 pb-2 pr-3 text-left font-semibold">Year</th>
                <th className="w-24 pb-2 text-left font-semibold" />
                <th className="px-1.5 pb-2 text-right font-semibold">Mgmt fee</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Expenses</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Establishment</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Carry</th>
                <th className="border-l border-border-subtle px-1.5 pb-2 pl-3 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => {
                const tag = PHASE_TAG[y.phase]
                const boundary = firstForecastYear?.year === y.year
                const border = i > 0 ? (boundary ? 'border-t-2 border-border-default' : 'border-t border-border-subtle') : ''
                const open = openYears.has(y.year)
                return (
                  <Fragment key={y.year}>
                    <tr
                      role="button"
                      aria-expanded={open}
                      tabIndex={0}
                      onClick={() => toggleYear(y.year)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleYear(y.year)
                        }
                      }}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className={cn('py-1.5 pr-3 text-left font-medium tabular-nums text-body', border)}>
                        <span className="inline-flex items-center gap-1.5">
                          {open ? (
                            <ChevronDown className="size-3.5 text-slate-400" strokeWidth={2.25} />
                          ) : (
                            <ChevronRight className="size-3.5 text-slate-400" strokeWidth={2.25} />
                          )}
                          {y.year}
                        </span>
                      </td>
                      <td className={cn('py-1.5', border)}>
                        <span
                          className={cn(
                            'inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            tag.className,
                          )}
                        >
                          {tag.label}
                        </span>
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums text-body', border)}>
                        {numCell(y.mgmtFee, { kind: 'year', metric: 'mgmtFee', year: y.year })}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums text-body', border)}>
                        {numCell(y.expenses, { kind: 'year', metric: 'expenses', year: y.year })}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums text-body', border)}>
                        {numCell(y.establishment, { kind: 'year', metric: 'establishment', year: y.year })}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums text-body', border)}>
                        {numCell(y.carry, { kind: 'year', metric: 'carry', year: y.year })}
                      </td>
                      <td
                        className={cn(
                          'border-l border-border-subtle px-1.5 py-1.5 pl-3 text-right font-medium tabular-nums text-body',
                          border,
                        )}
                      >
                        {numCell(y.total, { kind: 'year', metric: 'total', year: y.year })}
                      </td>
                    </tr>
                    {open &&
                      y.quarters.map((q) => {
                        const qtag = PHASE_TAG[q.phase]
                        return (
                          <tr key={`${q.quarter.year}-${q.quarter.q}`} className="bg-slate-50/60">
                            <td className="border-t border-border-subtle py-1 pl-7 pr-3 text-left tabular-nums text-muted">
                              {quarterLabel(q.quarter)}
                            </td>
                            <td className="border-t border-border-subtle py-1">
                              <span
                                className={cn(
                                  'inline-flex rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                                  qtag.className,
                                )}
                              >
                                {qtag.label}
                              </span>
                            </td>
                            <td className="border-t border-border-subtle px-1.5 py-1 text-right tabular-nums text-muted">
                              {numCell(q.mgmtFee, { kind: 'quarter', metric: 'mgmtFee', year: q.quarter.year, q: q.quarter.q })}
                            </td>
                            <td className="border-t border-border-subtle px-1.5 py-1 text-right tabular-nums text-muted">
                              {numCell(q.expenses, { kind: 'quarter', metric: 'expenses', year: q.quarter.year, q: q.quarter.q })}
                            </td>
                            <td className="border-t border-border-subtle px-1.5 py-1 text-right tabular-nums text-muted">
                              {numCell(q.establishment, { kind: 'quarter', metric: 'establishment', year: q.quarter.year, q: q.quarter.q })}
                            </td>
                            <td className="border-t border-border-subtle px-1.5 py-1 text-right tabular-nums text-muted">
                              {numCell(q.carry, { kind: 'quarter', metric: 'carry', year: q.quarter.year, q: q.quarter.q })}
                            </td>
                            <td className="border-l border-t border-border-subtle px-1.5 py-1 pl-3 text-right tabular-nums text-muted">
                              {numCell(q.total, { kind: 'quarter', metric: 'total', year: q.quarter.year, q: q.quarter.q })}
                            </td>
                          </tr>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="border-t-2 border-border-default py-2 pr-3 text-left text-body">
                  Lifetime
                </td>
                <td className="border-t-2 border-border-default py-2" />
                <td className="border-t-2 border-border-default px-1.5 py-2 text-right tabular-nums text-body">
                  {numCell(totals.mgmtFee.lifetime, { kind: 'lifetime', metric: 'mgmtFee' })}
                </td>
                <td className="border-t-2 border-border-default px-1.5 py-2 text-right tabular-nums text-body">
                  {numCell(totals.expenses.lifetime, { kind: 'lifetime', metric: 'expenses' })}
                </td>
                <td className="border-t-2 border-border-default px-1.5 py-2 text-right tabular-nums text-body">
                  {numCell(totals.establishment.lifetime, { kind: 'lifetime', metric: 'establishment' })}
                </td>
                <td className="border-t-2 border-border-default px-1.5 py-2 text-right tabular-nums text-body">
                  {numCell(totals.carry.lifetime, { kind: 'lifetime', metric: 'carry' })}
                </td>
                <td className="border-l border-t-2 border-border-default border-l-border-subtle px-1.5 py-2 pl-3 text-right tabular-nums text-brand-navy">
                  {numCell(totals.totalToLp.lifetime, { kind: 'lifetime', metric: 'totalToLp' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {traceScenario && (
        <CalcDrawer
          selected={selected}
          onClose={() => setSelected(null)}
          build={(ref) => explainCell(traceScenario, ref, currency)}
        />
      )}
    </div>
  )
}
