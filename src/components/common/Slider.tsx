import { cn } from '@/lib/cn'

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

/**
 * A small controlled range slider (brand-navy accent). Fires onChange
 * continuously while dragging — cheap here since callers only stage a local
 * draft. Pair with a live readout for the current value.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  disabled,
  className,
}: SliderProps) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-navy outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    />
  )
}
