import { describe, expect, it } from 'vitest'
import {
  allocateAnnualCosts,
  allocateWaterfallCosts,
  buildKidView,
  computeIrrWaterfall,
  type KidScenarioInput,
  type KidStageInputRow,
} from '../kidBridge'

// The KID view reframes the engine's per-scenario §13 stage cash flows + §14.7 IRR
// ladder into a total-cost / IRR-drag pair, a per-case table, and a gross→net IRR
// waterfall with a pro-rata cost allocation. These cover the three pure waterfall
// functions, their suppression/edge rules, and buildKidView's KPIs + invariants.

/** Two-year stage: draws in 2024, distributions in 2025. `fee` shaves a flat fraction
 *  off both sides to stand in for a fee layer (net < gross). */
function makeStage(fee: number): KidStageInputRow[] {
  const rows: KidStageInputRow[] = []
  for (let q = 1; q <= 4; q++) {
    rows.push({ quarter: { year: 2024, q }, paidIn: 1_000_000 * (1 + fee), distributions: 0 })
  }
  for (let q = 1; q <= 4; q++) {
    rows.push({ quarter: { year: 2025, q }, paidIn: 0, distributions: 2_000_000 * (1 - fee) })
  }
  return rows
}

describe('computeIrrWaterfall', () => {
  it('builds a 3-stage (overlay-off) ladder: start + 2 fee rows + end', () => {
    const rows = computeIrrWaterfall([0.2, 0.16, 0.13])
    expect(rows.map((r) => r.label)).toEqual([
      'Gross IRR',
      'Underlying manager fees',
      'Underlying manager carry',
      'Net IRR to investor',
    ])
    expect(rows.map((r) => r.kind)).toEqual(['start', 'fee', 'fee', 'end'])
    // local drags: 0.20→0.16 = 4pp ; 0.16→0.13 = 3pp
    expect(rows[1].dragPp).toBeCloseTo(4, 6)
    expect(rows[2].dragPp).toBeCloseTo(3, 6)
    // accumulated on the last fee row and the end anchor == total drag (7pp).
    expect(rows[2].accumulatedDragPp).toBeCloseTo(7, 6)
    expect(rows[3].accumulatedDragPp).toBeCloseTo(7, 6)
    expect(rows[0].accumulatedDragPp).toBeNull()
  })

  it('builds a 6-stage (overlay-on) ladder: 5 fee rows + 2 anchors', () => {
    const rows = computeIrrWaterfall([0.2, 0.18, 0.16, 0.15, 0.14, 0.12])
    expect(rows).toHaveLength(7)
    expect(rows[0].label).toBe('Gross IRR')
    expect(rows[6].label).toBe('Net IRR to investor')
    expect(rows[6].accumulatedDragPp).toBeCloseTo(8, 6)
  })

  it('suppresses negative drag to null (downstream IRR exceeds upstream)', () => {
    const rows = computeIrrWaterfall([0.2, 0.22, 0.13]) // stage 1→2 goes UP
    expect(rows[1].dragPp).toBeNull() // negative → null
    expect(rows[1].accumulatedDragPp).toBeNull() // gross 0.20 − 0.22 < 0 → null
    expect(rows[2].dragPp).toBeCloseTo(9, 6) // 0.22 → 0.13 = 9pp
  })

  it('returns [] on unsupported stage count or null gross IRR', () => {
    expect(computeIrrWaterfall([0.2, 0.1])).toEqual([]) // count 2 unsupported
    expect(computeIrrWaterfall([0.2, 0.1, 0.05, 0.0])).toEqual([]) // count 4 unsupported
    expect(computeIrrWaterfall([null, 0.1, 0.05])).toEqual([]) // null gross
  })
})

describe('allocateWaterfallCosts', () => {
  it('distributes totalCost pro-rata by drag; fee rows sum to totalCost', () => {
    const rows = allocateWaterfallCosts(computeIrrWaterfall([0.2, 0.16, 0.13]), 7000)
    const feeSum = rows.filter((r) => r.kind === 'fee').reduce((a, r) => a + (r.costAllocation ?? 0), 0)
    expect(feeSum).toBeCloseTo(7000, 6) // 4pp + 3pp = 7pp denom → 4000 + 3000
    expect(rows.find((r) => r.kind === 'fee')!.costAllocation).toBeCloseTo(4000, 6)
    expect(rows.find((r) => r.kind === 'start')!.costAllocation).toBeNull()
    expect(rows.find((r) => r.kind === 'end')!.costAllocation).toBeCloseTo(7000, 6)
  })

  it('nulls every row when totalCost is null / non-positive', () => {
    const base = computeIrrWaterfall([0.2, 0.16, 0.13])
    for (const tc of [null, 0, -5]) {
      const rows = allocateWaterfallCosts(base, tc)
      expect(rows.every((r) => r.costAllocation === null)).toBe(true)
    }
  })

  it('pins the whole cost to the end row when there is no usable drag', () => {
    // All drags suppressed (monotonically increasing IRR) → denom 0.
    const rows = allocateWaterfallCosts(computeIrrWaterfall([0.1, 0.12, 0.14]), 5000)
    expect(rows.filter((r) => r.kind === 'fee').every((r) => r.costAllocation === null)).toBe(true)
    expect(rows.find((r) => r.kind === 'end')!.costAllocation).toBeCloseTo(5000, 6)
  })
})

