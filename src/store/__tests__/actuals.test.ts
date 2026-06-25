import { beforeEach, describe, expect, it } from 'vitest'
import { resetToSeed, useStore } from '..'
import { parseSnapshot, serializeSnapshot } from '../persistence'
import type { ActualsRecord } from '../types'
import {
  compareQuarter,
  nextQuarter,
  quarterLabel,
  quarterOfIso,
  quarterOrdinal,
} from '@/lib/quarter'
import { formatMultiple, fundMultiples } from '@/lib/metrics'

// Covers the Actuals screen's store surface: the setFundActuals (Save) path, the
// records round-tripping through export/import, the pure quarter helpers behind the
// grid, and the derived unfunded formula (commitment − contributed + recallable).

beforeEach(() => {
  resetToSeed()
})

const get = () => useStore.getState()

const rows: ActualsRecord[] = [
  { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 5_000_000, cumulativeDistributions: 0, nav: 4_800_000 },
  {
    quarter: { year: 2024, q: 2 },
    cumulativePaidIn: 9_000_000,
    cumulativeDistributions: 1_200_000,
    nav: 8_900_000,
    recallableDistributions: 300_000,
  },
]

describe('fundsSlice — setFundActuals (the Actuals Save path)', () => {
  it('replaces the actuals array on the fund', () => {
    const id = get().fundOrder[0]
    expect(get().funds[id].actuals).toHaveLength(0) // seed starts empty

    get().setFundActuals(id, rows)

    expect(get().funds[id].actuals).toHaveLength(2)
    expect(get().funds[id].actuals[1].recallableDistributions).toBe(300_000)
  })
})

describe('Actuals round-trip', () => {
  it('persists records through setFundActuals and export/import', () => {
    const id = get().fundOrder[0]
    get().setFundActuals(id, rows)

    const res = parseSnapshot(serializeSnapshot(get() as never))
    expect(res.ok).toBe(true)
    if (res.ok) {
      const after = res.data.funds[id].actuals
      expect(after).toHaveLength(2)
      expect(after[0]).toEqual(rows[0])
      expect(after[1].recallableDistributions).toBe(300_000)
    }
  })
})

describe('quarter helpers', () => {
  it('labels a quarter', () => {
    expect(quarterLabel({ year: 2025, q: 2 })).toBe('Q2 2025')
  })

  it('advances to the next quarter, rolling Q4 → Q1 of the next year', () => {
    expect(nextQuarter({ year: 2025, q: 1 })).toEqual({ year: 2025, q: 2 })
    expect(nextQuarter({ year: 2025, q: 4 })).toEqual({ year: 2026, q: 1 })
  })

  it('maps an ISO date to its containing quarter (incl. boundaries)', () => {
    expect(quarterOfIso('2025-05-10')).toEqual({ year: 2025, q: 2 })
    expect(quarterOfIso('2025-01-01')).toEqual({ year: 2025, q: 1 })
    expect(quarterOfIso('2025-03-31')).toEqual({ year: 2025, q: 1 })
    expect(quarterOfIso('2025-04-01')).toEqual({ year: 2025, q: 2 })
    expect(quarterOfIso('2025-12-31')).toEqual({ year: 2025, q: 4 })
  })

  it('orders quarters chronologically', () => {
    const unsorted: ActualsRecord['quarter'][] = [
      { year: 2025, q: 1 },
      { year: 2024, q: 3 },
      { year: 2025, q: 4 },
      { year: 2024, q: 1 },
    ]
    const sorted = [...unsorted].sort(compareQuarter)
    expect(sorted).toEqual([
      { year: 2024, q: 1 },
      { year: 2024, q: 3 },
      { year: 2025, q: 1 },
      { year: 2025, q: 4 },
    ])
    expect(quarterOrdinal({ year: 2025, q: 1 })).toBeGreaterThan(quarterOrdinal({ year: 2024, q: 4 }))
  })
})

describe('derived unfunded', () => {
  const unfunded = (commitment: number, r: ActualsRecord) =>
    commitment - r.cumulativePaidIn + (r.recallableDistributions ?? 0)

  it('is commitment − contributed + recallable', () => {
    const commitment = 30_000_000
    expect(unfunded(commitment, rows[0])).toBe(25_000_000) // 30M − 5M + 0
    expect(unfunded(commitment, rows[1])).toBe(21_300_000) // 30M − 9M + 0.3M
  })

  it('goes negative when contributed exceeds commitment (overcalled)', () => {
    const overcalled: ActualsRecord = {
      quarter: { year: 2026, q: 1 },
      cumulativePaidIn: 31_000_000,
      cumulativeDistributions: 0,
      nav: 0,
    }
    expect(unfunded(30_000_000, overcalled)).toBe(-1_000_000)
  })

  it('total value is distributed + nav', () => {
    const r = rows[1] // distributed 1.2M, nav 8.9M
    expect(r.cumulativeDistributions + r.nav).toBe(10_100_000)
  })
})

describe('fundMultiples — derived PE multiples (key metrics)', () => {
  it('computes PIC/DPI/RVPI/TVPI from cumulative amounts; TVPI = DPI + RVPI', () => {
    const m = fundMultiples({
      commitment: 30_000_000,
      paidIn: 9_000_000,
      distributed: 1_200_000,
      nav: 8_900_000,
    })
    expect(m.pic).toBeCloseTo(0.3, 10)
    expect(m.dpi).toBeCloseTo(1_200_000 / 9_000_000, 10)
    expect(m.rvpi).toBeCloseTo(8_900_000 / 9_000_000, 10)
    expect(m.tvpi).toBeCloseTo((1_200_000 + 8_900_000) / 9_000_000, 10)
    expect(m.tvpi!).toBeCloseTo(m.dpi! + m.rvpi!, 10) // TVPI = DPI + RVPI
  })

  it('returns n.a. (null) for paid-in ratios when paid-in is 0', () => {
    const m = fundMultiples({ commitment: 30_000_000, paidIn: 0, distributed: 0, nav: 0 })
    expect(m.pic).toBe(0) // 0 / commitment, still defined
    expect(m.dpi).toBeNull()
    expect(m.rvpi).toBeNull()
    expect(m.tvpi).toBeNull()
    expect(formatMultiple(m.dpi)).toBe('n.a.')
    expect(formatMultiple(m.pic)).toBe('0.00×')
    expect(formatMultiple(1.45)).toBe('1.45×')
  })
})
