import { describe, expect, it } from 'vitest'
import { buildFeeOverview, type FeeRow } from '../feeOverview'
import type { CalendarQuarterRef } from '@/store/types'

// The Fees overview rolls the engine's per-quarter fee rows (mgmtFee / expenses /
// establishment / carry) up into annual lines + lifetime totals, splitting each
// figure into realized-to-date vs projected at the last-actual boundary. These
// cover the annual sums, the split, the actual/forecast/in-progress tagging and
// the headline ratios — Acme-shaped numbers (establishment 150k once, mgmt 150k/qtr,
// a carry jump after the hurdle clears).

const commitment = 30_000_000

/** Build a synthetic two-year fund: Y1 in IP (mgmt 150k/qtr, exp ~19k/qtr,
 *  establishment 150k at Q1), Y2 with a carry jump in Q3. */
function makeRows(): FeeRow[] {
  const rows: FeeRow[] = []
  // Year 2024 — investment period.
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q = (q + 1) as 1 | 2 | 3 | 4) {
    rows.push({
      quarter: { year: 2024, q },
      mgmtFee: 150_000,
      expenses: 18_750,
      establishment: q === 1 ? 150_000 : 0,
      carry: 0,
    })
  }
  // Year 2025 — post-IP, with a carry jump in Q3.
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q = (q + 1) as 1 | 2 | 3 | 4) {
    rows.push({
      quarter: { year: 2025, q },
      mgmtFee: 100_000,
      expenses: 12_500,
      establishment: 0,
      carry: q === 3 ? 2_250_000 : 0,
    })
  }
  return rows
}

describe('buildFeeOverview', () => {
  it('sums fee line items per calendar year', () => {
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    expect(o.years).toHaveLength(2)
    const y24 = o.years[0]
    expect(y24.year).toBe(2024)
    expect(y24.mgmtFee).toBe(600_000) // 4 × 150k
    expect(y24.expenses).toBe(75_000) // 4 × 18,750
    expect(y24.establishment).toBe(150_000) // one-shot Q1
    expect(y24.carry).toBe(0)
    expect(y24.total).toBe(825_000)

    const y25 = o.years[1]
    expect(y25.mgmtFee).toBe(400_000)
    expect(y25.carry).toBe(2_250_000)
    expect(y25.establishment).toBe(0)
  })

  it('reports lifetime totals and derived fund-cost / total-to-LP rows', () => {
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    expect(o.totals.mgmtFee.lifetime).toBe(1_000_000)
    expect(o.totals.expenses.lifetime).toBe(125_000)
    expect(o.totals.establishment.lifetime).toBe(150_000)
    expect(o.totals.carry.lifetime).toBe(2_250_000)
    // fundCosts excludes carry; totalToLp includes it.
    expect(o.totals.fundCosts.lifetime).toBe(1_275_000)
    expect(o.totals.totalToLp.lifetime).toBe(3_525_000)
  })

  it('splits each lifetime figure into realized-to-date vs projected at the actual boundary', () => {
    const lastActual: { quarter: CalendarQuarterRef } = { quarter: { year: 2024, q: 4 } }
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [lastActual] })
    // All of 2024 is realized; all of 2025 is projected.
    expect(o.totals.mgmtFee.toDate).toBe(600_000)
    expect(o.totals.mgmtFee.projected).toBe(400_000)
    expect(o.totals.carry.toDate).toBe(0)
    expect(o.totals.carry.projected).toBe(2_250_000)
    // lifetime always equals toDate + projected.
    for (const s of Object.values(o.totals)) {
      expect(s.lifetime).toBeCloseTo(s.toDate + s.projected, 6)
    }
  })

  it('tags whole years actual vs forecast, and a straddling year in-progress', () => {
    // Last actual lands mid-2024 → 2024 straddles, 2025 is all forecast.
    const o = buildFeeOverview({
      commitment,
      rows: makeRows(),
      actuals: [{ quarter: { year: 2024, q: 2 } }],
    })
    expect(o.years[0].phase).toBe('in-progress')
    expect(o.years[1].phase).toBe('forecast')

    // A full-actual year + a full-forecast year.
    const o2 = buildFeeOverview({
      commitment,
      rows: makeRows(),
      actuals: [{ quarter: { year: 2024, q: 4 } }],
    })
    expect(o2.years[0].phase).toBe('actual')
    expect(o2.years[1].phase).toBe('forecast')

    // No actuals → the whole life is the underwriting plan.
    const o3 = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    expect(o3.years.every((y) => y.phase === 'forecast')).toBe(true)
  })

  it('flags carry and its start quarter (the durable hurdle-clear)', () => {
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    expect(o.carryActive).toBe(true)
    expect(o.carryStart).toEqual({ year: 2025, q: 3 })
  })

  it('reports no carry for a below-hurdle fund', () => {
    const rows = makeRows().map((r) => ({ ...r, carry: 0 }))
    const o = buildFeeOverview({ commitment, rows, actuals: [] })
    expect(o.carryActive).toBe(false)
    expect(o.carryStart).toBeNull()
  })

  it('computes fee load as fund costs over commitment', () => {
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    expect(o.feeLoadPct).toBeCloseTo(1_275_000 / 30_000_000, 9)
    // Zero commitment → null, never a divide-by-zero.
    expect(buildFeeOverview({ commitment: 0, rows: makeRows(), actuals: [] }).feeLoadPct).toBeNull()
  })

  it('exposes the quarters behind each annual line for drill-down', () => {
    const o = buildFeeOverview({ commitment, rows: makeRows(), actuals: [] })
    const y24 = o.years[0]
    expect(y24.quarters.map((q) => q.quarter.q)).toEqual([1, 2, 3, 4])
    expect(y24.quarters[0].establishment).toBe(150_000) // one-shot in Q1
    expect(y24.quarters[1].establishment).toBe(0)
    // per-quarter total = mgmt + expenses + establishment + carry
    expect(y24.quarters[0].total).toBe(150_000 + 18_750 + 150_000)
    // the carry jump surfaces in the 2025 quarter detail
    const carryQ = o.years[1].quarters.find((q) => q.carry > 0)
    expect(carryQ?.quarter).toEqual({ year: 2025, q: 3 })
    expect(carryQ?.carry).toBe(2_250_000)
    // a year's quarters re-sum to its annual line
    const summed = y24.quarters.reduce((a, q) => a + q.total, 0)
    expect(summed).toBeCloseTo(y24.total, 6)
  })

  it('tags each quarter actual or forecast, revealing an in-progress year boundary', () => {
    const o = buildFeeOverview({
      commitment,
      rows: makeRows(),
      actuals: [{ quarter: { year: 2024, q: 2 } }],
    })
    expect(o.years[0].phase).toBe('in-progress')
    expect(o.years[0].quarters.map((q) => q.phase)).toEqual(['actual', 'actual', 'forecast', 'forecast'])
    expect(o.years[1].quarters.every((q) => q.phase === 'forecast')).toBe(true)
  })

  it('orders years chronologically regardless of input order', () => {
    const shuffled = [...makeRows()].reverse()
    const o = buildFeeOverview({ commitment, rows: shuffled, actuals: [] })
    expect(o.years.map((y) => y.year)).toEqual([2024, 2025])
  })
})
