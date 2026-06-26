import { cn } from '@/lib/cn'
import { currencySymbol } from '@/lib/currency'
import { quarterLabel } from '@/lib/quarter'
import { formatMultiple } from '@/lib/metrics'
import {
  quarterDeviation,
  type QuarterAmounts,
  type QuarterComparison,
  type QuarterDeviation,
} from '@/lib/comparison'
import { Toggle } from '@/components/common/Toggle'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const DASH = '—'

/** Money amounts render as grouped integers (the currency is named in the caption,
 *  matching the Actuals grid's density). */
const fmtAmount = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtDelta = (n: number | null) =>
  n === null ? DASH : `${n >= 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString('en-US')}`
const fmtMultipleDelta = (v: number | null) =>
  v === null ? 'n.a.' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}×`

/** Sign tint for deviation cells. "Good vs bad" is metric-dependent, so this is a
 *  neutral above/below-plan signal, not a judgment. */
const toneClass = (n: number | null): string =>
  n === null ? 'text-slate-300' : n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-muted'

const VALUE_COLS = ['Contributed', 'Distributed', 'Recallable', 'NAV', 'PIC', 'DPI', 'RVPI', 'TVPI']
const DIVIDER_AT = 4 // left divider before PIC separates amounts from multiples

interface ValueCell {
  text: string
  className: string
}

function planCells(f: QuarterAmounts): ValueCell[] {
  const tint = 'text-muted'
  return [
    { text: fmtAmount(f.contributed), className: tint },
    { text: fmtAmount(f.distributed), className: tint },
    { text: DASH, className: 'text-slate-300' },
    { text: fmtAmount(f.nav), className: tint },
    { text: formatMultiple(f.multiples.pic), className: tint },
    { text: formatMultiple(f.multiples.dpi), className: tint },
    { text: formatMultiple(f.multiples.rvpi), className: tint },
    { text: formatMultiple(f.multiples.tvpi), className: tint },
  ]
}

function actualCells(a: QuarterAmounts): ValueCell[] {
  const tint = 'text-body'
  return [
    { text: fmtAmount(a.contributed), className: tint },
    { text: fmtAmount(a.distributed), className: tint },
    { text: a.recallable === null ? DASH : fmtAmount(a.recallable), className: a.recallable === null ? 'text-slate-300' : tint },
    { text: fmtAmount(a.nav), className: tint },
    { text: formatMultiple(a.multiples.pic), className: tint },
    { text: formatMultiple(a.multiples.dpi), className: tint },
    { text: formatMultiple(a.multiples.rvpi), className: tint },
    { text: formatMultiple(a.multiples.tvpi), className: tint },
  ]
}

function deviationCells(d: QuarterDeviation): ValueCell[] {
  return [
    { text: fmtDelta(d.contributed), className: toneClass(d.contributed) },
    { text: fmtDelta(d.distributed), className: toneClass(d.distributed) },
    { text: DASH, className: 'text-slate-300' },
    { text: fmtDelta(d.nav), className: toneClass(d.nav) },
    { text: fmtMultipleDelta(d.pic), className: toneClass(d.pic) },
    { text: fmtMultipleDelta(d.dpi), className: toneClass(d.dpi) },
    { text: fmtMultipleDelta(d.rvpi), className: toneClass(d.rvpi) },
    { text: fmtMultipleDelta(d.tvpi), className: toneClass(d.tvpi) },
  ]
}

type LineKind = 'forecast' | 'actual' | 'deviation'

const TAG: Record<LineKind, { label: string; className: string }> = {
  forecast: { label: 'Plan', className: 'bg-slate-100 text-slate-500' },
  actual: { label: 'Actual', className: 'bg-brand-navy/10 text-brand-navy' },
  deviation: { label: 'Δ', className: 'bg-slate-100 text-slate-500' },
}

interface Props {
  /** Reporting currency for the amount captions (a fund's, or a portfolio's). */
  currency: string
  data: QuarterComparison[]
  showForecast: boolean
  onToggleForecast: (v: boolean) => void
  /** Card heading (default 'Plan vs actual'). Overridden for lookthrough per-fund grids. */
  title?: string
  /** Hide the Show-forecast toggle (e.g. lookthrough grids that follow a shared toggle). */
  hideToggle?: boolean
}

export function PerformanceGrid({
  currency,
  data,
  showForecast,
  onToggleForecast,
  title = 'Plan vs actual',
  hideToggle = false,
}: Props) {

  // Toggle OFF → only quarters that have an actual (one Actual line each).
  // Toggle ON  → the full forecast horizon (Plan always; Actual/Δ where present).
  const rows = showForecast ? data : data.filter((d) => d.actual)

  return (
    <div className="mt-5 space-y-5">
      <div className={card}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {title}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Amounts in {currency} ({currencySymbol(currency)}). Δ = Actual − Forecast; the plan
              ignores actuals, so deviations reflect tracking against underwriting.
            </p>
          </div>
          {!hideToggle && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] font-medium text-muted">
              <span>Show forecast &amp; deviations</span>
              <Toggle
                checked={showForecast}
                onChange={onToggleForecast}
                ariaLabel="Show forecast and deviations"
              />
            </label>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
            <div className="max-w-sm px-6">
              <p className="text-[13px] font-semibold text-body">No actuals yet</p>
              <p className="mt-1 text-[12px] text-muted">
                Add quarterly actuals on the Actuals screen, or toggle{' '}
                <span className="font-medium">Show forecast</span> to see the underwriting plan.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-24 pb-2 pr-3 text-left font-semibold">Quarter</th>
                  <th className="w-14 pb-2 text-left font-semibold" />
                  {VALUE_COLS.map((label, i) => (
                    <th
                      key={label}
                      className={cn(
                        'px-1.5 pb-2 text-right font-semibold',
                        i === DIVIDER_AT && 'border-l border-border-subtle pl-3',
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, gi) => {
                  // Actual on top (carries the quarter label + group border), then
                  // Plan, then Δ below it.
                  const lines: LineKind[] = []
                  if (c.actual) lines.push('actual')
                  if (showForecast && c.forecast) lines.push('forecast')
                  if (showForecast && c.actual && c.forecast) lines.push('deviation')

                  const dev =
                    c.actual && c.forecast ? quarterDeviation(c.actual, c.forecast) : null

                  return lines.map((kind, li) => {
                    const cells =
                      kind === 'forecast'
                        ? planCells(c.forecast!)
                        : kind === 'actual'
                          ? actualCells(c.actual!)
                          : deviationCells(dev!)
                    const topBorder = li === 0 && gi > 0
                    const border = topBorder ? 'border-t border-border-subtle' : ''
                    const tag = TAG[kind]
                    return (
                      <tr key={`${c.quarter.year}-${c.quarter.q}-${kind}`}>
                        <td
                          className={cn(
                            'py-1.5 pr-3 text-left font-medium tabular-nums text-body',
                            border,
                          )}
                        >
                          {li === 0 ? quarterLabel(c.quarter) : ''}
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
                        {cells.map((cell, ci) => (
                          <td
                            key={ci}
                            className={cn(
                              'px-1.5 py-1.5 text-right tabular-nums',
                              cell.className,
                              ci === DIVIDER_AT && 'border-l border-border-subtle pl-3',
                              border,
                            )}
                          >
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
