import { describe, expect, it } from 'vitest'
import { buildImportPreview, mergeActualsByQuarter } from '../buildActuals'
import type { ColumnMapping } from '../columnMapping'
import { FUND_SKIP, type FundNameMapping } from '../types'
import type { ParsedCsv } from '../parseCsv'
import type { FundLike } from '../matchFunds'
import type { ActualsRecord } from '@/store/types'

// Columns in canonical order: fundName, date, contributions, distributions, recallable, nav.
const CM: ColumnMapping = { fundName: 0, date: 1, contributions: 2, distributions: 3, recallable: 4, nav: 5 }
const HEADER = ['Fund', 'Date', 'Contributions', 'Distributions', 'Recallable', 'NAV']
const funds: FundLike[] = [{ id: 'f_acme7', name: 'Acme VII' }]

const csv = (rows: string[][]): ParsedCsv => ({ header: HEADER, rows })

function run(rows: string[][], opts?: {
  mapping?: FundNameMapping
  existing?: Record<string, ActualsRecord[]>
  columnMapping?: ColumnMapping
}) {
  return buildImportPreview({
    parsed: csv(rows),
    columnMapping: opts?.columnMapping ?? CM,
    fundNameMapping: opts?.mapping ?? { 'Acme VII': 'f_acme7' },
    funds,
    existingActualsByFundId: opts?.existing ?? {},
  })
}

describe('buildImportPreview — D1 cumulative as-is', () => {
  it('writes contributions/distributions straight into the cumulative fields', () => {
    const p = run([
      ['Acme VII', '2024-03-31', '6,000,000', '0', '', '5,800,000'],
      ['Acme VII', '2024-06-30', '9,000,000', '500,000', '', '9,000,000'],
    ])
    expect(p.okRowCount).toBe(2)
    expect(p.plans).toHaveLength(1)
    expect(p.plans[0].incoming).toEqual([
      { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 6_000_000, cumulativeDistributions: 0, nav: 5_800_000 },
      { quarter: { year: 2024, q: 2 }, cumulativePaidIn: 9_000_000, cumulativeDistributions: 500_000, nav: 9_000_000 },
    ])
  })
})

describe('buildImportPreview — D2 merge by quarter', () => {
  it('overwrites quarters present in the CSV and keeps the rest', () => {
    const existing: Record<string, ActualsRecord[]> = {
      f_acme7: [
        { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 1, cumulativeDistributions: 0, nav: 1 },
        { quarter: { year: 2024, q: 2 }, cumulativePaidIn: 2, cumulativeDistributions: 0, nav: 2 },
      ],
    }
    const p = run(
      [
        ['Acme VII', '2024-06-30', '20', '0', '', '20'], // overwrites Q2
        ['Acme VII', '2024-09-30', '30', '0', '', '30'], // adds Q3
      ],
      { existing },
    )
    const plan = p.plans[0]
    expect(plan.merged.map((r) => r.quarter)).toEqual([
      { year: 2024, q: 1 },
      { year: 2024, q: 2 },
      { year: 2024, q: 3 },
    ])
    // Q1 untouched, Q2 overwritten with the CSV value, Q3 added.
    expect(plan.merged[0].cumulativePaidIn).toBe(1)
    expect(plan.merged[1].cumulativePaidIn).toBe(20)
    expect(plan.merged[2].cumulativePaidIn).toBe(30)
    expect(plan.overwrittenQuarters).toEqual([{ year: 2024, q: 2 }])
    expect(plan.addedQuarters).toEqual([{ year: 2024, q: 3 }])
  })
})

