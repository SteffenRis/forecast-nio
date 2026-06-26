import { describe, expect, it } from 'vitest'
import {
  autoDetectColumns,
  isColumnMappingComplete,
  normalizeHeader,
  type ColumnMapping,
} from '../columnMapping'

describe('normalizeHeader', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeHeader('  Fund   Name ')).toBe('fund name')
  })

  it('strips punctuation and the cumulative/currency noise tokens', () => {
    expect(normalizeHeader('Cumulative Paid-In (EUR)')).toBe('paid in')
    expect(normalizeHeader('Total Distributions to Date')).toBe('distributions')
  })

  it('falls back to the cleaned string when every token is noise', () => {
    expect(normalizeHeader('Value')).toBe('value')
  })
})

describe('autoDetectColumns', () => {
  it('maps the canonical headers one-to-one', () => {
    const m = autoDetectColumns([
      'Fund name',
      'Date',
      'Contributions',
      'Distributions',
      'Recallable distributions',
      'NAV',
    ])
    expect(m).toEqual<ColumnMapping>({
      fundName: 0,
      date: 1,
      contributions: 2,
      distributions: 3,
      recallable: 4,
      nav: 5,
    })
    expect(isColumnMappingComplete(m)).toBe(true)
  })

  it('resolves common synonyms', () => {
    const m = autoDetectColumns(['Investment', 'As of date', 'Capital Called', 'Proceeds', 'Net Asset Value'])
    expect(m.fundName).toBe(0)
    expect(m.date).toBe(1)
    expect(m.contributions).toBe(2)
    expect(m.distributions).toBe(3)
    expect(m.nav).toBe(4)
    expect(m.recallable).toBeNull()
  })

  it('leaves unknown headers unassigned', () => {
    const m = autoDetectColumns(['Fund', 'Date', 'Mystery Column', 'NAV'])
    expect(m.contributions).toBeNull()
    expect(m.distributions).toBeNull()
    expect(isColumnMappingComplete(m)).toBe(false)
  })

  it('is first-wins when two columns could claim the same field', () => {
    const m = autoDetectColumns(['NAV', 'Net Asset Value'])
    expect(m.nav).toBe(0)
  })
})
