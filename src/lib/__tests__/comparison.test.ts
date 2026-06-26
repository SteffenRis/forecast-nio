import { describe, expect, it } from 'vitest'
import {
  buildFundComparison,
  buildPortfolioComparison,
  quarterDeviation,
  type ForecastRow,
} from '../comparison'
import { fundMultiples } from '../metrics'
import { quarterOrdinal } from '../quarter'
import type { ActualRow, QuarterAmounts, QuarterComparison } from '../comparison'

// The Performance screen reshapes the baseline forecast (periodic flows) + actuals
// (cumulative) into per-quarter Plan / Actual / Deviation lines. These cover the
// cumulation, multiples, quarter alignment and the Actual − Plan deviation.

const commitment = 30_000_000

// Periodic (per-quarter) flows — the engine's row shape. Prefix-summed below.
const forecastRows: ForecastRow[] = [
  { quarter: { year: 2024, q: 1 }, pNet: 6_000_000, dNet: 0, nav: 5_800_000 },
  { quarter: { year: 2024, q: 2 }, pNet: 3_000_000, dNet: 500_000, nav: 9_000_000 },
  { quarter: { year: 2024, q: 3 }, pNet: 0, dNet: 1_000_000, nav: 9_500_000 },
]

describe('buildFundComparison — prefix-sums periodic forecast flows to cumulative', () => {
  it('cumulates contributed/distributed across rows; nav is the row stock', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals: [], forecastRows })
    expect(data).toHaveLength(3)

    expect(data[0].forecast).toMatchObject({ contributed: 6_000_000, distributed: 0, nav: 5_800_000 })
    expect(data[1].forecast).toMatchObject({ contributed: 9_000_000, distributed: 500_000, nav: 9_000_000 })
    expect(data[2].forecast).toMatchObject({ contributed: 9_000_000, distributed: 1_500_000, nav: 9_500_000 })
  })

  it('computes plan multiples from the cumulative amounts', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals: [], forecastRows })
    const expected = fundMultiples({
      commitment,
      paidIn: 9_000_000,
      distributed: 1_500_000,
      nav: 9_500_000,
    })
    expect(data[2].forecast?.multiples).toEqual(expected)
  })

  it('never models recallable on the plan side', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals: [], forecastRows })
    expect(data.every((d) => d.forecast?.recallable === null)).toBe(true)
  })

  it('leaves actual null where no actual exists (full forecast horizon)', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals: [], forecastRows })
    expect(data.every((d) => d.actual === null)).toBe(true)
  })
})

describe('buildFundComparison — aligns actuals to forecast quarters', () => {
  const actuals: ActualRow[] = [
    {
      quarter: { year: 2024, q: 2 },
      cumulativePaidIn: 10_000_000,
      cumulativeDistributions: 400_000,
      nav: 9_300_000,
      recallableDistributions: 250_000,
    },
  ]

  it('attaches the actual to its matching quarter and keeps others actual-less', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals, forecastRows })
    expect(data).toHaveLength(3)
    expect(data[0].actual).toBeNull()
    expect(data[2].actual).toBeNull()
    expect(data[1].actual).toMatchObject({
      contributed: 10_000_000,
      distributed: 400_000,
      nav: 9_300_000,
      recallable: 250_000,
    })
  })

  it('includes an actual-only quarter outside the forecast horizon', () => {
    const future: ActualRow[] = [
      { quarter: { year: 2030, q: 1 }, cumulativePaidIn: 1, cumulativeDistributions: 0, nav: 0 },
    ]
    const data = buildFundComparison({
      commitment,
      effectiveDate: '2024-01-15',
      actuals: future,
      forecastRows,
    })
    expect(data).toHaveLength(4)
    expect(data.at(-1)?.quarter).toEqual({ year: 2030, q: 1 })
    expect(data.at(-1)?.forecast).toBeNull()
  })
})

describe('buildFundComparison — re-anchors the plan to the effective-date quarter', () => {
  // The engine dates the first forecast row one block-end quarter after a mid-quarter
  // effective date (e.g. effective 2024-02-15 → first row Q2 2024), while actuals are
  // entered at the effective-date quarter (Q1 2024). Re-anchoring lines them up.
  const offsetRows: ForecastRow[] = [
    { quarter: { year: 2024, q: 2 }, pNet: 1_500_000, dNet: 0, nav: 337_500 },
    { quarter: { year: 2024, q: 3 }, pNet: 1_500_000, dNet: 0, nav: 1_012_500 },
  ]
  const actuals: ActualRow[] = [
    { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 1_000_000, cumulativeDistributions: 0, nav: 900_000 },
  ]

  it('pairs the first actual with the first plan point in the same quarter group', () => {
    const data = buildFundComparison({
      commitment,
      effectiveDate: '2024-02-15',
      actuals,
      forecastRows: offsetRows,
    })

    // Q1 2024 now holds both the actual and the (re-anchored) first plan point.
    expect(data[0].quarter).toEqual({ year: 2024, q: 1 })
    expect(data[0].actual?.contributed).toBe(1_000_000)
    expect(data[0].forecast?.contributed).toBe(1_500_000)

    // The second plan point shifts back to Q2 2024 (plan-only, no actual).
    expect(data[1].quarter).toEqual({ year: 2024, q: 2 })
    expect(data[1].forecast?.contributed).toBe(3_000_000)
    expect(data[1].actual).toBeNull()

    const dev = quarterDeviation(data[0].actual, data[0].forecast)
    expect(dev.contributed).toBe(1_000_000 - 1_500_000) // −500,000 (behind plan)
  })
})

