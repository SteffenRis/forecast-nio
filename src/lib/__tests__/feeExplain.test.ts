import { describe, expect, it } from 'vitest'
import { explainCell, type CellRef } from '../feeExplain'
import type { FeeTraceQuarter, FundFeeTraceScenario } from '@/engine'

// The explanation builder turns a clicked number into traceable steps + checks. These
// run over a synthetic 2-year trace: 2024 in the investment period (mgmt 150k/qtr,
// establishment 150k at Q1), 2025 post-IP (mgmt 75k/qtr) with carry switching on in
// 2025 Q3 once the hurdle clears.

const rq = Math.pow(1.08, 0.25) - 1

function q(
  year: number,
  qq: 1 | 2 | 3 | 4,
  index: number,
  over: Partial<FeeTraceQuarter>,
): FeeTraceQuarter {
  const base: FeeTraceQuarter = {
    quarter: { year, q: qq },
    index,
    paidIn: 30_000_000,
    nav: 0,
    costBasis: 20_000_000,
    pNet: 0,
    dNet: 0,
    distributionsCum: 0,
    inIP: true,
    mgmtBasis: 'commitment',
    mgmtRate: 0.02,
    mgmtStock: 30_000_000,
    mgmtFee: 150_000,
    expenseBasis: 'commitment',
    expenseRate: 0.0025,
    expenseStock: 30_000_000,
    expenses: 18_750,
    establishment: 0,
    bPrev: 0,
    owedBeforeDist: 0,
    b: 0,
    carryCum: 0,
    carry: 0,
    gcum: 0,
    aboveHurdle: false,
  }
  return { ...base, ...over }
}

function makeScenario(): FundFeeTraceScenario {
  const postIP = {
    inIP: false as const,
    mgmtBasis: 'cost_basis' as const,
    mgmtRate: 0.015,
    mgmtStock: 20_000_000,
    mgmtFee: 75_000,
    expenseBasis: 'cost_basis' as const,
    expenseStock: 20_000_000,
    expenses: 12_500,
  }
  const quarters: FeeTraceQuarter[] = [
    q(2024, 1, 0, { establishment: 150_000 }),
    q(2024, 2, 1, {}),
    q(2024, 3, 2, {}),
    q(2024, 4, 3, {}),
    q(2025, 1, 4, { ...postIP }),
    q(2025, 2, 5, { ...postIP }),
    q(2025, 3, 6, {
      ...postIP,
      aboveHurdle: true,
      distributionsCum: 50_000_000,
      paidIn: 30_000_000,
      carryCum: 5_000_000, // 0.2 × (50M − 30M) / 0.8
      carry: 5_000_000,
    }),
    q(2025, 4, 7, {
      ...postIP,
      aboveHurdle: true,
      distributionsCum: 54_000_000,
      paidIn: 30_000_000,
      carryCum: 6_000_000, // 0.2 × (54M − 30M) / 0.8
      carry: 1_000_000,
    }),
  ]
  return {
    scenarioId: 'base',
    commitment: 30_000_000,
    carryRate: 0.2,
    hurdleAnnual: 0.08,
    quarterlyHurdleRate: rq,
    catchUp: true,
    establishmentRate: 0.005,
    mgmtRateIP: 0.02,
    mgmtRatePostIP: 0.015,
    mgmtBasisIP: 'commitment',
    mgmtBasisPostIP: 'cost_basis',
    expenseRateIP: 0.0025,
    expenseRatePostIP: 0.0025,
    expenseBasisIP: 'commitment',
    expenseBasisPostIP: 'cost_basis',
    qIPEndIndex: 3,
    qClearIndex: 6,
    thresholdN: 0,
    carryCumTerminal: 6_000_000,
    pTerminal: 30_000_000,
    gcumTerminal: 60_000_000, // so 0.2 × (60M − 30M) = 6M = Σ carry
    dTerminal: 54_000_000,
    quarters,
  }
}

const sc = makeScenario()
const cur = 'EUR'

