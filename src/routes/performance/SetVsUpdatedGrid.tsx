import { cn } from '@/lib/cn'
import { currencySymbol } from '@/lib/currency'
import { quarterLabel } from '@/lib/quarter'
import { formatMultiple } from '@/lib/metrics'
import type { QuarterAmounts, QuarterDeviation } from '@/lib/comparison'
import { quarterDrift, type SetVsUpdatedRow } from '@/lib/setVsUpdated'

// A sibling of PerformanceGrid relabeled for the active-vs-recalibrated comparison:
// three stacked lines per quarter — the frozen Active forecast, the Recalibrated
// forecast (active + actuals under the policy), and Δ (Recalibrated − Active, the
// drift). Both sides are dense forecasts, so there is no "show forecast" filtering and
// no recallable column (neither side models recallables). Plain text — no calc-trace
// drawer in v1.

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const DASH = '—'

const fmtAmount = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtDelta = (n: number | null) =>
  n === null ? DASH : `${n >= 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString('en-US')}`
const fmtMultipleDelta = (v: number | null) =>
  v === null ? 'n.a.' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}×`

/** Neutral above/below-baseline tint (not a good/bad judgment). */
const toneClass = (n: number | null): string =>
  n === null ? 'text-slate-300' : n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-muted'

const VALUE_COLS = ['Contributed', 'Distributed', 'NAV', 'PIC', 'DPI', 'RVPI', 'TVPI']
const DIVIDER_AT = 3 // divider before PIC separates amounts from multiples

interface ValueCell {
  text: string
  className: string
}

function amountCells(a: QuarterAmounts, tint: string): ValueCell[] {
  return [
    { text: fmtAmount(a.contributed), className: tint },
    { text: fmtAmount(a.distributed), className: tint },
    { text: fmtAmount(a.nav), className: tint },
    { text: formatMultiple(a.multiples.pic), className: tint },
    { text: formatMultiple(a.multiples.dpi), className: tint },
    { text: formatMultiple(a.multiples.rvpi), className: tint },
    { text: formatMultiple(a.multiples.tvpi), className: tint },
  ]
}

function driftCells(d: QuarterDeviation): ValueCell[] {
  return [
    { text: fmtDelta(d.contributed), className: toneClass(d.contributed) },
    { text: fmtDelta(d.distributed), className: toneClass(d.distributed) },
    { text: fmtDelta(d.nav), className: toneClass(d.nav) },
    { text: fmtMultipleDelta(d.pic), className: toneClass(d.pic) },
    { text: fmtMultipleDelta(d.dpi), className: toneClass(d.dpi) },
    { text: fmtMultipleDelta(d.rvpi), className: toneClass(d.rvpi) },
    { text: fmtMultipleDelta(d.tvpi), className: toneClass(d.tvpi) },
  ]
}

type LineKind = 'set' | 'updated' | 'drift'

const TAG: Record<LineKind, { label: string; className: string }> = {
  set: { label: 'Active', className: 'bg-slate-100 text-slate-500' },
  updated: { label: 'Recalibrated', className: 'bg-brand-navy/10 text-brand-navy' },
  drift: { label: 'Δ', className: 'bg-slate-100 text-slate-500' },
}

interface Props {
  currency: string
  data: SetVsUpdatedRow[]
  title?: string
}

export function SetVsUpdatedGrid({
  currency,
  data,
  title = 'Active vs recalibrated forecast',
}: Props) {
  return (
    <div className="mt-5 space-y-5">
      <div className={card}>
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Amounts in {currency} ({currencySymbol(currency)}). Active = the forecast you froze;
            Recalibrated = the active forecast with actuals applied under the current policy; Δ =
            Recalibrated − Active (drift).
          </p>
        </div>

        {data.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
            <p className="text-[13px] text-muted">No forecast quarters to compare.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-24 pb-2 pr-3 text-left font-semibold">Quarter</th>
                  <th className="w-16 pb-2 text-left font-semibold" />
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
                {data.map((r, gi) => {
                  const lines: LineKind[] = []
                  if (r.set) lines.push('set')
                  if (r.updated) lines.push('updated')
                  if (r.set && r.updated) lines.push('drift')
                  const drift = r.set && r.updated ? quarterDrift(r) : null

                  return lines.map((kind, li) => {
                    const cells =
                      kind === 'set'
                        ? amountCells(r.set!, 'text-muted')
                        : kind === 'updated'
                          ? amountCells(r.updated!, 'text-body')
                          : driftCells(drift!)
                    const topBorder = li === 0 && gi > 0
                    const border = topBorder ? 'border-t border-border-subtle' : ''
                    const tag = TAG[kind]
                    return (
                      <tr key={`${r.quarter.year}-${r.quarter.q}-${kind}`}>
                        <td
                          className={cn(
                            'py-1.5 pr-3 text-left font-medium tabular-nums text-body',
                            border,
                          )}
                        >
                          {li === 0 ? quarterLabel(r.quarter) : ''}
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
