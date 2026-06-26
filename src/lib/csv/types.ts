// Shared vocabulary between the pure importer logic and the wizard UI.

import type { ActualsRecord, CalendarQuarterRef } from '@/store/types'

export type { ColumnMapping, CanonicalField } from './columnMapping'

/** Sentinel meaning "don't import rows for this CSV fund name". */
export const FUND_SKIP = 'SKIP' as const
export type FundTarget = string | typeof FUND_SKIP

/** Distinct CSV fund name → a system fund id, or FUND_SKIP. */
export type FundNameMapping = Record<string, FundTarget>

/** What happened to one CSV data row. */
export interface RowOutcome {
  /** 0-based index into the CSV's data rows (excludes the header). */
  rowIndex: number
  csvFundName: string
  status: 'ok' | 'skipped' | 'error'
  fundId: string | null
  quarter: CalendarQuarterRef | null
  record: ActualsRecord | null
  /** Hard problems that excluded the row (bad date, missing/invalid required number). */
  errors: string[]
  /** Soft notes that did not exclude the row (e.g. an unparseable recallable, ignored). */
  warnings: string[]
}

/** The write planned for one fund: the merge of existing actuals with the CSV's. */
export interface FundMergePlan {
  fundId: string
  fundName: string
  /** Records built from the CSV (deduped, sorted). */
  incoming: ActualsRecord[]
  /** existing ∪ incoming, with incoming overwriting matching quarters. The write. */
  merged: ActualsRecord[]
  /** Quarters in the CSV that overwrite an existing stored quarter. */
  overwrittenQuarters: CalendarQuarterRef[]
  /** Quarters in the CSV that are new for the fund. */
  addedQuarters: CalendarQuarterRef[]
  /** Quarters that appeared more than once for this fund in the CSV (last value used). */
  duplicateInCsv: CalendarQuarterRef[]
}

export interface ImportPreview {
  rows: RowOutcome[]
  plans: FundMergePlan[]
  /** Distinct CSV fund names that resolved to skip (unmapped or explicitly skipped). */
  skippedFundNames: string[]
  okRowCount: number
  errorRowCount: number
  skippedRowCount: number
}
