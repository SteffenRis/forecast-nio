import { describe, expect, it } from 'vitest'
import { parseAmount } from '../parseAmount'

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('9000000')).toEqual({ value: 9000000 })
  })

  it('strips thousands separators', () => {
    expect(parseAmount('1,234,567')).toEqual({ value: 1234567 })
  })

  it('strips currency symbols, codes and whitespace', () => {
    expect(parseAmount('€ 1,000.50')).toEqual({ value: 1000.5 })
    expect(parseAmount('1,000 EUR')).toEqual({ value: 1000 })
    expect(parseAmount('$1,000')).toEqual({ value: 1000 })
  })

  it('reads accounting parentheses as negative', () => {
    expect(parseAmount('(1,234)')).toEqual({ value: -1234 })
    expect(parseAmount('(1,234.50)')).toEqual({ value: -1234.5 })
  })

  it('reads a leading minus sign as negative', () => {
    expect(parseAmount('-500')).toEqual({ value: -500 })
  })

  it('treats a blank cell as no value (not invalid)', () => {
    expect(parseAmount('')).toEqual({ value: null })
    expect(parseAmount('   ')).toEqual({ value: null })
  })

  it('flags non-numeric content as invalid', () => {
    expect(parseAmount('n/a')).toEqual({ value: null, invalid: true })
    expect(parseAmount('abc')).toEqual({ value: null, invalid: true })
    expect(parseAmount('1.2.3')).toEqual({ value: null, invalid: true })
  })
})
