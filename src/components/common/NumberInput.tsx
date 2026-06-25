import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatNumericInput, groupThousands, parseNumberInput } from '@/lib/format'

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
 *  full value while editing, so the user always edits the true number. Integers are
 *  grouped with thousand separators both at rest and live as the user types. */
export function NumberInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
  align = 'right',
  decimals,
}: NumberInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  // Digits-before-caret to restore after a grouped reformat shifts the string.
  const caretRef = useRef<number | null>(null)
  const [draft, setDraft] = useState(() => toDisplay(value, decimals))
  const [editing, setEditing] = useState(false)

  // Reflect external changes (e.g. Generate / Re-apply) while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(toDisplay(value, decimals))
  }, [value, editing, decimals])

  // After grouping reflows the string, restore the caret to the same digit offset.
  useLayoutEffect(() => {
    const el = ref.current
    if (caretRef.current === null || !el) return
    const pos = caretFromValueCount(draft, caretRef.current)
    el.setSelectionRange(pos, pos)
    caretRef.current = null
  }, [draft])

  function commit() {
    const n = parseNumberInput(draft)
    if (n !== null) onCommit(n)
    else setDraft(toDisplay(value, decimals)) // revert invalid/empty
    setEditing(false)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        setEditing(true)
        setDraft(toFull(value)) // reveal full precision (still grouped) for editing
        const el = e.currentTarget
        requestAnimationFrame(() => {
          try {
            el.select()
          } catch {
            // element may have unmounted; ignore
          }
        })
      }}
      onChange={(e) => {
        const el = e.currentTarget
        const raw = el.value
        const sel = el.selectionStart ?? raw.length
        caretRef.current = countValueChars(raw.slice(0, sel))
        setDraft(formatNumericInput(raw))
      }}
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

/** Full-precision string for editing, grouped with thousand separators. */
function toFull(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? '' : groupThousands(String(value))
}

/** At-rest display: rounded to `decimals` if given, else the raw value; grouped. */
function toDisplay(value: number | undefined, decimals: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return ''
  return groupThousands(decimals === undefined ? String(value) : value.toFixed(decimals))
}

/** Count value-significant chars (everything but the inserted commas). */
function countValueChars(s: string): number {
  let n = 0
  for (const c of s) if (c !== ',') n++
  return n
}

/** Index in `formatted` just past the Nth value-significant char (skipping commas). */
function caretFromValueCount(formatted: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') {
      seen++
      if (seen === count) return i + 1
    }
  }
  return formatted.length
}