describe('allocateAnnualCosts', () => {
  it('divides each cost by years, mirroring null-handling', () => {
    const costed = allocateWaterfallCosts(computeIrrWaterfall([0.2, 0.16, 0.13]), 7000)
    const annual = allocateAnnualCosts(costed, 10)
    const fee = annual.find((r) => r.kind === 'fee')!
    expect(fee.annualCostAllocation).toBeCloseTo((fee.costAllocation as number) / 10, 6)
    expect(annual.find((r) => r.kind === 'start')!.annualCostAllocation).toBeNull()
  })

  it('nulls annual cost when years is null / non-positive', () => {
    const costed = allocateWaterfallCosts(computeIrrWaterfall([0.2, 0.16, 0.13]), 7000)
    for (const y of [null, 0, -2]) {
      expect(allocateAnnualCosts(costed, y).every((r) => r.annualCostAllocation === null)).toBe(true)
    }
  })
})

describe('buildKidView', () => {
  const principal = 10_000
  const totalCommitment = 30_000_000

  function makeScenarios(): KidScenarioInput[] {
    const gross = makeStage(0)
    const net = makeStage(0.1)
    return [
      { scenarioId: 'low', label: 'Low', isBase: false, stage1: gross, stage3: net, irrStages: [0.15, 0.12, 0.1] },
      { scenarioId: 'base', label: 'Base', isBase: true, stage1: gross, stage3: net, irrStages: [0.2, 0.16, 0.13] },
    ]
  }

  it('guards: null when no scenarios or non-positive commitment', () => {
    expect(buildKidView({ scenarios: [], caseOrder: [], baseScenarioId: null, baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })).toBeNull()
    expect(buildKidView({ scenarios: makeScenarios(), caseOrder: ['base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment: 0, principal })).toBeNull()
  })

  it('computes total cost from base stage1 − stage3, scaled to the investor', () => {
    const v = buildKidView({ scenarios: makeScenarios(), caseOrder: ['low', 'base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })!
    const scale = principal / totalCommitment
    // gross net cf: −4,000,000 + 8,000,000 = 4,000,000 ; net (fee 0.1): −4,400,000 + 7,200,000 = 2,800,000
    expect(v.scaleFactor).toBeCloseTo(scale, 12)
    expect(v.baseSumStage1).toBeCloseTo(4_000_000 * scale, 6)
    expect(v.baseSumStage3).toBeCloseTo(2_800_000 * scale, 6)
    expect(v.totalCostsOverPeriod).toBeCloseTo(1_200_000 * scale, 6)
  })

  it('computes annual IRR drag from the base ladder and suppresses negatives', () => {
    const v = buildKidView({ scenarios: makeScenarios(), caseOrder: ['base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })!
    expect(v.annualCostDragPp).toBeCloseTo(7, 6) // (0.20 − 0.13) × 100

    const noisy = makeScenarios().map((s) => ({ ...s, irrStages: [0.1, 0.12, 0.13] }))
    const v2 = buildKidView({ scenarios: noisy, caseOrder: ['base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })!
    expect(v2.annualCostDragPp).toBeNull() // net > gross → suppressed
  })

  it('per-case table: Stage-3 TVPI × principal, base flagged, ordered by caseOrder', () => {
    const v = buildKidView({ scenarios: makeScenarios(), caseOrder: ['low', 'base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })!
    expect(v.perCase.map((r) => r.caseLabel)).toEqual(['Low', 'Base'])
    expect(v.perCase.find((r) => r.caseId === 'base')!.isBase).toBe(true)
    // stage3 TVPI = Σd / Σp = 7,200,000 / 4,400,000 ; valueBack = tvpi × principal
    const tvpi = 7_200_000 / 4_400_000
    expect(v.perCase[1].totalValueBack).toBeCloseTo(tvpi * principal, 6)
    expect(v.perCase[1].netIrr).toBe(0.13)
  })

  it('self-anchors: end accumulatedDragPp == annualCostDragPp, fee costs sum to total', () => {
    const v = buildKidView({ scenarios: makeScenarios(), caseOrder: ['base'], baseScenarioId: 'base', baseUsedFallback: false, quartersLength: 8, totalCommitment, principal })!
    const end = v.irrWaterfall.find((r) => r.kind === 'end')!
    expect(end.accumulatedDragPp).toBeCloseTo(v.annualCostDragPp as number, 6)
    const feeSum = v.irrWaterfall.filter((r) => r.kind === 'fee').reduce((a, r) => a + (r.costAllocation ?? 0), 0)
    expect(feeSum).toBeCloseTo(v.totalCostsOverPeriod, 4)
  })

  it('falls back to the first scenario and flags it when no base id resolves', () => {
    const v = buildKidView({ scenarios: makeScenarios(), caseOrder: ['low', 'base'], baseScenarioId: null, baseUsedFallback: true, quartersLength: 8, totalCommitment, principal })!
    expect(v.baseUsedFallback).toBe(true)
    // base = scenarios[0] = 'low' → its net IRR 0.10 drives the drag (0.15 − 0.10 = 5pp)
    expect(v.annualCostDragPp).toBeCloseTo(5, 6)
  })
})
