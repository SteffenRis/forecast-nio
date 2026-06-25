import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { currencySymbol } from '@/lib/currency'
import { compareByQuarter, nextQuarter, quarterLabel, quarterOfIso } from '@/lib/quarter'
import { formatMultiple, fundMultiples, type FundMultiples } from '@/lib/metrics'
import type { ActualsRecord, CalendarQuarterRef, Fund } from '@/store/types'
import { NumberInput } from '@/components/common/NumberInput'
import { Toggle } from '@/components/common/Toggle'
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'

/** The four absolute amounts captured per quarter. Contributed/Distributed are
 *  cumulative-to-date; NAV and Recallable are point-in-time balances. */
type AmountKey = 'cumulativePaidIn' | 'cumulativeDistributions' | 'recallableDistributions' | 'nav'

/** Each money column's paired performance multiple (none for Recallable). */
type RatioKey = 'pic' | 'dpi' | 'rvpi'

const COLS: { key: AmountKey; label: string; hint: string; optional?: boolean; metric?: RatioKey }[] = [
  { key: 'cumulativePaidIn', label: 'Contributed', hint: 'Cumulative paid-in to date', metric: 'pic' },
  {
    key: 'cumulativeDistributions',
    label: 'Distributed',
    hint: 'Cumulative distributions to date',
    metric: 'dpi',
  },
  {
    key: 'recallableDistributions',
    label: 'Recallable',
    hint: 'Recallable-distributions balance',
    optional: true,
  },
  { key: 'nav', label: 'NAV', hint: 'Net asset value at quarter end', metric: 'rvpi' },
]

const METRIC_LABEL: Record<RatioKey | 'tvpi', string> = {
  pic: 'PIC',
  dpi: 'DPI',
  rvpi: 'RVPI',
  tvpi: 'TVPI',
}

const TOP_METRICS: { key: keyof FundMultiples; hint: string }[] = [
  { key: 'pic', hint: 'Paid-in / commitment' },
  { key: 'dpi', hint: 'Distributed / paid-in' },
  { key: 'rvpi', hint: 'NAV / paid-in' },
  { key: 'tvpi', hint: 'Total value / paid-in' },
]

/** A small "PIC 0.30×" line shown under a money cell when key metrics are on. */
function MetricLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="mt-1 text-right text-[10px] font-medium tabular-nums text-slate-400">
      {label} {formatMultiple(value)}
    </div>
  )
}

interface Props {
  fund: Fund
  rows: ActualsRecord[]
  update: (recipe: (d: ActualsRecord[]) => void) => void
  dirty: boolean
  showMetrics: boolean
  onToggleMetrics: (v: boolean) => void
  onSave: () => void
  onDiscard: () => void
}

