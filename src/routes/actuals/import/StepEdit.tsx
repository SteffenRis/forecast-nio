import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { CalendarQuarterRef } from '@/store/types'
import type { ColumnMapping } from '@/lib/csv/columnMapping'
import type { EditableField } from '@/lib/csv/applyEdits'
import type { RowOutcome } from '@/lib/csv/types'
import { btnPrimary, btnSecondary, card } from './styles'

interface Props {
  /** Effective CSV data rows (edits already applied), index-aligned with `outcomes`. */
  rows: string[][]
  mapping: ColumnMapping
  /** One outcome per CSV data row, recomputed after each edit by buildImportPreview. */
  outcomes: RowOutcome[]
  /** Recallable is editable only when its column was mapped (we write into that cell). */
  recallableMapped: boolean
  fundNameById: Record<string, string>
  onEditCell: (rowIndex: number, field: EditableField, value: string) => void
  onBack: () => void
  onContinue: () => void
}

const cell = (row: string[] | undefined, idx: number | null): string => {
  if (!row || idx === null || idx < 0 || idx >= row.length) return ''
  return row[idx]
}

/** Group the integer part of a plain decimal string with thousands separators, leaving
 *  the fraction, sign, and idempotent re-grouping intact. Anything that isn't a clean
 *  number (currency symbols, parentheses, blanks) is returned untouched — parseAmount
 *  still tolerates it, and we'd rather not mangle what we don't recognize. */
