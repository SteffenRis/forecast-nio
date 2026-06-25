// Pure template-curve math + Template transforms. These mutate a plain Template
// (or an immer draft of one) in place, so the same functions drive both the live
// store actions and the editor's local draft. No store/React imports here.

import { newId } from '@/lib/id'
import type { AssetClass, CurveKind, Scenario, SparsePoint, Template } from '@/store/types'

export const DEFAULT_FUND_LIFE = 10
export const DEFAULT_ASSET_CLASS: AssetClass = 'large_cap_buyout'
export const MIN_FUND_LIFE = 1
export const MAX_FUND_LIFE = 15

/** The four fixed cases, in display order. Non-base defaults follow the brief. */
export const CASE_DEFS: { name: string; isBase: boolean; dpiVsBase: number }[] = [
  { name: 'Low-low', isBase: false, dpiVsBase: 0.6 },
  { name: 'Low', isBase: false, dpiVsBase: 0.8 },
  { name: 'Base', isBase: true, dpiVsBase: 1.0 },
  { name: 'High', isBase: false, dpiVsBase: 1.2 },
]

export const round4 = (n: number) => Math.round(n * 1e4) / 1e4

export const clampFundLife = (years: number) =>
  Math.max(MIN_FUND_LIFE, Math.min(MAX_FUND_LIFE, Math.round(years)))

const pts = (values: number[]): SparsePoint[] =>
  values.map((value, i) => ({ periodIndex: i + 1, value: round4(value) }))

const scaleCurve = (points: SparsePoint[], factor: number): SparsePoint[] =>
  points.map((p) => ({ periodIndex: p.periodIndex, value: round4(p.value * factor) }))

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** Build a "normal" PE J-curve set across `years`, hitting the given ultimate
 *  (terminal) DPI and TVPI: PIC ramps to 1.0 over the first ~half of life; DPI is
 *  ~0 until ~30% in, then a smooth S-curve to ultimateDpi; TVPI eases from a slight
 *  early dip up to ultimateTvpi, always ≥ DPI. */
export function shapedCurves(
  years: number,
  ultimateDpi: number,
  ultimateTvpi: number,
): { pic: number[]; dpi: number[]; tvpi: number[] } {
  const n = Math.max(MIN_FUND_LIFE, Math.round(years))
  const du = Math.max(0, ultimateDpi)
  const tu = Math.max(du, ultimateTvpi) // enforce TVPI ≥ DPI
  const ipEnd = Math.max(1, Math.round(n * 0.5)) // capital fully called by mid-life
  const ds = n <= 1 ? 0 : Math.min(Math.max(1, Math.ceil(n * 0.3)), n - 1) // distributions begin
  const t0 = tu <= 1 ? tu * 0.7 : 0.95 // early TVPI (slight J-curve)
  const pic: number[] = []
  const dpi: number[] = []
  const tvpi: number[] = []
  for (let y = 1; y <= n; y++) {
    pic.push(Math.min(1, y / ipEnd))
    const d = du * smoothstep((y - ds) / (n - ds))
    dpi.push(d)
    const t = t0 + (tu - t0) * smoothstep(n > 1 ? (y - 1) / (n - 1) : 1)
    tvpi.push(Math.max(t, d))
  }
  return { pic, dpi, tvpi }
}

/** A gentle, editable default base curve set for an N-year fund life. */
function defaultBaseCurves(years: number) {
  return shapedCurves(years, 2.0, 2.0)
}

