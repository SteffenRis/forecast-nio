import { describe, expect, it } from 'vitest'
import { applyRowEdits, type RowEdits } from '../applyEdits'
import type { ColumnMapping } from '../columnMapping'
import type { ParsedCsv } from '../parseCsv'

// Columns in canonical order: fundName, date, contributions, distributions, recallable, nav.
const CM: ColumnMapping = { fundName: 0, date: 1, contributions: 2, distributions: 3, recallable: 4, nav: 5 }
const HEADER = ['Fund', 'Date', 'Contributions', 'Distributions', 'Recallable', 'NAV']
const csv = (rows: string[][]): ParsedCsv => ({ header: HEADER, rows })

describe('applyRowEdits', () => {
  it('returns the same object reference when there are no edits', () => {
    const parsed = csv([['Acme VII', '2024-03-31', '6', '0', '', '5']])
    expect(applyRowEdits(parsed, {}, CM)).toBe(parsed)
  })

  it('overwrites only the edited cells and leaves other rows untouched', () => {
    const parsed = csv([
      ['Acme VII', 'not-a-date', '6', '0', '', '5'],
      ['Acme VII', '2024-06-30', '9', '0', '', '9'],
    ])
    const edits: RowEdits = { 0: { date: '2024-Q1', nav: '5,800,000' } }
    const out = applyRowEdits(parsed, edits, CM)
    expect(out.rows[0]).toEqual(['Acme VII', '2024-Q1', '6', '0', '', '5,800,000'])
    expect(out.rows[1]).toEqual(['Acme VII', '2024-06-30', '9', '0', '', '9'])
  })

  it('does not mutate the input parsed CSV', () => {
    const parsed = csv([['Acme VII', 'not-a-date', '6', '0', '', '5']])
    applyRowEdits(parsed, { 0: { date: '2024-Q1' } }, CM)
    expect(parsed.rows[0]).toEqual(['Acme VII', 'not-a-date', '6', '0', '', '5'])
  })

  it('ignores an edit whose field is unmapped (no target column)', () => {
    const mapping: ColumnMapping = { ...CM, recallable: null }
    const parsed = csv([['Acme VII', '2024-03-31', '6', '0', '', '5']])
    const out = applyRowEdits(parsed, { 0: { recallable: '1000' } }, mapping)
    expect(out.rows[0]).toEqual(['Acme VII', '2024-03-31', '6', '0', '', '5'])
  })

  it('pads a short row so the edited column exists', () => {
    const parsed = csv([['Acme VII', '2024-03-31', '6']]) // missing distributions/recallable/nav
    const out = applyRowEdits(parsed, { 0: { nav: '5' } }, CM)
    expect(out.rows[0]).toEqual(['Acme VII', '2024-03-31', '6', '', '', '5'])
  })
})
