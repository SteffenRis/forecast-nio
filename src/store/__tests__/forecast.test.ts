import { beforeEach, describe, expect, it } from 'vitest'
import { resetToSeed, useStore } from '..'
import { selectFundForecast, selectPortfolioForecast } from '../selectors/forecast'

// Proves "the rule holds": raw seed INPUTS in the store, mapped to the engine,
// reproduce the CALCULATIONS.md §16 reference numbers — with nothing derived
// stored anywhere.

beforeEach(() => {
  resetToSeed()
})

/** The seed template now carries four cases ([Low-low, Low, Base, High]); the §16
 *  reference numbers belong to the Base case, located by the template's baseScenarioId. */
function baseScenarioId(): string {
  const s = useStore.getState()
  const fund = s.funds[s.fundOrder[0]]
  return s.templates[fund.templateId].baseScenarioId
}

describe('store → engine bridge (the rule)', () => {
  it('reproduces the §16 fund terminal IRRs from seed inputs', () => {
    const s = useStore.getState()
    const fundId = s.fundOrder[0]
    const result = selectFundForecast(s, fundId)
    expect(result).not.toBeNull()
    expect(result!.scenarios).toHaveLength(4) // Low-low · Low · Base · High
    const scn = result!.scenarios.find((x) => x.scenarioId === baseScenarioId())!
    expect(scn).toBeDefined()
    expect(scn.rows).toHaveLength(40) // 10y × 4 quarters

    // §16: Gross 27.09% → Pre-carry 23.19% → Net 20.41%
    expect(scn.grossIrr).toBeCloseTo(0.2709, 3)
    expect(scn.preCarryIrr).toBeCloseTo(0.2319, 3)
    expect(scn.netIrr).toBeCloseTo(0.2041, 3)
  })

  it('reproduces the §16 portfolio Stage-1/2/3 IRRs (overlay off = fund IRRs)', () => {
    const s = useStore.getState()
    const pfId = s.portfolioOrder[0]
    const result = selectPortfolioForecast(s, pfId)
    expect(result).not.toBeNull()
    expect(result!.scenarios).toHaveLength(4)
    const scn = result!.scenarios.find((x) => x.scenarioId === baseScenarioId())!
    expect(scn).toBeDefined()
    // overlay disabled → 3 stages, equal to fund gross/pre-carry/net
    expect(scn.irrStages).toHaveLength(3)
    expect(scn.irrStages[0]).toBeCloseTo(0.2709, 3)
    expect(scn.irrStages[1]).toBeCloseTo(0.2319, 3)
    expect(scn.irrStages[2]).toBeCloseTo(0.2041, 3)
  })

  it('reproduces §16 portfolio Stage-2 year-1 paid-in (2,160,000 USD)', () => {
    const s = useStore.getState()
    const pfId = s.portfolioOrder[0]
    const scn = selectPortfolioForecast(s, pfId)!.scenarios.find(
      (x) => x.scenarioId === baseScenarioId(),
    )!
    const year1PaidIn = scn.kid.stage2.slice(0, 4).reduce((sum, r) => sum + r.paidIn, 0)
    expect(year1PaidIn).toBeCloseTo(2_160_000, 0) // 6,000,000 × (1/3) × 1.08
  })

  it('memoizes: same inputs return a stable reference', () => {
    const s = useStore.getState()
    const fundId = s.fundOrder[0]
    const a = selectFundForecast(s, fundId)
    const b = selectFundForecast(useStore.getState(), fundId)
    expect(a).toBe(b) // referential stability → no needless re-renders

    // editing the fund invalidates the cache (new reference)
    useStore.getState().updateFund(fundId, { commitment: 60_000_000 })
    const c = selectFundForecast(useStore.getState(), fundId)
    expect(c).not.toBe(a)
  })

  it('keeps the store input-only (no derived fields persisted)', () => {
    const s = useStore.getState()
    const fund = s.funds[s.fundOrder[0]]
    expect(fund).not.toHaveProperty('netIrr')
    expect(fund).not.toHaveProperty('rows')
    expect(fund).not.toHaveProperty('forecast')
  })
})
