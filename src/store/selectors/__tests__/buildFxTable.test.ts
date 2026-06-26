import { describe, expect, it } from 'vitest'
import { buildFxTable } from '../forecast'
import { quarterOfIso, quarterOrdinal } from '@/lib/quarter'
import type { Portfolio, PulledRate } from '@/store/types'

// buildFxTable only reads pf.fx, so a minimal cast keeps the fixtures terse.
const pf = (fx: Record<string, number> = {}): Portfolio => ({ fx }) as unknown as Portfolio
const pulled = (p: Partial<PulledRate>): PulledRate => ({
  base: 'EUR',
  quote: 'USD',
  date: '2024-03-31',
  ecbDate: '2024-03-28',
  rate: 1,
  fetchedAt: 't',
  ...p,
})

const ordOf = (iso: string) => quarterOrdinal(quarterOfIso(iso))

describe('buildFxTable', () => {
  it('maps pulled rates to per-quarter rates and a latest-date forecast default', () => {
    const fx = buildFxTable(
      pf(),
      { a: pulled({ date: '2024-03-31', rate: 1.1 }), b: pulled({ date: '2024-06-30', rate: 1.2 }) },
      {},
    )
    expect(fx.periodRates!['EUR->USD'][ordOf('2024-03-31')]).toBe(1.1)
    expect(fx.periodRates!['EUR->USD'][ordOf('2024-06-30')]).toBe(1.2)
    expect(fx.forecastRates!['EUR->USD']).toBe(1.2) // most recent pulled date
  })

  it('prefers the latest date within a quarter for the period rate (quarter-end beats effective date)', () => {
    const fx = buildFxTable(
      pf(),
      { eff: pulled({ date: '2024-02-15', rate: 1.05 }), qend: pulled({ date: '2024-03-31', rate: 1.1 }) },
      {},
    )
    expect(fx.periodRates!['EUR->USD'][ordOf('2024-03-31')]).toBe(1.1)
  })

  it('lets a user override win for the forecast rate', () => {
    const fx = buildFxTable(pf(), { b: pulled({ date: '2024-06-30', rate: 1.2 }) }, { 'EUR>USD': 1.99 })
    expect(fx.forecastRates!['EUR->USD']).toBe(1.99)
  })

  it('keeps manual Portfolio.fx as the flat fallback', () => {
    const fx = buildFxTable(pf({ 'EUR>USD': 1.08 }), {}, {})
    expect(fx.rates['EUR->USD']).toBe(1.08)
  })
})