describe('explainCell — quarter management fee', () => {
  const e = explainCell(sc, { kind: 'quarter', metric: 'mgmtFee', year: 2024, q: 1 }, cur)

  it('headlines the fee and the formula', () => {
    expect(e.title).toContain('Management fee')
    expect(e.value).toContain('150,000')
    expect(e.formula).toMatch(/basis × \(annual rate ÷ 4\)/)
  })

  it('shows the basis, rate and the fee = stock × rate/4 arithmetic check', () => {
    const labels = e.steps.map((s) => s.label)
    expect(labels).toContain('Fee basis')
    expect(labels).toContain('Annual rate')
    const arithmetic = e.checks.find((c) => c.label.includes('Fee = basis'))
    expect(arithmetic?.pass).toBe(true)
    const rateMatch = e.checks.find((c) => c.label.includes('Rate matches'))
    expect(rateMatch?.pass).toBe(true)
  })
})

describe('explainCell — quarter carry above the hurdle', () => {
  const e = explainCell(sc, { kind: 'quarter', metric: 'carry', year: 2025, q: 3 }, cur)

  it('shows the carry_cum formula and the per-quarter value', () => {
    expect(e.value).toContain('5,000,000')
    expect(e.formula).toMatch(/carry%/)
    const labels = e.steps.map((s) => s.label)
    expect(labels.some((l) => l.includes('Cumulative distributions'))).toBe(true)
    expect(labels.some((l) => l.includes('Profit above the hurdle'))).toBe(true)
  })

  it('passes the above-hurdle and carry_cum identity checks', () => {
    const above = e.checks.find((c) => c.label.includes('Above the hurdle'))
    expect(above?.pass).toBe(true)
    const identity = e.checks.find((c) => c.label.includes('carry_cum'))
    expect(identity?.pass).toBe(true)
  })
})

describe('explainCell — carry below the hurdle is zero', () => {
  const e = explainCell(sc, { kind: 'quarter', metric: 'carry', year: 2025, q: 1 }, cur)
  it('explains why carry is 0 and fails the above-hurdle check', () => {
    expect(e.value).toContain('0')
    const above = e.checks.find((c) => c.label.includes('Above the hurdle'))
    expect(above?.pass).toBe(false)
  })
})

describe('explainCell — year aggregates drill into quarters', () => {
  const e = explainCell(sc, { kind: 'year', metric: 'mgmtFee', year: 2024 }, cur)
  it('lists the four quarters as drill links that sum to the year', () => {
    const drills = e.steps.filter((s) => s.ref?.kind === 'quarter')
    expect(drills).toHaveLength(4)
    expect(drills.every((s) => s.ref?.kind === 'quarter')).toBe(true)
    expect(e.value).toContain('600,000') // 4 × 150k
    expect(e.checks[0].pass).toBe(true)
  })
})

describe('explainCell — lifetime carry shows the §16 identity', () => {
  const e = explainCell(sc, { kind: 'lifetime', metric: 'carry' }, cur)
  it('totals 6,000,000 and the Σ carry = carry% × (G − P) check passes', () => {
    expect(e.value).toContain('6,000,000')
    const identity = e.checks.find((c) => c.label.includes('Σ carry'))
    expect(identity?.pass).toBe(true)
    // per-year subtotals drill into the year view
    const drills = e.steps.filter((s) => s.ref?.kind === 'year')
    expect(drills.length).toBeGreaterThan(0)
  })
})

describe('explainCell — lifetime total cost to LP composes from parts', () => {
  const e = explainCell(sc, { kind: 'lifetime', metric: 'totalToLp' }, cur)
  it('drills into fund costs and carried interest', () => {
    const refs = e.steps.map((s) => s.ref).filter(Boolean) as CellRef[]
    expect(refs.some((r) => r.kind === 'lifetime' && r.metric === 'fundCosts')).toBe(true)
    expect(refs.some((r) => r.kind === 'lifetime' && r.metric === 'carry')).toBe(true)
    // fund costs (900k mgmt + 125k exp + 150k est) + carry 6M = 7,175,000
    expect(e.value).toContain('7,175,000')
  })
})