describe('buildImportPreview — D3 skip unmapped funds', () => {
  it('skips rows whose fund name is unmapped or explicitly skipped, and lists them', () => {
    const p = run(
      [
        ['Acme VII', '2024-03-31', '6', '0', '', '5'],
        ['Ghost Fund', '2024-03-31', '6', '0', '', '5'], // not in the mapping
        ['Skip Me', '2024-03-31', '6', '0', '', '5'], // explicitly skipped
      ],
      { mapping: { 'Acme VII': 'f_acme7', 'Skip Me': FUND_SKIP } },
    )
    expect(p.skippedFundNames).toEqual(['Ghost Fund', 'Skip Me'])
    expect(p.skippedRowCount).toBe(2)
    expect(p.plans).toHaveLength(1)
    expect(p.plans[0].fundId).toBe('f_acme7')
  })
})

describe('buildImportPreview — duplicate quarter within the CSV', () => {
  it('keeps the last row for a repeated fund+quarter and notes it', () => {
    const p = run([
      ['Acme VII', '2024-03-31', '6', '0', '', '5'],
      ['Acme VII', '2024-01-15', '7', '0', '', '8'], // same Q1, later row wins
    ])
    expect(p.plans[0].incoming).toHaveLength(1)
    expect(p.plans[0].incoming[0].cumulativePaidIn).toBe(7)
    expect(p.plans[0].duplicateInCsv).toEqual([{ year: 2024, q: 1 }])
  })
})

describe('buildImportPreview — row-level errors', () => {
  it('excludes rows with a bad date or invalid number but imports the rest', () => {
    const p = run([
      ['Acme VII', 'not-a-date', '6', '0', '', '5'],
      ['Acme VII', '2024-06-30', 'oops', '0', '', '5'],
      ['Acme VII', '2024-09-30', '6', '0', '', '5'], // good
    ])
    expect(p.errorRowCount).toBe(2)
    expect(p.okRowCount).toBe(1)
    expect(p.rows[0].errors[0]).toMatch(/Unparseable date/)
    expect(p.rows[1].errors[0]).toMatch(/Invalid contributions/)
    expect(p.plans[0].incoming).toHaveLength(1)
    expect(p.plans[0].incoming[0].quarter).toEqual({ year: 2024, q: 3 })
  })

  it('flags a row with a missing fund name as an error, not a skip', () => {
    const p = run([['', '2024-03-31', '6', '0', '', '5']])
    expect(p.errorRowCount).toBe(1)
    expect(p.rows[0].errors).toContain('Missing fund name')
    expect(p.skippedFundNames).toEqual([])
  })
})

describe('buildImportPreview — optional recallable', () => {
  it('omits the field when blank and sets it when present', () => {
    const p = run([
      ['Acme VII', '2024-03-31', '6', '0', '', '5'],
      ['Acme VII', '2024-06-30', '6', '0', '1,000', '5'],
    ])
    expect(p.plans[0].incoming[0].recallableDistributions).toBeUndefined()
    expect(p.plans[0].incoming[1].recallableDistributions).toBe(1000)
  })

  it('soft-warns and drops an unparseable recallable without failing the row', () => {
    const p = run([['Acme VII', '2024-03-31', '6', '0', 'bad', '5']])
    expect(p.okRowCount).toBe(1)
    expect(p.rows[0].warnings[0]).toMatch(/Recallable/)
    expect(p.plans[0].incoming[0].recallableDistributions).toBeUndefined()
  })
})

describe('mergeActualsByQuarter', () => {
  it('returns a chronologically sorted union', () => {
    const existing: ActualsRecord[] = [
      { quarter: { year: 2024, q: 3 }, cumulativePaidIn: 3, cumulativeDistributions: 0, nav: 3 },
    ]
    const incoming: ActualsRecord[] = [
      { quarter: { year: 2024, q: 1 }, cumulativePaidIn: 1, cumulativeDistributions: 0, nav: 1 },
      { quarter: { year: 2023, q: 4 }, cumulativePaidIn: 0, cumulativeDistributions: 0, nav: 0 },
    ]
    const { merged } = mergeActualsByQuarter(existing, incoming)
    expect(merged.map((r) => r.quarter)).toEqual([
      { year: 2023, q: 4 },
      { year: 2024, q: 1 },
      { year: 2024, q: 3 },
    ])
  })
})