function formatGroups(raw: string): string {
  const s = raw.trim()
  const m = s.match(/^(-?)(\d[\d,]*)(\.\d*)?$/)
  if (!m) return raw
  const grouped = m[2].replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${m[1]}${grouped}${m[3] ?? ''}`
}

const inputCls =
  'h-8 w-full min-w-[6.5rem] rounded-md border border-border-default bg-white px-2 text-right text-[13px] tabular-nums text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'

/** Step 3: edit the parsed values before import. Rows that still fail to parse — most
 *  often an unrecognized date — are flagged and sorted to the top. Every edit flows back
 *  through the same buildImportPreview pipeline, so Confirm and the final write see the
 *  fixes. Continuing is never blocked: rows still in error are simply not imported. */
export function StepEdit({
  rows,
  mapping,
  outcomes,
  recallableMapped,
  fundNameById,
  onEditCell,
  onBack,
  onContinue,
}: Props) {
  const visible = outcomes
    .filter((o) => o.status !== 'skipped')
    .sort((a, b) => {
      const ae = a.status === 'error' ? 0 : 1
      const be = b.status === 'error' ? 0 : 1
      return ae - be || a.rowIndex - b.rowIndex
    })
  const attention = visible.filter((o) => o.status === 'error').length

  const numberCell = (o: RowOutcome, field: EditableField) => (
    <NumberInput
      value={cell(rows[o.rowIndex], mapping[field])}
      className={inputCls}
      onCommit={(v) => onEditCell(o.rowIndex, field, v)}
    />
  )

  return (
    <div className="mt-5 space-y-4">
      {attention > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <AlertTriangle className="size-4 shrink-0" strokeWidth={2} />
          <span>
            <span className="font-semibold">{attention}</span> row{attention === 1 ? '' : 's'} need
            {attention === 1 ? 's' : ''} attention — usually an unrecognized date. Fix below, or
            continue and they'll be skipped.
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-border-default bg-white px-4 py-3 text-[13px] text-muted">
          Review the parsed values and adjust any that look wrong — most often a date the importer
          couldn't read — then continue.
        </div>
      )}

      <div className={card}>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 text-left font-semibold">Row</th>
                <th className="pb-2 pr-3 text-left font-semibold">Fund</th>
                <th className="px-1.5 pb-2 text-left font-semibold">Quarter</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Contributed</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Distributed</th>
                <th className="px-1.5 pb-2 text-right font-semibold">Recallable</th>
                <th className="px-1.5 pb-2 text-right font-semibold">NAV</th>
                <th className="pb-2 pl-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const fundName = (o.fundId && fundNameById[o.fundId]) || o.csvFundName || '—'
                return (
                  <tr key={o.rowIndex} className="align-top">
                    <td className="py-2 pr-3 text-left text-muted">{o.rowIndex + 2}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-left font-medium text-body">
                      {fundName}
                    </td>
                    <td className="px-1.5 py-2">
                      <QuarterPicker
                        quarter={o.quarter}
                        invalid={!o.quarter}
                        onChange={(v) => onEditCell(o.rowIndex, 'date', v)}
                      />
                    </td>
                    <td className="px-1.5 py-2">{numberCell(o, 'contributions')}</td>
                    <td className="px-1.5 py-2">{numberCell(o, 'distributions')}</td>
                    <td className="px-1.5 py-2">
                      {recallableMapped ? (
                        numberCell(o, 'recallable')
                      ) : (
                        <span className="block text-right text-muted">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2">{numberCell(o, 'nav')}</td>
                    <td className="py-2 pl-3 text-left">
                      {o.status === 'error' ? (
                        <span className="text-[12px] font-medium text-negative">
                          {o.errors.join('; ')}
                        </span>
                      ) : o.warnings.length > 0 ? (
                        <span className="text-[12px] text-amber-700">{o.warnings.join('; ')}</span>
                      ) : (
                        <span className="text-[12px] font-medium text-positive">Ready</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[13px] text-muted">
                    No rows resolved to a system fund. Go back and map fund names.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnSecondary} onClick={onBack}>
          Back
        </button>
        <div className="flex items-center gap-3">
          {attention > 0 && (
            <span className="text-[12px] text-muted">
              {attention} row{attention === 1 ? '' : 's'} still {attention === 1 ? 'has' : 'have'}{' '}
              errors and won't be imported.
            </span>
          )}
          <button type="button" className={btnPrimary} onClick={onContinue}>
            Review import
          </button>
        </div>
      </div>
    </div>
  )
}

/** A money input that shows thousands separators at rest and while focused, but commits
 *  the raw typed text (parseAmount tolerates the commas). Grouping is applied on focus and
 *  display rather than on every keystroke, so the caret never jumps mid-edit. */
function NumberInput({
  value,
  className,
  onCommit,
}: {
  value: string
  className: string
  onCommit: (raw: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={focused ? draft : formatGroups(value)}
      onFocus={() => {
        setDraft(formatGroups(value))
        setFocused(true)
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        onCommit(e.target.value)
      }}
      onBlur={() => setFocused(false)}
    />
  )
}

/** A quarter is the store's unit for actuals, so the date edit is a Year + Q1–Q4 pair that
 *  emits a canonical "YYYY-Qn" string — a form `parseCsvDate` already accepts. Local state
 *  holds the in-progress year/quarter; the row stays flagged until both make a valid quarter. */
function QuarterPicker({
  quarter,
  invalid,
  onChange,
}: {
  quarter: CalendarQuarterRef | null
  invalid: boolean
  onChange: (value: string) => void
}) {
  const [year, setYear] = useState(quarter ? String(quarter.year) : '')
  const [q, setQ] = useState(quarter ? String(quarter.q) : '')

  const emit = (y: string, qq: string) => {
    onChange(y && qq ? `${y}-Q${qq}` : y || (qq ? `Q${qq}` : ''))
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        className={cn(
          'h-8 w-16 rounded-md border bg-white px-2 text-[13px] tabular-nums text-body outline-none focus:ring-2 focus:ring-slate-100',
          invalid ? 'border-negative' : 'border-border-default focus:border-slate-400',
        )}
        value={year}
        onChange={(e) => {
          setYear(e.target.value)
          emit(e.target.value, q)
        }}
      />
      <select
        className={cn(
          'h-8 w-[4.25rem] rounded-md border bg-white px-1.5 text-[13px] text-body outline-none focus:ring-2 focus:ring-slate-100',
          invalid ? 'border-negative' : 'border-border-default focus:border-slate-400',
        )}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          emit(year, e.target.value)
        }}
      >
        <option value="">Q…</option>
        <option value="1">Q1</option>
        <option value="2">Q2</option>
        <option value="3">Q3</option>
        <option value="4">Q4</option>
      </select>
    </div>
  )
}
