import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { formatMoneyCompact, formatPercent } from '@/lib/format'
import { formatMultiple } from '@/lib/metrics'
import { useFundRecalibratedForecast, useFundSetForecast } from '@/store/selectors/forecast'
import { buildSetVsUpdatedComparison, type SetVsUpdatedRow } from '@/lib/setVsUpdated'
import { SetVsUpdatedGrid } from './SetVsUpdatedGrid'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const primaryBtn =
  'rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90'
const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'

/** Neutral above/below-baseline tint for a drift delta. */
const toneClass = (n: number | null): string =>
  n === null ? 'text-slate-300' : n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-muted'

function DriftCard({
  label,
  updatedText,
  setText,
  delta,
  deltaText,
}: {
  label: string
  updatedText: string
  setText: string
  delta: number | null
  deltaText: string
}) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-body">{updatedText}</p>
      <p className="mt-0.5 text-[12px] text-muted">
        Active {setText} · <span className={cn('font-semibold', toneClass(delta))}>{deltaText}</span>
      </p>
    </div>
  )
}

interface Props {
  fundId: string
}

export function SetVsUpdatedComparison({ fundId }: Props) {
  const fund = useStore((s) => s.funds[fundId])
  const templates = useStore((s) => s.templates)
  const setFundForecast = useStore((s) => s.setFundForecast)
  const recalibrated = useFundRecalibratedForecast(fundId)
  const setFc = useFundSetForecast(fundId)

  const template = fund ? templates[fund.templateId] : undefined

  const [scenarioId, setScenarioId] = useState<string>(() => template?.baseScenarioId ?? '')
  const effectiveScenarioId =
    scenarioId && recalibrated?.scenarios.some((s) => s.scenarioId === scenarioId)
      ? scenarioId
      : (template?.baseScenarioId ?? recalibrated?.scenarios[0]?.scenarioId ?? '')

  const setScn =
    setFc?.scenarios.find((s) => s.scenarioId === effectiveScenarioId) ?? setFc?.scenarios[0] ?? null
  const recalScn =
    recalibrated?.scenarios.find((s) => s.scenarioId === effectiveScenarioId) ??
    recalibrated?.scenarios[0] ??
    null

  // Anchor amounts/quarters to the frozen active snapshot so both sides stay consistent
  // with the baseline (live commitment/date edits never reach the recalibrated forecast).
  const snapInput = fund?.setForecast?.input
  const data: SetVsUpdatedRow[] = useMemo(() => {
    if (!snapInput || !setScn || !recalScn) return []
    return buildSetVsUpdatedComparison({
      commitment: snapInput.commitment,
      effectiveDate: snapInput.effectiveDate,
      setRows: setScn.rows,
      updatedRows: recalScn.rows,
    })
  }, [snapInput, setScn, recalScn])

  if (!fund) return null

  // Empty state — no active forecast yet (e.g. a fund imported from a pre-feature doc).
  if (!setFc || !setScn) {
    return (
      <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
        <div className="max-w-sm px-6">
          <p className="text-sm font-semibold text-body">No active forecast yet</p>
          <p className="mt-1 text-[13px] text-muted">
            Set the current forecast as the active baseline, then track how the recalibrated
            forecast (active + actuals) drifts from it as actuals arrive.
          </p>
          <button
            type="button"
            className={cn(primaryBtn, 'mt-4')}
            onClick={() => setFundForecast(fundId)}
          >
            Set active forecast
          </button>
        </div>
      </div>
    )
  }

  // Display currency comes from the frozen active snapshot (consistent with both sides).
  const currency = snapInput?.currency ?? fund.currency

  // Terminal (last) cumulative amounts for the headline drift cards.
  const lastSet = [...data].reverse().find((r) => r.set)?.set ?? null
  const lastRecal = [...data].reverse().find((r) => r.updated)?.updated ?? null

  const setIrr = setScn?.netIrr ?? null
  const recalIrr = recalScn?.netIrr ?? null
  const irrDelta = setIrr !== null && recalIrr !== null ? recalIrr - setIrr : null
  const irrDeltaText =
    irrDelta === null
      ? 'n.a.'
      : `${irrDelta >= 0 ? '+' : '−'}${Math.abs(irrDelta * 100).toFixed(1)} pp`

  const setDist = lastSet?.distributed ?? null
  const recalDist = lastRecal?.distributed ?? null
  const distDelta = setDist !== null && recalDist !== null ? recalDist - setDist : null
  const distDeltaText =
    distDelta === null
      ? 'n.a.'
      : `${distDelta >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(distDelta), currency)}`

  const setTvpi = lastSet?.multiples.tvpi ?? null
  const recalTvpi = lastRecal?.multiples.tvpi ?? null
  const tvpiDelta = setTvpi !== null && recalTvpi !== null ? recalTvpi - setTvpi : null
  const tvpiDeltaText =
    tvpiDelta === null ? 'n.a.' : `${tvpiDelta >= 0 ? '+' : '−'}${Math.abs(tvpiDelta).toFixed(2)}×`

  const scenarioOptions = (template?.scenarioOrder ?? []).filter(
    (id) => recalibrated?.scenarios.some((s) => s.scenarioId === id) && template?.scenarios[id],
  )

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DriftCard
          label="Net IRR"
          updatedText={recalIrr === null ? 'n.a.' : formatPercent(recalIrr, 1)}
          setText={setIrr === null ? 'n.a.' : formatPercent(setIrr, 1)}
          delta={irrDelta}
          deltaText={irrDeltaText}
        />
        <DriftCard
          label="Lifetime distributions"
          updatedText={recalDist === null ? 'n.a.' : formatMoneyCompact(recalDist, currency)}
          setText={setDist === null ? 'n.a.' : formatMoneyCompact(setDist, currency)}
          delta={distDelta}
          deltaText={distDeltaText}
        />
        <DriftCard
          label="Terminal TVPI"
          updatedText={formatMultiple(recalTvpi)}
          setText={formatMultiple(setTvpi)}
          delta={tvpiDelta}
          deltaText={tvpiDeltaText}
        />
      </div>

      {scenarioOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-medium text-muted" htmlFor="svu-scenario">
            Scenario
          </label>
          <select
            id="svu-scenario"
            className={cn(fieldCls, 'min-w-[160px] pr-8')}
            value={effectiveScenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {scenarioOptions.map((id) => (
              <option key={id} value={id}>
                {template?.scenarios[id]?.name ?? id}
              </option>
            ))}
          </select>
        </div>
      )}

      <SetVsUpdatedGrid currency={currency} data={data} />
    </div>
  )
}
