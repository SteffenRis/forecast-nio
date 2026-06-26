import { describe, expect, it } from 'vitest'
import { explainPerfCell, type PerfCellRef } from '../perfExplain'
import { fundMultiples } from '../metrics'
import type { ExplainStep } from '../explain'
import type { QuarterAmounts, QuarterComparison } from '../comparison'

// The plan-vs-actual explanation builder turns a clicked grid cell into traceable
// steps + checks over the same QuarterComparison[] the grid renders. These cover the
// cumulative recurrence (prior + change, with a drill ref), the multiple ratios + the
// TVPI = DPI + RVPI check, the Actual − Plan deviation, and the n.a. multiple.

const commitment = 30_000_000
const cur = 'EUR'

function amt(
  contributed: number,
  distributed: number,
  nav: number,
  recallable: number | null = null,
): QuarterAmounts {
  return {
    contributed,
    distributed,
    recallable,
    nav,
    multiples: fundMultiples({ commitment, paidIn: contributed, distributed, nav }),
  }
}

const data: QuarterComparison[] = [
  {
    quarter: { year: 2024, q: 4 },
    forecast: amt(0, 0, 0),
    actual: amt(0, 0, 0, 0), // no paid-in yet → DPI n.a.
  },
  {
    quarter: { year: 2025, q: 1 },
    forecast: amt(6_000_000, 0, 5_400_000),
    actual: amt(6_000_000, 0, 5_000_000, 0),
  },
  {
    quarter: { year: 2025, q: 2 },
    forecast: amt(9_000_000, 1_000_000, 9_000_000),
    actual: amt(8_500_000, 1_200_000, 8_000_000, 100_000),
  },
]

const find = (steps: ExplainStep<PerfCellRef>[], pred: (r: PerfCellRef) => boolean) =>
  steps.find((s) => s.ref && pred(s.ref))

describe('explainPerfCell — cumulative amount recurrence', () => {
  const e = explainPerfCell(data, { year: 2025, q: 2, row: 'actual', col: 'contributed' }, commitment, cur)

  it('decomposes cumulative into prior + this quarter, with a drill to the prior quarter', () => {
    expect(e.value).toContain('8,500,000')
    expect(e.formula).toMatch(/previous cumulative/)
    const prior = find(e.steps, (r) => r.row === 'actual' && r.col === 'contributed' && r.q === 1)
    expect(prior).toBeTruthy()
    expect(prior?.value).toContain('6,000,000')
    const change = e.steps.find((s) => s.label.includes('Capital called'))
    expect(change?.value).toContain('2,500,000')
    expect(e.steps.some((s) => s.emphasis && s.value?.includes('8,500,000'))).toBe(true)
  })

  it('cross-checks PIC = Contributed ÷ Commitment', () => {
    const pic = e.checks.find((c) => c.label.includes('PIC'))
    expect(pic?.pass).toBe(true)
  })
})

describe('explainPerfCell — multiples', () => {
  it('PIC = Contributed ÷ Commitment, with a drill to Contributed', () => {
    const e = explainPerfCell(data, { year: 2025, q: 2, row: 'plan', col: 'pic' }, commitment, cur)
    expect(e.value).toBe('0.30×') // 9M / 30M
    expect(find(e.steps, (r) => r.col === 'contributed' && r.row === 'plan')).toBeTruthy()
    expect(e.checks.find((c) => c.label.includes('PIC'))?.pass).toBe(true)
  })

  it('TVPI = (Distributed + NAV) ÷ Contributed and = DPI + RVPI', () => {
    const e = explainPerfCell(data, { year: 2025, q: 2, row: 'actual', col: 'tvpi' }, commitment, cur)
    // (1.2M + 8M) / 8.5M = 1.082...
    expect(e.value).toBe('1.08×')
    const cols = e.steps.map((s) => s.ref?.col).filter(Boolean)
    expect(cols).toEqual(expect.arrayContaining(['distributed', 'nav', 'contributed']))
    expect(e.checks.find((c) => c.label.includes('TVPI = DPI + RVPI'))?.pass).toBe(true)
  })

  it('returns n.a. for a multiple with no paid-in', () => {
    const e = explainPerfCell(data, { year: 2024, q: 4, row: 'actual', col: 'dpi' }, commitment, cur)
    expect(e.value).toBe('n.a.')
    expect(e.steps[0].label).toMatch(/No paid-in/)
  })
})

describe('explainPerfCell — deviation', () => {
  const e = explainPerfCell(data, { year: 2025, q: 2, row: 'deviation', col: 'contributed' }, commitment, cur)
  it('is Actual − Plan with both sides as drill links', () => {
    expect(e.formula).toBe('Δ = Actual − Plan')
    expect(e.value).toContain('500,000') // 8.5M − 9M = −0.5M
    expect(e.value.startsWith('−')).toBe(true)
    expect(find(e.steps, (r) => r.row === 'actual')).toBeTruthy()
    expect(find(e.steps, (r) => r.row === 'plan')).toBeTruthy()
  })
})