/** Build the four cases for a template of the given fund life. */
export function buildFourCases(years: number): {
  scenarios: Record<string, Scenario>
  scenarioOrder: string[]
  baseScenarioId: string
} {
  const baseCurves = defaultBaseCurves(years)
  const basePts = {
    pic: pts(baseCurves.pic),
    dpi: pts(baseCurves.dpi),
    tvpi: pts(baseCurves.tvpi),
  }
  const scenarios: Record<string, Scenario> = {}
  const scenarioOrder: string[] = []
  let baseScenarioId = ''
  for (const def of CASE_DEFS) {
    const scn: Scenario = {
      id: newId('scn'),
      name: def.name,
      isBase: def.isBase,
      dpiVsBase: def.dpiVsBase,
      pic: basePts.pic.map((p) => ({ ...p })),
      dpi: def.isBase ? basePts.dpi.map((p) => ({ ...p })) : scaleCurve(basePts.dpi, def.dpiVsBase),
      tvpi: def.isBase
        ? basePts.tvpi.map((p) => ({ ...p }))
        : scaleCurve(basePts.tvpi, def.dpiVsBase),
    }
    scenarios[scn.id] = scn
    scenarioOrder.push(scn.id)
    if (def.isBase) baseScenarioId = scn.id
  }
  return { scenarios, scenarioOrder, baseScenarioId }
}

/** A fresh default template (four cases, default life/asset class). */
export function makeTemplate(name: string): Template {
  const { scenarios, scenarioOrder, baseScenarioId } = buildFourCases(DEFAULT_FUND_LIFE)
  return {
    id: newId('tpl'),
    name,
    description: '',
    assetClass: DEFAULT_ASSET_CLASS,
    fundLifeYears: DEFAULT_FUND_LIFE,
    granularity: 'annual',
    scenarios,
    scenarioOrder,
    baseScenarioId,
  }
}

// ---- in-place Template transforms (work on a plain object or immer draft) ----

/** Set fund life (clamped) and drop curve points beyond the new horizon. */
export function applyFundLife(t: Template, years: number): void {
  const n = clampFundLife(years)
  t.fundLifeYears = n
  for (const sid of t.scenarioOrder) {
    const scn = t.scenarios[sid]
    scn.pic = scn.pic.filter((p) => p.periodIndex <= n)
    scn.dpi = scn.dpi.filter((p) => p.periodIndex <= n)
    scn.tvpi = scn.tvpi.filter((p) => p.periodIndex <= n)
  }
}

/** Upsert one cell on one curve of one case, keeping points sorted. */
export function applyScenarioPoint(
  t: Template,
  scenarioId: string,
  kind: CurveKind,
  periodIndex: number,
  value: number,
): void {
  const scn = t.scenarios[scenarioId]
  if (!scn) return
  const v = round4(value)
  const arr = scn[kind]
  const existing = arr.find((p) => p.periodIndex === periodIndex)
  if (existing) {
    existing.value = v
  } else {
    arr.push({ periodIndex, value: v })
    arr.sort((a, b) => a.periodIndex - b.periodIndex)
  }
}

/** Non-base modifier: store the factor and re-seed dpi/tvpi = base × factor. */
export function applyDpiVsBase(t: Template, scenarioId: string, factor: number): void {
  const scn = t.scenarios[scenarioId]
  const base = t.scenarios[t.baseScenarioId]
  if (!scn || !base || scn.isBase) return
  scn.dpiVsBase = round4(factor)
  scn.dpi = scaleCurve(base.dpi, factor)
  scn.tvpi = scaleCurve(base.tvpi, factor)
}

/** Generate a J-curve base from ultimate DPI/TVPI, then re-derive the non-base cases. */
export function applyGenerateBase(t: Template, ultimateDpi: number, ultimateTvpi: number): void {
  const base = t.scenarios[t.baseScenarioId]
  if (!base) return
  const c = shapedCurves(t.fundLifeYears, ultimateDpi, ultimateTvpi)
  base.pic = pts(c.pic)
  base.dpi = pts(c.dpi)
  base.tvpi = pts(c.tvpi)
  for (const sid of t.scenarioOrder) {
    const scn = t.scenarios[sid]
    if (scn.isBase) continue
    scn.pic = base.pic.map((p) => ({ ...p }))
    scn.dpi = scaleCurve(base.dpi, scn.dpiVsBase)
    scn.tvpi = scaleCurve(base.tvpi, scn.dpiVsBase)
  }
}
