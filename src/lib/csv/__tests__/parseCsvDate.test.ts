import { describe, expect, it } from 'vitest'
import { parseCsvDate } from '../parseCsvDate'

describe('parseCsvDate', () => {
  it('maps ISO dates to the containing quarter', () => {
    expect(parseCsvDate('2024-01-01')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('2024-03-31')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('2024-05-10')).toEqual({ year: 2024, q: 2 })
    expect(parseCsvDate('2024-12-31')).toEqual({ year: 2024, q: 4 })
  })

  it('accepts slash-separated dates', () => {
    expect(parseCsvDate('2024/07/15')).toEqual({ year: 2024, q: 3 })
  })

  it('accepts year-month', () => {
    expect(parseCsvDate('2024-06')).toEqual({ year: 2024, q: 2 })
  })

  it('parses quarter labels in either order and with various separators', () => {
    expect(parseCsvDate('Q1 2024')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('2024 Q1')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('2024-Q1')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('2024Q1')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('q1-2024')).toEqual({ year: 2024, q: 1 })
    expect(parseCsvDate('Q4 2023')).toEqual({ year: 2023, q: 4 })
  })

  it('returns null for unrecognizable / ambiguous input', () => {
    expect(parseCsvDate('')).toBeNull()
    expect(parseCsvDate('hello')).toBeNull()
    expect(parseCsvDate('2024')).toBeNull()
    expect(parseCsvDate('2024-13')).toBeNull()
    expect(parseCsvDate('15/01/2024')).toBeNull()
  })
})
