import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { parseNumberInput } from '@/lib/format'

interface NumberInputProps {
  value: number | undefined
  onCommit: (value: number) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
  align?: 'left' | 'right'
  /** When set, the field shows the value rounded to this many decimals while not
   *  focused, and the full-precision value once focused for editing. */
  decimals?: number
}

/** Controlled numeric field with a local string draft. Commits on blur / Enter;
 *  Escape reverts. Shows a rounded display (when `decimals` is set) at rest and the
 *  full value while editing, so the user always edits the true number. */
export function NumberInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
  align = 'right',
  decimals,
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => toDisplay(value, decimals))
  const [editing, setEditing] = useState(false)

  // Reflect external changes (e.g. Generate / Re-apply) while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(toDisplay(value, decimals))
  }, [value, editing, decimals])

  function commit() {
    const n = parseNumberInput(draft)
    if (n !== null) onCommit(n)
    else setDraft(toDisplay(value, decimals)) // revert invalid/empty
    setEditing(false)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        setEditing(true)
        setDraft(toFull(value)) // reveal full precision for editing
        const el = e.currentTarget
        requestAnimationFrame(() => {
          try {
            el.select()
          } catch {
            // element may have unmounted; ignore
          }
        })
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(toDisplay(value, decimals))
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
      className={cn(
        'h-7 w-full rounded-md border border-border-default bg-white px-2 text-[13px] tabular-nums outline-none placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    />
  )
}

/** Full-precision string for editing. */
function toFull(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? '' : String(value)
}

/** At-rest display: rounded to `decimals` if given, else the raw value. */
function toDisplay(value: number | undefined, decimals: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return ''
  return decimals === undefined ? String(value) : value.toFixed(decimals)
}
