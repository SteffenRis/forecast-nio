import { describe, expect, it } from 'vitest'
import { deriveNeededFxRequests, summarizeNeededFx } from '../fxNeeded'
import type { Fund, Portfolio } from '../../types'

// Only the fields the scope rule reads — kept minimal and cast for brevity.
function fund(p: Partial<Fund>): Fund {
  return { actuals: [], ...p } as unknown as Fund
}
function portfolio(p: Partial<Portfolio>): Portfolio {
  return { allocations: {}, ...p } as unknown as Portfolio
}

describe('deriveNeededFxRequests', () => {
  it('requests base=fund-currency → quote=reporting-currency at every relevant date', () => {
    const funds = {
      f1: fund({
        currency: 'EUR',
        effectiveDate: '2023-01-15',
        actuals: [
          { quarter: { year: 2024, q: 1 } },
          { quarter: { year: 2024, q: 2 } },
        ] as Fund['actuals'],
      }),
    }
    const portfolios = {
      p1: portfolio({
        reportingCurrency: 'USD',
        effectiveDate: '2023-02-01',
        allocations: { f1: { allocatedCommitment: 100 } },
      }),
    }

    const reqs = deriveNeededFxRequests(funds, portfolios)
    // base EUR, quote USD, at fund effective + portfolio effective + two quarter-ends.
    expect(reqs.map((r) => ({ base: r.base, date: r.date, quotes: r.quotes }))).toEqual([
      { base: 'EUR', date: '2023-01-15', quotes: ['USD'] },
      { base: 'EUR', date: '2023-02-01', quotes: ['USD'] },
      { base: 'EUR', date: '2024-03-31', quotes: ['USD'] },
      { base: 'EUR', date: '2024-06-30', quotes: ['USD'] },
    ])
  })

  it('excludes funds already in the reporting currency', () => {
    const funds = { f1: fund({ currency: 'USD', effectiveDate: '2023-01-15' }) }
    const portfolios = {
      p1: portfolio({ reportingCurrency: 'USD', allocations: { f1: { allocatedCommitment: 1 } } }),
    }
    expect(deriveNeededFxRequests(funds, portfolios)).toEqual([])
  })

  it('ignores allocations whose fund no longer exists', () => {
    const portfolios = {
      p1: portfolio({ reportingCurrency: 'USD', allocations: { ghost: { allocatedCommitment: 1 } } }),
    }
    expect(deriveNeededFxRequests({}, portfolios)).toEqual([])
  })

  it('groups multiple quote currencies for the same base+date into one request', () => {
    const funds = { f1: fund({ currency: 'EUR', effectiveDate: '2023-01-15' }) }
    const portfolios = {
      usd: portfolio({
        reportingCurrency: 'USD',
        effectiveDate: '2023-01-15',
        allocations: { f1: { allocatedCommitment: 1 } },
      }),
      gbp: portfolio({
        reportingCurrency: 'GBP',
        effectiveDate: '2023-01-15',
        allocations: { f1: { allocatedCommitment: 1 } },
      }),
    }
    const reqs = deriveNeededFxRequests(funds, portfolios)
    expect(reqs).toEqual([{ base: 'EUR', date: '2023-01-15', quotes: ['GBP', 'USD'] }])
  })
})

describe('summarizeNeededFx', () => {
  it('counts distinct pairs, dates, and total rate cells', () => {
    const reqs = [
      { base: 'EUR', date: '2023-01-15', quotes: ['GBP', 'USD'] },
      { base: 'EUR', date: '2024-03-31', quotes: ['USD'] },
    ]
    expect(summarizeNeededFx(reqs)).toEqual({
      pairs: ['EUR→GBP', 'EUR→USD'],
      dates: ['2023-01-15', '2024-03-31'],
      count: 3,
    })
  })
})
