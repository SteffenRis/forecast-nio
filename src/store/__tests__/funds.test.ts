import { beforeEach, describe, expect, it } from 'vitest'
import { resetToSeed, useStore } from '..'
import { parseSnapshot, serializeSnapshot } from '../persistence'
import { addYearsIso } from '@/lib/format'

// Covers the Phase-2 Fund editor's store surface: the upsert (Save) path, the new
// descriptive Fund fields round-tripping through upsert + export/import, and the
// pure helpers behind the editor's standard-liquidation derivation.

beforeEach(() => {
  resetToSeed()
})

const get = () => useStore.getState()

describe('fundsSlice — upsertFund (the editor Save path)', () => {
  it('replaces a fund in place without duplicating its fundOrder entry', () => {
    const id = get().fundOrder[0]
    const edited = structuredClone(get().funds[id])
    edited.name = 'Renamed fund'
    edited.commitment = 42_000_000

    get().upsertFund(edited)

    expect(get().funds[id].name).toBe('Renamed fund')
    expect(get().funds[id].commitment).toBe(42_000_000)
    expect(get().fundOrder.filter((x) => x === id)).toHaveLength(1)
  })

  it('appends a brand-new fund to fundOrder', () => {
    const src = get().funds[get().fundOrder[0]]
    const created = { ...structuredClone(src), id: 'fund_new', name: 'New one' }
    const before = get().fundOrder.length

    get().upsertFund(created)

    expect(get().fundOrder).toContain('fund_new')
    expect(get().fundOrder).toHaveLength(before + 1)
    expect(get().funds['fund_new'].name).toBe('New one')
  })
})

describe('Fund descriptive fields round-trip', () => {
  it('persists the new optional fields through upsertFund and export/import', () => {
    const id = get().fundOrder[0]
    const edited = structuredClone(get().funds[id])
    edited.gpName = 'Acme Capital Partners'
    edited.fundSizeActual = 300_000_000
    edited.targetFundSize = 250_000_000
    edited.acceptanceDate = '2024-01-15'

    get().upsertFund(edited)

    const after = get().funds[id]
    expect(after.gpName).toBe('Acme Capital Partners')
    expect(after.fundSizeActual).toBe(300_000_000)
    expect(after.targetFundSize).toBe(250_000_000)
    expect(after.acceptanceDate).toBe('2024-01-15')

    // Survives a serialize → parse round-trip (the JSON document).
    const res = parseSnapshot(serializeSnapshot(get() as never))
    expect(res.ok).toBe(true)
    if (res.ok) {
      const roundTripped = res.data.funds[id]
      expect(roundTripped.gpName).toBe('Acme Capital Partners')
      expect(roundTripped.fundSizeActual).toBe(300_000_000)
      expect(roundTripped.targetFundSize).toBe(250_000_000)
      expect(roundTripped.acceptanceDate).toBe('2024-01-15')
    }
  })
})

describe('addYearsIso — standard-liquidation derivation', () => {
  it('adds whole years to an ISO date', () => {
    expect(addYearsIso('2024-02-15', 10)).toBe('2034-02-15')
    expect(addYearsIso('2024-02-15', 0)).toBe('2024-02-15')
  })

  it('clamps Feb 29 to Feb 28 when the target year is not a leap year', () => {
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-02-28')
    expect(addYearsIso('2024-02-29', 4)).toBe('2028-02-29') // still a leap year
  })

  it('matches the seed fund: effectiveDate + template life = standard liquidation', () => {
    const fund = get().funds[get().fundOrder[0]]
    const life = get().templates[fund.templateId].fundLifeYears
    expect(addYearsIso(fund.effectiveDate, life)).toBe(fund.standardLiquidationDate)
  })
})
