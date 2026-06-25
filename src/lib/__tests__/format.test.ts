import { describe, expect, it } from 'vitest'
import { formatNumericInput, groupThousands, parseNumberInput } from '../format'

// Thousand-separator grouping for the NumberInput field (live while typing + at rest).

describe('groupThousands — at-rest display', () => {
  it('groups the integer part of a clean numeric string', () => {
    expect(groupThousands('9000000')).toBe('9,000,000')
    expect(groupThousands('1000')).toBe('1,000')
    expect(groupThousands('100')).toBe('100')
    expect(groupThousands('-1234567')).toBe('-1,234,567')
  })

  it('preserves the decimal part and a trailing dot', () => {
    expect(groupThousands('0.30')).toBe('0.30')
    expect(groupThousands('12345.678')).toBe('12,345.678')
    expect(groupThousands('1000.5')).toBe('1,000.5')
    expect(groupThousands('0.')).toBe('0.')
  })

  it('passes through empty and lone-sign drafts', () => {
    expect(groupThousands('')).toBe('')
    expect(groupThousands('-')).toBe('-')
  })
})

describe('formatNumericInput — live while typing', () => {
  it('groups and is idempotent on already-grouped input', () => {
    expect(formatNumericInput('9000000')).toBe('9,000,000')
    expect(formatNumericInput('9,000,000')).toBe('9,000,000')
  })

  it('drops stray characters and collapses extra dots', () => {
    expect(formatNumericInput('1a2b3')).toBe('123')
    expect(formatNumericInput('12.34.56')).toBe('12.3456')
    expect(formatNumericInput('1,234.5')).toBe('1,234.5')
  })
})

describe('parseNumberInput — strips separators', () => {
  it('round-trips grouped values back to numbers', () => {
    expect(parseNumberInput('9,000,000')).toBe(9_000_000)
    expect(parseNumberInput('1,234.5')).toBe(1234.5)
    expect(parseNumberInput('-1,000')).toBe(-1000)
  })

  it('returns null for empty or invalid input', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
  })
})
