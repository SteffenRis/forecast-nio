import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/cn'
import { groupThousands } from '@/lib/format'
import type { ParsedCsv } from '@/lib/csv/parseCsv'
import { btnPrimary, btnSecondary, card } from './styles'

const NUMERIC_RE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/

const isNumericCell = (raw: string): boolean => NUMERIC_RE.test(raw.trim())

/** Group plain numeric cells with thousand separators for the preview; leave dates,
 *  quarters and names untouched. */
function previewCell(raw: string): string {
  const t = raw.trim()
  if (!isNumericCell(t)) return raw
  return groupThousands(t.replace(/,/g, ''))
}

/** Column indices whose non-empty preview cells are all numeric — right-aligned. */
function numericColumns(rows: string[][], colCount: number): Set<number> {
  const out = new Set<number>()
  for (let c = 0; c < colCount; c++) {
    let seen = 0
    let numeric = 0
    for (const row of rows) {
      const cell = (row[c] ?? '').trim()
      if (cell === '') continue
      seen++
      if (isNumericCell(cell)) numeric++
    }
    if (seen > 0 && numeric === seen) out.add(c)
  }
  return out
}

interface Props {
  fileName: string | null
  parsed: ParsedCsv | null
  error: string | null
  onText: (fileName: string, text: string) => void
  onContinue: () => void
}

const PREVIEW_ROWS = 6

/** Step 1: pick or drop a CSV. Reads the file text and hands it up; the page parses
 *  and feeds the result back as props so the preview / errors render here. */
export function StepUpload({ fileName, parsed, error, onText, onContinue }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function read(file: File) {
    const reader = new FileReader()
    reader.onload = () => onText(file.name, typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => onText(file.name, '')
    reader.readAsText(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) read(file)
  }

  return (
    <div className="mt-5 space-y-4">
      <div className={card}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'grid w-full place-items-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging ? 'border-brand-navy bg-slate-50' : 'border-border-default hover:bg-slate-50',
          )}
        >
          <Upload className="size-7 text-muted" strokeWidth={1.75} />
          <p className="mt-3 text-[13px] font-semibold text-body">
            {fileName ? 'Choose a different file' : 'Drop a CSV here, or click to choose'}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Columns: fund name, date, contributions, distributions, recallable distributions, NAV.
            Amounts are cumulative-to-date, written like 1,234,567.89.
          </p>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) read(file)
            e.target.value = '' // allow re-selecting the same file
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-negative/30 bg-red-50 px-4 py-3 text-[13px] text-negative">
          {error}
        </div>
      )}

      {parsed &&
        (() => {
          const previewRows = parsed.rows.slice(0, PREVIEW_ROWS)
          const numericCols = numericColumns(previewRows, parsed.header.length)
          return (
            <div className={card}>
              <div className="mb-3 flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-muted" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-body">{fileName}</span>
                <span className="text-[12px] text-muted">
                  · {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} ·{' '}
                  {parsed.header.length} column{parsed.header.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-[12px]">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {parsed.header.map((h, i) => (
                        <th
                          key={i}
                          className={cn(
                            'border-b border-border-subtle px-2 pb-1.5 font-semibold',
                            numericCols.has(i) ? 'text-right' : 'text-left',
                          )}
                        >
                          {h || <span className="text-slate-300">col {i + 1}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, r) => (
                      <tr key={r}>
                        {parsed.header.map((_, c) => (
                          <td
                            key={c}
                            className={cn(
                              'border-b border-border-subtle px-2 py-1 tabular-nums text-body',
                              numericCols.has(c) ? 'text-right' : 'text-left',
                            )}
                          >
                            {previewCell(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > PREVIEW_ROWS && (
                <p className="mt-2 text-[12px] text-muted">
                  Showing the first {PREVIEW_ROWS} of {parsed.rows.length} rows.
                </p>
              )}
            </div>
          )
        })()}

      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <button type="button" className={btnPrimary} disabled={!parsed} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  )
}
