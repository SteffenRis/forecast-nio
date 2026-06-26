import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildUrl, fetchRates, parseFrankfurterResponse } from '../frankfurter'

describe('buildUrl', () => {
  it('builds a historical frankfurter URL with base + joined symbols', () => {
    expect(buildUrl({ base: 'EUR', date: '2024-03-31', quotes: ['USD'] })).toBe(
      'https://api.frankfurter.dev/v1/2024-03-31?base=EUR&symbols=USD',
    )
    expect(buildUrl({ base: 'EUR', date: '2024-03-31', quotes: ['USD', 'GBP'] })).toBe(
      'https://api.frankfurter.dev/v1/2024-03-31?base=EUR&symbols=USD%2CGBP',
    )
  })
})

describe('parseFrankfurterResponse', () => {
  it('flattens rates into PulledRate rows, keeping the requested date', () => {
    const rows = parseFrankfurterResponse(
      { amount: 1, base: 'EUR', date: '2024-03-29', rates: { USD: 1.0801, GBP: 0.8554 } },
      '2024-03-31',
      '2026-06-26T10:00:00.000Z',
    )
    expect(rows).toEqual([
      {
        base: 'EUR',
        quote: 'USD',
        date: '2024-03-31',
        ecbDate: '2024-03-29',
        rate: 1.0801,
        fetchedAt: '2026-06-26T10:00:00.000Z',
      },
      {
        base: 'EUR',
        quote: 'GBP',
        date: '2024-03-31',
        ecbDate: '2024-03-29',
        rate: 0.8554,
        fetchedAt: '2026-06-26T10:00:00.000Z',
      },
    ])
  })

  it('records the weekend fallback (ecbDate < requested date)', () => {
    // 2024-03-31 is a Sunday — ECB returns the prior Friday.
    const [row] = parseFrankfurterResponse(
      { amount: 1, base: 'EUR', date: '2024-03-29', rates: { USD: 1.08 } },
      '2024-03-31',
      'now',
    )
    expect(row.date).toBe('2024-03-31')
    expect(row.ecbDate).toBe('2024-03-29')
  })

  it('tolerates a missing rates object', () => {
    expect(
      parseFrankfurterResponse({ amount: 1, base: 'EUR', date: 'x' } as never, 'd', 't'),
    ).toEqual([])
  })
})

describe('fetchRates', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('collects rates from successful requests and errors from failures', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('base=EUR')) {
        return {
          ok: true,
          json: async () => ({ amount: 1, base: 'EUR', date: '2024-03-29', rates: { USD: 1.08 } }),
        } as Response
      }
      // An unsupported currency → frankfurter 404.
      return { ok: false, status: 404, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const { rates, errors } = await fetchRates([
      { base: 'EUR', date: '2024-03-31', quotes: ['USD'] },
      { base: 'XXX', date: '2024-03-31', quotes: ['USD'] },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(rates).toEqual([
      {
        base: 'EUR',
        quote: 'USD',
        date: '2024-03-31',
        ecbDate: '2024-03-29',
        rate: 1.08,
        fetchedAt: expect.any(String),
      },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('HTTP 404')
    expect(errors[0]).toContain('XXX')
  })
})
