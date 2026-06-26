// Pure derivation for the Portfolio "KID" (Key Information Document) tab. Reframes the
// engine's whole-portfolio cash flows from the view of ONE hypothetical investor
// committing a fixed `principal` to the fund-of-funds, and folds the §13 KID stage
// surfaces + §14.7 IRR ladder into: a total-cost / IRR-drag pair, a per-case table,
// and a gross→net IRR waterfall with a presentation-only pro-rata cost allocation.
//
// No engine / React / store-runtime imports — the component maps engine output onto the
// plain shapes below first (exactly as FundFeesOverview maps onto FeeRow). Mirrors
// lib/feeOverview.ts so it stays trivially unit-testable.
//
// Spec: .context/attachments/2j9n51/KID_PAGE.md. Adapted to THIS engine's IRR-stage
// counts — 3 (overlay off) or 6 (overlay on); see engine/kid.ts::portfolioIrrStages.

export interface KidStageInputRow {
  quarter: { year: number; q: number }
  paidIn: number
  distributions: number
}

export interface KidScenarioInput {
  scenarioId: string
  label: string
  isBase: boolean
  stage1: KidStageInputRow[] // gross
  stage3: KidStageInputRow[] // net of all fees (== stage2 when overlay off)
  irrStages: (number | null)[] // gross → net ladder (length 3 or 6)
}

/** One case (scenario) row of the per-case table. */
export interface KidRow {
  caseId: string
  caseLabel: string
  isBase: boolean
  /** Stage-3 TVPI × principal, or null when there's no activity (TVPI ≤ 0). */
  totalValueBack: number | null
  netIrr: number | null
}

/** One row of the gross→net IRR waterfall. `irrAfter` is a decimal (0.183 = 18.3%). */
export interface WaterfallRow {
  kind: 'start' | 'fee' | 'end'
  label: string
  irrAfter: number | null
  /** Local IRR drop across this stage (pp); fee rows only, null on anchors. */
  dragPp: number | null
  /** Gross IRR minus the IRR after this stage (pp); null on start, total drag on end. */
  accumulatedDragPp: number | null
  /** Pro-rata slice of the period's total cost (presentation device); null on start. */
  costAllocation: number | null
  annualCostAllocation: number | null
}

export interface KidView {
  totalCostsOverPeriod: number
  baseSumStage1: number
  baseSumStage3: number
  annualCostDragPp: number | null
  baseGrossIrr: number | null
  baseNetIrr: number | null
  /** True when no scenario was flagged base, so we fell back to the first scenario. */
  baseUsedFallback: boolean
  scaleFactor: number
  principal: number
  perCase: KidRow[]
  irrWaterfall: WaterfallRow[]
  years: number | null
}

// n stages → n−1 fee rows + 2 anchors → labels length n+1. The 3-stage list (overlay
// off) and 6-stage list (overlay on) follow the engine's grossCf / preCarryCf / netCf
// ladder plus, when present, the three overlay layers (mgmt → expenses+establishment →
// carry). The engine folds overlay expenses & establishment into one IRR stage and has
// no separate transaction-cost stage, so 6 is the live overlay shape.
const LABELS_3 = [
  'Gross IRR',
  'Underlying manager fees',
  'Underlying manager carry',
  'Net IRR to investor',
]
const LABELS_6 = [
  'Gross IRR',
  'Underlying manager fees',
  'Underlying manager carry',
  'Our management fee',
  'Our expenses & establishment',
  'Our carry',
  'Net IRR to investor',
]

function labelsForCount(n: number): string[] | null {
  if (n === 3) return LABELS_3
  if (n === 6) return LABELS_6
  return null
}

/** Negative drag (downstream IRR exceeds upstream — model noise) → null. Never a
 *  clamped-zero or negative cost. */
const suppress = (x: number): number | null => (x >= 0 ? x : null)

const sumNetCf = (rows: KidStageInputRow[]): number =>
  rows.reduce((a, r) => a + (r.distributions - r.paidIn), 0)

/** §5.1 — the gross→net IRR ladder as anchored waterfall rows. Empty (table hidden) on
 *  an unsupported stage count or a null gross IRR. Cost columns are filled later. */
export function computeIrrWaterfall(irrStages: (number | null)[]): WaterfallRow[] {
  const n = irrStages.length
  const labels = labelsForCount(n)
  if (!labels) return []
  const grossIrr = irrStages[0]
  if (grossIrr == null) return []

  const rows: WaterfallRow[] = []
  rows.push({
    kind: 'start',
    label: labels[0],
    irrAfter: grossIrr,
    dragPp: null,
    accumulatedDragPp: null,
    costAllocation: null,
    annualCostAllocation: null,
  })
  for (let i = 1; i < n; i++) {
    const prev = irrStages[i - 1]
    const curr = irrStages[i]
    const dragPp = prev != null && curr != null ? suppress((prev - curr) * 100) : null
    const accumulatedDragPp = curr != null ? suppress((grossIrr - curr) * 100) : null
    rows.push({
      kind: 'fee',
      label: labels[i],
      irrAfter: curr,
      dragPp,
      accumulatedDragPp,
      costAllocation: null,
      annualCostAllocation: null,
    })
  }
  const netIrr = irrStages[n - 1]
  const totalDrag = netIrr != null ? (grossIrr - netIrr) * 100 : null
  rows.push({
    kind: 'end',
    label: labels[n],
    irrAfter: netIrr,
    dragPp: null,
    accumulatedDragPp: totalDrag != null && totalDrag >= 0 ? totalDrag : null,
    costAllocation: null,
    annualCostAllocation: null,
  })
  return rows
}