export function ActualsGrid({
  fund,
  rows,
  update,
  dirty,
  showMetrics,
  onToggleMetrics,
  onSave,
  onDiscard,
}: Props) {
  // Cmd/Ctrl+S saves when there are pending changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, onSave])

  // The quarter pending a type-to-confirm delete (null = dialog closed).
  const [pendingDelete, setPendingDelete] = useState<CalendarQuarterRef | null>(null)

  const { commitment, currency } = fund
  const sorted = [...rows].sort(compareByQuarter)

  const sameQuarter = (a: CalendarQuarterRef, b: CalendarQuarterRef) => a.year === b.year && a.q === b.q
  const multiplesOf = (r: ActualsRecord) =>
    fundMultiples({
      commitment,
      paidIn: r.cumulativePaidIn,
      distributed: r.cumulativeDistributions,
      nav: r.nav,
    })

  // Headline metrics use the latest (chronologically last) quarter's actuals.
  const latest = sorted.at(-1)
  const latestM: FundMultiples = latest
    ? multiplesOf(latest)
    : { pic: null, dpi: null, rvpi: null, tvpi: null }

  function setAmount(q: CalendarQuarterRef, key: AmountKey, v: number) {
    update((d) => {
      const r = d.find((x) => sameQuarter(x.quarter, q))
      if (r) r[key] = v
    })
  }
  function removeRow(q: CalendarQuarterRef) {
    update((d) => {
      const i = d.findIndex((x) => sameQuarter(x.quarter, q))
      if (i >= 0) d.splice(i, 1)
    })
  }
  function addQuarter() {
    update((d) => {
      const last = [...d].sort(compareByQuarter).at(-1)
      const q = last ? nextQuarter(last.quarter) : quarterOfIso(fund.effectiveDate)
      if (d.some((x) => sameQuarter(x.quarter, q))) return
      d.push({ quarter: q, cumulativePaidIn: 0, cumulativeDistributions: 0, nav: 0 })
      d.sort(compareByQuarter)
    })
  }

  return (
    <div className="mt-5 space-y-5">
      {/* Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-border-default bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
        <span
          className={cn(
            'flex items-center gap-2 text-[13px] font-medium',
            dirty ? 'text-body' : 'text-muted',
          )}
        >
          <span
            className={cn('inline-block size-2 rounded-full', dirty ? 'bg-amber-500' : 'bg-positive')}
          />
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty}
            className="rounded-md border border-border-default bg-white px-3 py-1.5 text-[13px] font-medium text-body hover:bg-slate-50 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty}
            className="rounded-md bg-brand-navy px-4 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <div className={card}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Quarterly actuals
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Cumulative-to-date amounts in {currency} ({currencySymbol(currency)}). Unfunded and
              total value are derived per quarter.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-muted">
              <span>Show key metrics</span>
              <Toggle
                checked={showMetrics}
                onChange={onToggleMetrics}
                ariaLabel="Show key metrics"
              />
            </label>
            <button
              type="button"
              onClick={addQuarter}
              className="flex items-center gap-1.5 rounded-md border border-border-default bg-white px-3 py-1.5 text-[13px] font-medium text-body hover:bg-slate-50"
            >
              <Plus className="size-3.5" strokeWidth={2.25} />
              Add quarter
            </button>
          </div>
        </div>

        {showMetrics && (
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Key metrics{latest ? ` · as of ${quarterLabel(latest.quarter)}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {TOP_METRICS.map((m) => (
                <div key={m.key} className="rounded-lg border border-border-default bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {METRIC_LABEL[m.key]}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-body">
                    {formatMultiple(latestM[m.key])}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted">{m.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
            <div className="max-w-sm px-6">
              <p className="text-[13px] font-semibold text-body">No actuals yet</p>
              <p className="mt-1 text-[12px] text-muted">
                Add the first reporting quarter to start tracking realized cash flows. It defaults
                to the quarter of the fund's effective date.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-24 pb-2 pr-3 text-left font-semibold">Quarter</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-1.5 pb-2 text-right font-semibold" title={c.hint}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-1.5 pb-2 text-right font-semibold" title="Distributed + NAV">
                    Total value
                  </th>
                  <th className="px-1.5 pb-2 text-right font-semibold" title="commitment − contributed + recallable">
                    Unfunded
                  </th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const m = multiplesOf(r)
                  const totalValue = r.cumulativeDistributions + r.nav
                  const unfunded = commitment - r.cumulativePaidIn + (r.recallableDistributions ?? 0)
                  return (
                    <tr key={`${r.quarter.year}-${r.quarter.q}`} className="align-top">
                      <td className="py-1.5 pr-3 text-left font-medium tabular-nums text-body">
                        {quarterLabel(r.quarter)}
                      </td>
                      {COLS.map((c) => (
                        <td key={c.key} className="px-1.5 py-1">
                          <NumberInput
                            value={r[c.key]}
                            onCommit={(v) => setAmount(r.quarter, c.key, v)}
                            ariaLabel={`${c.label} ${quarterLabel(r.quarter)}`}
                            placeholder={c.optional ? '—' : '0'}
                          />
                          {showMetrics && c.metric && (
                            <MetricLine label={METRIC_LABEL[c.metric]} value={m[c.metric]} />
                          )}
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5 text-right tabular-nums text-body">
                        {Math.round(totalValue).toLocaleString('en-US')}
                        {showMetrics && <MetricLine label={METRIC_LABEL.tvpi} value={m.tvpi} />}
                      </td>
                      <td
                        className={cn(
                          'px-1.5 py-1.5 text-right tabular-nums',
                          unfunded < 0 ? 'font-medium text-negative' : 'text-muted',
                        )}
                        title={unfunded < 0 ? 'Overcalled — contributed exceeds commitment' : undefined}
                      >
                        {Math.round(unfunded).toLocaleString('en-US')}
                      </td>
                      <td className="py-1.5 pl-1 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(r.quarter)}
                          aria-label={`Delete ${quarterLabel(r.quarter)}`}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-negative"
                        >
                          <Trash2 className="size-3.5" strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        itemLabel={pendingDelete ? quarterLabel(pendingDelete) : ''}
        confirmWord="Delete"
        onConfirm={() => {
          if (pendingDelete) removeRow(pendingDelete)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