describe('quarterDeviation — Actual − Plan per field', () => {
  it('subtracts amounts and multiples; recallable always null', () => {
    const data = buildFundComparison({
      commitment,
      effectiveDate: '2024-01-15',
      actuals: [
        {
          quarter: { year: 2024, q: 2 },
          cumulativePaidIn: 10_000_000,
          cumulativeDistributions: 400_000,
          nav: 9_300_000,
          recallableDistributions: 250_000,
        },
      ],
      forecastRows,
    })
    const q2 = data[1]
    const dev = quarterDeviation(q2.actual, q2.forecast)

    expect(dev.contributed).toBe(10_000_000 - 9_000_000) // +1,000,000
    expect(dev.distributed).toBe(400_000 - 500_000) // −100,000
    expect(dev.nav).toBe(9_300_000 - 9_000_000) // +300,000
    expect(dev.recallable).toBeNull()
    expect(dev.pic).toBeCloseTo(q2.actual!.multiples.pic! - q2.forecast!.multiples.pic!, 10)
  })

  it('returns null deltas when a side is missing', () => {
    const data = buildFundComparison({ commitment, effectiveDate: '2024-01-15', actuals: [], forecastRows })
    const dev = quarterDeviation(data[0].actual, data[0].forecast)
    expect(dev.contributed).toBeNull()
    expect(dev.nav).toBeNull()
    expect(dev.tvpi).toBeNull()
  })

  it('multiple deltas are null when paid-in is 0 (n.a. on either side)', () => {
    const rows: ForecastRow[] = [{ quarter: { year: 2024, q: 1 }, pNet: 0, dNet: 0, nav: 0 }]
    const actuals: ActualRow[] = [
      { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 0, cumulativeDistributions: 0, nav: 0 },
    ]
    const data = buildFundComparison({
      commitment,
      effectiveDate: '2024-01-15',
      actuals,
      forecastRows: rows,
    })
    const dev = quarterDeviation(data[0].actual, data[0].forecast)
    expect(dev.dpi).toBeNull()
    expect(dev.rvpi).toBeNull()
    expect(dev.tvpi).toBeNull()
    // PIC is defined (0/commitment) on both sides → delta is 0, not null.
    expect(dev.pic).toBe(0)
  })
})

