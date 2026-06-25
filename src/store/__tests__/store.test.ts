import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, resetToSeed, clearAllData } from '..'
import { parseSnapshot, serializeSnapshot } from '../persistence'

beforeEach(() => {
  resetToSeed()
})

describe('store — seed', () => {
  it('loads the §16 reference example', () => {
    const s = useStore.getState()
    expect(s.templateOrder).toHaveLength(1)
    expect(s.fundOrder).toHaveLength(1)
    expect(s.portfolioOrder).toHaveLength(1)
    const fund = s.funds[s.fundOrder[0]]
    expect(fund.name).toBe('Acme VII')
    expect(fund.commitment).toBe(30_000_000)
    const pf = s.portfolios[s.portfolioOrder[0]]
    expect(pf.reportingCurrency).toBe('USD')
    expect(pf.allocations[fund.id].allocatedCommitment).toBe(10_000_000)
  })
})

describe('store — CRUD (immutable via immer)', () => {
  it('adds, updates and removes a fund without mutating prior state', () => {
    const before = useStore.getState().funds
    const templateId = useStore.getState().templateOrder[0]
    const id = useStore.getState().addFund(templateId, 'New Fund')
    expect(useStore.getState().funds).not.toBe(before) // new reference
    expect(useStore.getState().funds[id].name).toBe('New Fund')

    useStore.getState().updateFund(id, { commitment: 50_000_000 })
    expect(useStore.getState().funds[id].commitment).toBe(50_000_000)

    useStore.getState().removeFund(id)
    expect(useStore.getState().funds[id]).toBeUndefined()
    expect(useStore.getState().fundOrder).not.toContain(id)
  })

  it('toggles the sidebar flag', () => {
    const start = useStore.getState().ui.sidebarCollapsed
    useStore.getState().toggleSidebar()
    expect(useStore.getState().ui.sidebarCollapsed).toBe(!start)
  })
})

describe('store — export / import round-trip', () => {
  it('serialize → parse preserves the dataset', () => {
    const json = serializeSnapshot(useStore.getState())
    const res = parseSnapshot(json)
    expect(res.ok).toBe(true)
    if (res.ok) {
      const fundId = useStore.getState().fundOrder[0]
      expect(res.data.funds[fundId].name).toBe('Acme VII')
      expect(res.data.portfolioOrder).toHaveLength(1)
    }
  })

  it('rejects non-FundFrame JSON', () => {
    expect(parseSnapshot('{"hello":1}').ok).toBe(false)
    expect(parseSnapshot('not json').ok).toBe(false)
  })
})

describe('store — clear', () => {
  it('empties all collections', () => {
    clearAllData()
    const s = useStore.getState()
    expect(s.templateOrder).toHaveLength(0)
    expect(s.fundOrder).toHaveLength(0)
    expect(s.portfolioOrder).toHaveLength(0)
  })
})
