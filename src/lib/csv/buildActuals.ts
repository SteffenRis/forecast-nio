// The contract module: turn a parsed CSV + the user's column/fund mappings into a
// concrete, mergeable set of actuals per fund, plus a full report of what happens
// (overwrites, additions, skips, errors). Pure — only types and lib helpers.
//
//  - D1: contributions/distributions are cumulative-to-date, written as-is.
//  - D2: writes MERGE by quarter — incoming quarters overwrite, all others survive.
//  - D3: a CSV fund name not mapped to a system fund is skipped and reported.

import type { ActualsRecord, CalendarQuarterRef } from '@/store/types'
import { compareByQuarter, compareQuarter, quarterOrdinal } from '@/lib/quarter'
import type { ColumnMapping } from './columnMapping'
import { parseCsvDate } from './parseCsvDate'
import { parseAmount } from './parseAmount'
import type { ParsedCsv } from './parseCsv'
import type { FundLike } from './matchFunds'
import {
  FUND_SKIP,
  type FundMergePlan,
  type FundNameMapping,
  type ImportPreview,
  type RowOutcome,
} from './types'

/** Merge incoming actuals into existing, keyed by quarter ordinal. Incoming records
 *  overwrite an existing quarter; every existing quarter absent from `incoming` is
 *  preserved untouched. Returns the merged array (sorted) plus which quarters were
 *  overwritten vs newly added. */
export function mergeActualsByQuarter(
  existing: ActualsRecord[],
  incoming: ActualsRecord[],
): { merged: ActualsRecord[]; overwritten: CalendarQuarterRef[]; added: CalendarQuarterRef[] } {
  const byOrd = new Map<number, ActualsRecord>()
  for (const rec of existing) byOrd.set(quarterOrdinal(rec.quarter), rec)

  const overwritten: CalendarQuarterRef[] = []
  const added: CalendarQuarterRef[] = []
  for (const rec of incoming) {
    const ord = quarterOrdinal(rec.quarter)
    if (byOrd.has(ord)) overwritten.push(rec.quarter)
    else added.push(rec.quarter)
    byOrd.set(ord, rec)
  }

  const merged = [...byOrd.values()].sort(compareByQuarter)
  return { merged, overwritten, added }
}

/** Read a cell by (possibly null) column index; missing → ''. */
function cell(row: string[], idx: number | null): string {
  if (idx === null || idx < 0 || idx >= row.length) return ''
  return row[idx]
}

/** Parse a required money column into a value or an error message. */
function requiredAmount(raw: string, label: string): { value: number } | { error: string } {
  const res = parseAmount(raw)
  if (res.value === null) {
    return { error: res.invalid ? `Invalid ${label} "${raw.trim()}"` : `Missing ${label}` }
  }
  return { value: res.value }
}

/** Build the full import preview from the parsed CSV and the user's mappings. */
export function buildImportPreview(input: {
  parsed: ParsedCsv
  columnMapping: ColumnMapping
  fundNameMapping: FundNameMapping
  funds: FundLike[]
  existingActualsByFundId: Record<string, ActualsRecord[]>
}): ImportPreview {
  const { parsed, columnMapping: cm, fundNameMapping, funds, existingActualsByFundId } = input
  const nameById = new Map(funds.map((f) => [f.id, f.name]))

  const rows: RowOutcome[] = []
  const skippedNames = new Set<string>()

  parsed.rows.forEach((row, rowIndex) => {
    const csvFundName = cell(row, cm.fundName).trim()
    const errors: string[] = []
    const warnings: string[] = []

    if (csvFundName === '') {
      rows.push({ rowIndex, csvFundName, status: 'error', fundId: null, quarter: null, record: null, errors: ['Missing fund name'], warnings })
      return
    }

    const target = fundNameMapping[csvFundName]
    if (target === undefined || target === FUND_SKIP) {
      skippedNames.add(csvFundName)
      rows.push({ rowIndex, csvFundName, status: 'skipped', fundId: null, quarter: null, record: null, errors, warnings })
      return
    }
    const fundId = target

    const quarter = parseCsvDate(cell(row, cm.date))
    if (!quarter) errors.push(`Unparseable date "${cell(row, cm.date).trim()}"`)

    const contributed = requiredAmount(cell(row, cm.contributions), 'contributions')
    const distributed = requiredAmount(cell(row, cm.distributions), 'distributions')
    const nav = requiredAmount(cell(row, cm.nav), 'NAV')
    for (const r of [contributed, distributed, nav]) if ('error' in r) errors.push(r.error)

    // Recallable is optional: blank → omit the field; present-but-invalid → soft warn.
    let recallable: number | undefined
    if (cm.recallable !== null) {
      const raw = cell(row, cm.recallable)
      const res = parseAmount(raw)
      if (res.value !== null) recallable = res.value
      else if (res.invalid) warnings.push(`Recallable "${raw.trim()}" ignored`)
    }

    if (errors.length > 0 || !quarter || 'error' in contributed || 'error' in distributed || 'error' in nav) {
      rows.push({ rowIndex, csvFundName, status: 'error', fundId, quarter: quarter ?? null, record: null, errors, warnings })
      return
    }

    const record: ActualsRecord = {
      quarter,
      cumulativePaidIn: contributed.value,
      cumulativeDistributions: distributed.value,
      nav: nav.value,
      ...(recallable !== undefined ? { recallableDistributions: recallable } : {}),
    }
    rows.push({ rowIndex, csvFundName, status: 'ok', fundId, quarter, record, errors, warnings })
  })

  // Group OK rows by target fund, dedupe quarters within the CSV (last row wins).
  const byFund = new Map<string, { byOrd: Map<number, ActualsRecord>; dupes: Map<number, CalendarQuarterRef> }>()
  for (const r of rows) {
    if (r.status !== 'ok' || !r.fundId || !r.record) continue
    let g = byFund.get(r.fundId)
    if (!g) {
      g = { byOrd: new Map(), dupes: new Map() }
      byFund.set(r.fundId, g)
    }
    const ord = quarterOrdinal(r.record.quarter)
    if (g.byOrd.has(ord)) g.dupes.set(ord, r.record.quarter)
    g.byOrd.set(ord, r.record) // last-wins
  }

  const plans: FundMergePlan[] = []
  for (const [fundId, g] of byFund) {
    const incoming = [...g.byOrd.values()].sort(compareByQuarter)
    const existing = existingActualsByFundId[fundId] ?? []
    const { merged, overwritten, added } = mergeActualsByQuarter(existing, incoming)
    plans.push({
      fundId,
      fundName: nameById.get(fundId) ?? fundId,
      incoming,
      merged,
      overwrittenQuarters: overwritten,
      addedQuarters: added,
      duplicateInCsv: [...g.dupes.values()].sort(compareQuarter),
    })
  }
  plans.sort((a, b) => a.fundName.localeCompare(b.fundName))

  const okRowCount = rows.filter((r) => r.status === 'ok').length
  const errorRowCount = rows.filter((r) => r.status === 'error').length
  const skippedRowCount = rows.filter((r) => r.status === 'skipped').length

  return {
    rows,
    plans,
    skippedFundNames: [...skippedNames].sort((a, b) => a.localeCompare(b)),
    okRowCount,
    errorRowCount,
    skippedRowCount,
  }
}