describe('buildPortfolioComparison — aggregates underlying funds pro-rata', () => {
  // multiples on the input sides are ignored by the aggregator (recomputed vs the
  // portfolio's total commitment), so any value works here.
  const amt = (
    contributed: number,
    distributed: number,
    nav: number,
    recallable: number | null = null,
  ): QuarterAmounts => ({
    contributed,
    distributed,
    recallable,
    nav,
    multiples: fundMultiples({ commitment: 1, paidIn: contributed, distributed, nav }),
  })
  const cmp = (
    year: number,
    q: 1 | 2 | 3 | 4,
    forecast: QuarterAmounts | null,
    actual: QuarterAmounts | null = null,
  ): QuarterComparison => ({ quarter: { year, q }, forecast, actual })

  it('sums two funds’ plan cumulatives and recomputes multiples vs total commitment', () => {
    const fundA = [cmp(2024, 1, amt(6_000_000, 0, 5_800_000))]
    const fundB = [cmp(2024, 1, amt(4_000_000, 0, 3_900_000))]
    const data = buildPortfolioComparison({
      totalCommitment: 30_000_000,
      funds: [
        { comparison: fundA, factor: 1 },
        { comparison: fundB, factor: 1 },
      ],
    })
    expect(data).toHaveLength(1)
    expect(data[0].forecast).toMatchObject({ contributed: 10_000_000, distributed: 0, nav: 9_700_000 })
    expect(data[0].forecast?.multiples).toEqual(
      fundMultiples({ commitment: 30_000_000, paidIn: 10_000_000, distributed: 0, nav: 9_700_000 }),
    )
  })

  it('scales each fund by its factor (pro-rata × FX)', () => {
    const fundA = [cmp(2024, 1, amt(10_000_000, 1_000_000, 9_000_000))]
    const data = buildPortfolioComparison({
      totalCommitment: 18_000_000,
      funds: [{ comparison: fundA, factor: 0.6 }],
    })
    expect(data[0].forecast).toMatchObject({
      contributed: 6_000_000,
      distributed: 600_000,
      nav: 5_400_000,
    })
  })

  it('carries cumulative actuals forward across funds reporting on different quarters', () => {
    const fundA: QuarterComparison[] = [cmp(2024, 1, null, amt(1_000_000, 0, 900_000))]
    const fundB: QuarterComparison[] = [cmp(2024, 2, null, amt(2_000_000, 0, 1_800_000))]
    const data = buildPortfolioComparison({
      totalCommitment: 100_000_000,
      funds: [
        { comparison: fundA, factor: 1 },
        { comparison: fundB, factor: 1 },
      ],
    })
    expect(data.map((d) => d.quarter)).toEqual([
      { year: 2024, q: 1 },
      { year: 2024, q: 2 },
    ])
    // Q1: only A has reported.
    expect(data[0].actual?.contributed).toBe(1_000_000)
    // Q2: A's Q1 reading carried forward (1m) + B's Q2 (2m).
    expect(data[1].actual?.contributed).toBe(3_000_000)
    expect(data[1].actual?.nav).toBe(900_000 + 1_800_000)
  })

  it('aggregates recallable only from funds that report it', () => {
    const fundA = [cmp(2024, 1, null, amt(1_000_000, 0, 0, 250_000))]
    const fundB = [cmp(2024, 1, null, amt(2_000_000, 0, 0))] // recallable null
    const data = buildPortfolioComparison({
      totalCommitment: 1,
      funds: [
        { comparison: fundA, factor: 1 },
        { comparison: fundB, factor: 1 },
      ],
    })
    expect(data[0].actual?.recallable).toBe(250_000)
  })

  it('does not extend the actual past the latest reported quarter', () => {
    // Fund reports an actual only at Q1, but its plan runs Q1→Q3. The roll-up shows
    // the actual at Q1 only — never carried forward across the whole forecast horizon.
    const fundA: QuarterComparison[] = [
      cmp(2024, 1, amt(2_000_000, 0, 1_800_000), amt(1_000_000, 0, 900_000)),
      cmp(2024, 2, amt(4_000_000, 0, 3_600_000)),
      cmp(2024, 3, amt(6_000_000, 0, 5_400_000)),
    ]
    const data = buildPortfolioComparison({
      totalCommitment: 10_000_000,
      funds: [{ comparison: fundA, factor: 1 }],
    })
    expect(data).toHaveLength(3)
    expect(data[0].actual?.contributed).toBe(1_000_000)
    expect(data[1].actual).toBeNull()
    expect(data[2].actual).toBeNull()
    expect(data[2].forecast?.contributed).toBe(6_000_000)
  })

  it('leaves actual null where no underlying fund has actuals (plan-only)', () => {
    const fundA = [cmp(2024, 1, amt(5_000_000, 0, 4_000_000))]
    const data = buildPortfolioComparison({
      totalCommitment: 10_000_000,
      funds: [{ comparison: fundA, factor: 1 }],
    })
    expect(data[0].actual).toBeNull()
    expect(quarterDeviation(data[0].actual, data[0].forecast).contributed).toBeNull()
  })

  it('lookthrough invariant: per-fund contributions sum to the aggregate (per-quarter FX)', () => {
    const ordQ1 = quarterOrdinal({ year: 2024, q: 1 })
    // Per-quarter factors (mirrors the roll-up's pro-rata × time-varying FX): fund A uses
    // a different rate in Q1 vs Q2; fund B is flat. The lookthrough decomposition must hold
    // regardless of the per-quarter factor.
    const fA = (ord: number) => (ord === ordQ1 ? 1.1 : 1.5)
    const fB = (_ord: number) => 1.0
    const fundA: QuarterComparison[] = [
      cmp(2024, 1, amt(1_000, 100, 900), amt(800, 50, 750)),
      cmp(2024, 2, amt(2_000, 200, 1_800)),
    ]
    const fundB: QuarterComparison[] = [
      cmp(2024, 1, amt(500, 0, 400), amt(400, 0, 350)),
      cmp(2024, 2, amt(900, 0, 800)),
    ]

    const aggregate = buildPortfolioComparison({
      totalCommitment: 50_000,
      funds: [
        { comparison: fundA, factorForOrd: fA },
        { comparison: fundB, factorForOrd: fB },
      ],
    })
    const onlyA = buildPortfolioComparison({ totalCommitment: 30_000, funds: [{ comparison: fundA, factorForOrd: fA }] })
    const onlyB = buildPortfolioComparison({ totalCommitment: 20_000, funds: [{ comparison: fundB, factorForOrd: fB }] })

    expect(aggregate).toHaveLength(2)
    aggregate.forEach((agg, i) => {
      for (const side of ['forecast', 'actual'] as const) {
        const a = agg[side]
        const sum = (onlyA[i][side]?.contributed ?? 0) + (onlyB[i][side]?.contributed ?? 0)
        expect(a?.contributed ?? 0).toBeCloseTo(sum, 6)
        const sumD = (onlyA[i][side]?.distributed ?? 0) + (onlyB[i][side]?.distributed ?? 0)
        expect(a?.distributed ?? 0).toBeCloseTo(sumD, 6)
        const sumN = (onlyA[i][side]?.nav ?? 0) + (onlyB[i][side]?.nav ?? 0)
        expect(a?.nav ?? 0).toBeCloseTo(sumN, 6)
      }
    })
    // Spot-check the per-quarter FX actually varied: Q1 actual A = 800 × 1.1 = 880.
    expect(onlyA[0].actual?.contributed).toBeCloseTo(880, 6)
  })
})
