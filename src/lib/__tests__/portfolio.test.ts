import { describe, expect, it } from 'vitest'
import { buildPortfolioRateResolver, portfolioFxRate } from '../portfolio'
import { quarterOfIso, quarterOrdinal } from '../quarter'
import type { PulledRate } from '@/store/types'

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
const keyed = (...rs: PulledRate[]): Record<string, PulledRate> =>
  Object.fromEntries(rs.map((r, i) => [`${r.base}>${r.quote}@${r.date}#${i}`, r]))

describe('portfolioFxRate', () => {
  it('returns 1 for same currency, direct, inverse, else null', () => {
    expect(portfolioFxRate({}, 'USD', 'USD')).toBe(1)
    expect(portfolioFxRate({ 'EUR>USD': 1.08 }, 'EUR', 'USD')).toBe(1.08)
    expect(portfolioFxRate({ 'EUR>USD': 1.25 }, 'USD', 'EUR')).toBeCloseTo(0.8, 6)
    expect(portfolioFxRate({}, 'EUR', 'USD')).toBeNull()
  })
})

describe('buildPortfolioRateResolver', () => {
  const Q1 = ordOf('2024-03-31')
  const Q2 = ordOf('2024-06-30')

  it('uses period rates for actuals quarters and the forecast default beyond', () => {
    const r = buildPortfolioRateResolver({
      from: 'EUR',
      to: 'USD',
      flat: {},
      pulled: keyed(pulled({ date: '2024-03-31', rate: 1.1 }), pulled({ date: '2024-06-30', rate: 1.2 })),
      overrides: {},
    })
    // lastActualOrd = Q2: Q1/Q2 are historical, a later quarter is forecast.
    expect(r.rateForOrd(Q1, Q2)).toBe(1.1)
    expect(r.rateForOrd(Q2, Q2)).toBe(1.2)
    expect(r.rateForOrd(Q2 + 4, Q2)).toBe(1.2) // forecast → latest pulled (1.2)
    expect(r.forecastRate).toBe(1.2)
  })

  it('carries the last known rate forward across an unpulled historical quarter', () => {
    const r = buildPortfolioRateResolver({
      from: 'EUR',
      to: 'USD',
      flat: {},
      pulled: keyed(pulled({ date: '2024-03-31', rate: 1.1 })), // Q2 missing
      overrides: {},
    })
    expect(r.rateForOrd(Q2, Q2)).toBe(1.1) // historical, no own rate → carry 1.1, not forecast
  })

  it('lets a forecast override win', () => {
    const r = buildPortfolioRateResolver({
      from: 'EUR',
      to: 'USD',
      flat: {},
      pulled: keyed(pulled({ date: '2024-06-30', rate: 1.2 })),
      overrides: { 'EUR>USD': 1.99 },
    })
    expect(r.forecastRate).toBe(1.99)
    expect(r.rateForOrd(Q2 + 8, Q2)).toBe(1.99)
  })

  it('falls back to the manual flat rate, and reports null when nothing resolves', () => {
    const flat = buildPortfolioRateResolver({ from: 'EUR', to: 'USD', flat: { 'EUR>USD': 1.08 }, pulled: {}, overrides: {} })
    expect(flat.forecastRate).toBe(1.08)
    expect(flat.rateForOrd(Q1, -Infinity)).toBe(1.08)

    const none = buildPortfolioRateResolver({ from: 'EUR', to: 'USD', flat: {}, pulled: {}, overrides: {} })
    expect(none.forecastRate).toBeNull()

    const same = buildPortfolioRateResolver({ from: 'USD', to: 'USD', flat: {}, pulled: {}, overrides: {} })
    expect(same.forecastRate).toBe(1)
    expect(same.rateForOrd(Q1, -Infinity)).toBe(1)
  })
})