/** §5.2 — distribute `totalCost` across fee rows pro-rata by `dragPp`. Σ feeRow.cost
 *  === totalCost (± float epsilon). The Cost column is a presentation device, not an
 *  accounting decomposition of fees actually paid. */
export function allocateWaterfallCosts(
  rows: WaterfallRow[],
  totalCost: number | null,
): WaterfallRow[] {
  if (totalCost == null || !Number.isFinite(totalCost) || totalCost <= 0) {
    return rows.map((r) => ({ ...r, costAllocation: null }))
  }
  let denomPp = 0
  for (const r of rows) {
    if (r.kind === 'fee' && r.dragPp != null && Number.isFinite(r.dragPp) && r.dragPp > 0) {
      denomPp += r.dragPp
    }
  }
  if (denomPp <= 1e-9) {
    // No usable drag to weight by — pin the whole cost to the end total.
    return rows.map((r) => ({ ...r, costAllocation: r.kind === 'end' ? totalCost : null }))
  }
  return rows.map((r) => {
    if (r.kind === 'start') return { ...r, costAllocation: null }
    if (r.kind === 'end') return { ...r, costAllocation: totalCost }
    const valid = r.dragPp != null && Number.isFinite(r.dragPp) && r.dragPp > 0
    return { ...r, costAllocation: valid ? (totalCost * (r.dragPp as number)) / denomPp : null }
  })
}

/** §5.3 — annualize each row's cost over `years`, mirroring cost's null-handling so the
 *  "Annual cost" cell renders `—` exactly where "Cost" does. */
export function allocateAnnualCosts(rows: WaterfallRow[], years: number | null): WaterfallRow[] {
  const bad = years == null || !Number.isFinite(years) || years <= 0
  return rows.map((r) => ({
    ...r,
    annualCostAllocation:
      bad || r.costAllocation == null || !Number.isFinite(r.costAllocation)
        ? null
        : r.costAllocation / (years as number),
  }))
}

/** Assemble the full KID view model. Returns null when there's nothing to disclose. */
export function buildKidView(input: {
  scenarios: KidScenarioInput[]
  /** Scenario ids in display order (the per-case table walks these). */
  caseOrder: string[]
  /** The derived portfolio base scenario id (plurality of fund base cases). */
  baseScenarioId: string | null
  baseUsedFallback: boolean
  /** Portfolio union quarter count → years denominator. */
  quartersLength: number
  /** Σ allocated commitments in the reporting currency. */
  totalCommitment: number
  /** Hypothetical investor commitment (default 10,000). */
  principal: number
}): KidView | null {
  const {
    scenarios,
    caseOrder,
    baseScenarioId,
    baseUsedFallback,
    quartersLength,
    totalCommitment,
    principal,
  } = input
  if (scenarios.length === 0 || totalCommitment <= 0) return null

  const scaleFactor = principal / totalCommitment
  const byId = new Map(scenarios.map((s) => [s.scenarioId, s]))
  const base = (baseScenarioId != null ? byId.get(baseScenarioId) : undefined) ?? scenarios[0]

  // KPI 1 — total cost over the period (all fee leakage, gross → final-net), scaled to
  // the hypothetical investor. A raw cash-flow difference, NOT PRIIPs-discounted.
  const baseSumStage1 = sumNetCf(base.stage1) * scaleFactor
  const baseSumStage3 = sumNetCf(base.stage3) * scaleFactor
  const totalCostsOverPeriod = baseSumStage1 - baseSumStage3

  // KPI 2 — annual IRR drag (PRIIPs "RIY" shape). Suppress null/negative.
  const baseGrossIrr = base.irrStages[0] ?? null
  const baseNetIrr = base.irrStages[base.irrStages.length - 1] ?? null
  let annualCostDragPp: number | null = null
  if (baseGrossIrr != null && baseNetIrr != null) {
    const drag = (baseGrossIrr - baseNetIrr) * 100
    annualCostDragPp = drag >= 0 ? drag : null
  }

  // Years — quarter span / 4 (union domain; may overstate for mixed vintages).
  const yearsRaw = quartersLength / 4
  const years = Number.isFinite(yearsRaw) && yearsRaw > 0 ? yearsRaw : null

  // Per-case rows: overlay-aware LP TVPI from Stage 3 (what the LP actually gets back).
  const perCase: KidRow[] = caseOrder
    .map((id) => byId.get(id))
    .filter((s): s is KidScenarioInput => s != null)
    .map((s) => {
      const cumP = s.stage3.reduce((a, r) => a + r.paidIn, 0)
      const cumD = s.stage3.reduce((a, r) => a + r.distributions, 0)
      const tvpi = cumP > 0 ? cumD / cumP : 0
      return {
        caseId: s.scenarioId,
        caseLabel: s.label,
        isBase: s.isBase,
        totalValueBack: tvpi > 0 ? tvpi * principal : null,
        netIrr: s.irrStages[s.irrStages.length - 1] ?? null,
      }
    })

  const irrWaterfall = allocateAnnualCosts(
    allocateWaterfallCosts(
      computeIrrWaterfall(base.irrStages),
      totalCostsOverPeriod > 0 ? totalCostsOverPeriod : null,
    ),
    years,
  )

  return {
    totalCostsOverPeriod,
    baseSumStage1,
    baseSumStage3,
    annualCostDragPp,
    baseGrossIrr,
    baseNetIrr,
    baseUsedFallback,
    scaleFactor,
    principal,
    perCase,
    irrWaterfall,
    years,
  }
}
