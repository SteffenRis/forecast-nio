// A pure overlay for the wizard's Edit step: re-write specific cells of a parsed CSV
// from a per-row, per-field string edit map. Edits are keyed by data-row index and
// canonical field (not column) so they survive the user re-mapping a column. Feeding the
// result back through buildImportPreview reuses all existing parse/validate/merge logic —
// the Edit step adds no new parsing of its own. Pure: never mutates its inputs.

import type { CanonicalField, ColumnMapping } from './columnMapping'
import type { ParsedCsv } from './parseCsv'

/** Fields the Edit step can change — every canonical field except the fund name, which
 *  is resolved in the mapping step (kept as the single source of truth for fund matching). */
export type EditableField = Exclude<CanonicalField, 'fundName'>

/** Per-row, per-field raw-string overrides, keyed by the 0-based CSV data-row index. */
export type RowEdits = Record<number, Partial<Record<EditableField, string>>>

/** Apply `edits` onto a copy of `parsed`, writing each edited value into its field's
 *  mapped column. An edit for an unmapped field (column `null`) is ignored — there is no
 *  cell to write. Short rows are padded so the target column exists. Returns the original
 *  `parsed` reference unchanged when there are no edits. */
export function applyRowEdits(parsed: ParsedCsv, edits: RowEdits, mapping: ColumnMapping): ParsedCsv {
  if (Object.keys(edits).length === 0) return parsed

  const rows = parsed.rows.map((row, i) => {
    const rowEdits = edits[i]
    if (!rowEdits) return row
    const next = row.slice()
    for (const field of Object.keys(rowEdits) as EditableField[]) {
      const idx = mapping[field]
      if (idx === null) continue
      while (next.length <= idx) next.push('')
      next[idx] = rowEdits[field] ?? ''
    }
    return next
  })
  return { header: parsed.header, rows }
}
