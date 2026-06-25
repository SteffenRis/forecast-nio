import { cn } from '@/lib/cn'
import type { IsoDate } from '@/store/types'

interface DateInputProps {
  /** ISO 'YYYY-MM-DD', or undefined when empty/clearable. */
  value?: IsoDate
  onCommit: (value: IsoDate | undefined) => void
  ariaLabel?: string
  className?: string
}

/** Thin wrapper over the native date picker. The control's value is already ISO
 *  'YYYY-MM-DD', so no parse layer is needed; an empty field commits `undefined`. */
export function DateInput({ value, onCommit, ariaLabel, className }: DateInputProps) {
  return (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onCommit(e.target.value || undefined)}
      className={cn(
        'h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
        className,
      )}
    />
  )
}
