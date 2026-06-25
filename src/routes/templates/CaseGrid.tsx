import { useState } from 'react'
import type { CurveKind, Scenario, SparsePoint, Template } from '@/store/types'
import { applyDpiVsBase, applyGenerateBase, applyScenarioPoint } from '@/lib/curves'
import { NumberInput } from '@/components/common/NumberInput'
import { validateScenario } from './validate'

const CURVES: { kind: CurveKind; label: string }[] = [
  { kind: 'pic', label: 'PIC' },
  { kind: 'dpi', label: 'DPI' },
  { kind: 'tvpi', label: 'TVPI' },
]

const valueAt = (scn: Scenario, kind: CurveKind, year: number): number | undefined =>
  scn[kind].find((p) => p.periodIndex === year)?.value

const terminalValue = (points: SparsePoint[]): number | undefined => {
  let best: SparsePoint | undefined
  for (const p of points) if (!best || p.periodIndex > best.periodIndex) best = p
  return best?.value
}

export function CaseGrid({
  scenario,
  fundLifeYears,
  update,
}: {
  scenario: Scenario
  fundLifeYears: number
  update: (recipe: (d: Template) => void) => void
}) {
  // Sticky generator targets (seeded from the base's current terminal values).
  const [dpiTarget, setDpiTarget] = useState(() => terminalValue(scenario.dpi) ?? 2)
  const [tvpiTarget, setTvpiTarget] = useState(() => terminalValue(scenario.tvpi) ?? 2)

  const years = Array.from({ length: fundLifeYears }, (_, i) => i + 1)
  const warnings = validateScenario(scenario, fundLifeYears)

  return (
    <div>
      {scenario.isBase && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border-default bg-slate-50 px-3 py-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">Ultimate DPI</span>
            <NumberInput
              value={dpiTarget}
              onCommit={setDpiTarget}
              ariaLabel="Ultimate DPI target"
              decimals={2}
              className="h-7 w-20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">Ultimate TVPI</span>
            <NumberInput
              value={tvpiTarget}
              onCommit={setTvpiTarget}
              ariaLabel="Ultimate TVPI target"
              decimals={2}
              className="h-7 w-20"
            />
          </label>
          <button
            type="button"
            onClick={() => update((d) => applyGenerateBase(d, dpiTarget, tvpiTarget))}
            className="rounded-md bg-brand-navy px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
            title="Build a normal J-curve to these ultimate values and re-derive the other cases"
          >
            Generate curve
          </button>
          <span className="ml-auto max-w-[230px] text-right text-[11px] leading-snug text-muted">
            Builds a smooth J-curve across {fundLifeYears}{' '}
            {fundLifeYears === 1 ? 'year' : 'years'} and re-derives the other cases.
          </span>
        </div>
      )}

      {!scenario.isBase && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border-default bg-slate-50 px-3 py-2.5">
          <span className="text-[12px] font-semibold text-body">Ultimate DPI vs base</span>
          <div className="flex items-center gap-1">
            <NumberInput
              value={Math.round(scenario.dpiVsBase * 1000) / 10}
              onCommit={(pct) => update((d) => applyDpiVsBase(d, scenario.id, pct / 100))}
              ariaLabel="Ultimate DPI relative to base, percent"
              align="right"
              className="h-7 w-16"
            />
            <span className="text-[13px] text-muted">%</span>
          </div>
          <button
            type="button"
            onClick={() => update((d) => applyDpiVsBase(d, scenario.id, scenario.dpiVsBase))}
            className="ml-auto rounded-md border border-border-default bg-white px-2.5 py-1 text-[12px] font-medium text-body hover:bg-slate-50"
            title="Overwrite DPI & TVPI with base × this percent"
          >
            Re-apply from base
          </button>
        </div>
      )}

      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="w-16 pb-2 pr-3 text-left font-semibold">Year</th>
            {CURVES.map((c) => (
              <th key={c.kind} className="px-1.5 pb-2 text-right font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td className="py-1 pr-3 text-right tabular-nums text-muted">{y}</td>
              {CURVES.map((c) => (
                <td key={c.kind} className="px-1.5 py-1">
                  <NumberInput
                    value={valueAt(scenario, c.kind, y)}
                    onCommit={(v) => update((d) => applyScenarioPoint(d, scenario.id, c.kind, y, v))}
                    ariaLabel={`${c.label} year ${y}`}
                    placeholder="—"
                    decimals={2}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {warnings.map((w) => (
            <li key={w} className="text-[12px] text-amber-600">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
