import { FIELDS, type CanonicalField, type ColumnMapping } from '@/lib/csv/columnMapping'
import { selectCls } from './styles'

interface Props {
  header: string[]
  mapping: ColumnMapping
  onChange: (field: CanonicalField, colIndex: number | null) => void
}

/** Step 2a: bind each canonical actuals field to a CSV column. Auto-detected values
 *  arrive pre-selected; the user can re-point any field or set it to "Not mapped". */
export function ColumnMapTable({ header, mapping, onChange }: Props) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columns</h3>
      <p className="mt-0.5 text-[12px] text-muted">
        We matched these from your header row. Adjust any that look wrong.
      </p>
      <div className="mt-3 space-y-2">
        {FIELDS.map((f) => {
          const value = mapping[f.key]
          const missingRequired = f.required && value === null
          return (
            <div key={f.key} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <span className="text-[13px] font-medium text-body">{f.label}</span>
                {f.required ? (
                  <span className="ml-1 text-[11px] text-negative">*</span>
                ) : (
                  <span className="ml-1 text-[11px] text-slate-400">optional</span>
                )}
              </div>
              <select
                className={selectCls + ' min-w-[220px]'}
                value={value === null ? '' : String(value)}
                onChange={(e) => onChange(f.key, e.target.value === '' ? null : Number(e.target.value))}
                aria-label={`Column for ${f.label}`}
              >
                <option value="">— Not mapped —</option>
                {header.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `col ${i + 1}`}
                  </option>
                ))}
              </select>
              {missingRequired && <span className="text-[12px] text-negative">Required</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
