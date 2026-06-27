import { describe, expect, it } from 'vitest'
import { explainPortfolioCell, type FundDecomp } from '../portfolioExplain'
import { fundMultiples } from '../metrics'
import { formatMoney } from '../format'
import type { PerfCellRef } from '../perfExplain'
import type { QuarterAmounts, QuarterComparison } from '../comparison'

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
  irr: null,
  multiples: fundMultiples({ commitment: 30_000_000, paidIn: contributed, distributed, nav }),
})
const qc = (
  year: number,
  q: 1 | 2 | 3 | 4,
  forecast: QuarterAmounts | null,
  actual: QuarterAmounts | null = null,
): QuarterComparison => ({ quarter: { year, q }, forecast, actual })

// Fund A: EUR, pro-rata contribution €1,000 → $1,080 (FX 1.08). Fund B: USD, $500 (no FX).
const fundA: FundDecomp = {
  name: 'Acme VII',
  currency: 'EUR',
  lcyData: [qc(2024, 1, amt(1_000, 0, 900), amt(1_200, 0, 1_100))],
  data: [qc(2024, 1, amt(1_080, 0, 972), amt(1_296, 0, 1_188))],
}
const fundB: FundDecomp = {
  name: 'Fund B',
  currency: 'USD',
  lcyData: [qc(2024, 1, amt(500, 0, 400), amt(450, 0, 380))],
  data: [qc(2024, 1, amt(500, 0, 400), amt(450, 0, 380))],
}
const aggregate = [qc(2024, 1, amt(1_580, 0, 1_372), amt(1_746, 0, 1_568))]
const cell = (over: Partial<PerfCellRef>): PerfCellRef => ({ year: 2024, q: 1, row: 'plan', col: 'contributed', ...over })

describe('explainPortfolioCell', () => {
  it('decomposes an amount cell into Fund · LCY · reporting, summing to the aggregate', () => {
    const e = explainPortfolioCell(aggregate, cell({}), 50_000, 'USD', [fundA, fundB])
    expect(e.breakdown!.columns).toEqual(['Fund', 'LCY', 'USD'])
    expect(e.value).toBe(formatMoney(1_580, 'USD'))
    // One row per fund + a Total row.
    expect(e.breakdown!.rows).toHaveLength(3)
    expect(e.breakdown!.rows[0].cells).toEqual(['Acme VII', formatMoney(1_000, 'EUR'), formatMoney(1_080, 'USD')])
    expect(e.breakdown!.rows[1].cells).toEqual(['Fund B', formatMoney(500, 'USD'), formatMoney(500, 'USD')])
    const total = e.breakdown!.rows[2]
    expect(total.emphasis).toBe(true)
    expect(total.cells[2]).toBe(formatMoney(1_580, 'USD')) // 1,080 + 500
  })

  it('drops the reporting column when no fund needs conversion', () => {
    const e = explainPortfolioCell(aggregate, cell({}), 50_000, 'USD', [fundB])
    expect(e.breakdown!.columns).toEqual(['Fund', 'USD'])
    expect(e.breakdown!.rows[0].cells).toEqual(['Fund B', formatMoney(500, 'USD')])
  })

  it('handles a deviation cell (Actual − Plan) per fund', () => {
    const e = explainPortfolioCell(aggregate, cell({ row: 'deviation' }), 50_000, 'USD', [fundA, fundB])
    // Fund A reporting Δ = 1,296 − 1,080 = +216; Total Δ = +216 + (450−500) = +166.
    expect(e.breakdown!.rows[0].cells[2]).toBe(`+${formatMoney(216, 'USD')}`)
    expect(e.breakdown!.rows[2].cells[2]).toBe(`+${formatMoney(166, 'USD')}`)
  })

  it('falls back to the ratio trace for multiple columns (no breakdown)', () => {
    const e = explainPortfolioCell(aggregate, cell({ col: 'pic' }), 50_000, 'USD', [fundA, fundB])
    expect(e.breakdown).toBeUndefined()
    expect(e.formula).toBe('PIC = Contributed ÷ Commitment')
    expect(e.steps.length).toBeGreaterThan(0)
  })
})
