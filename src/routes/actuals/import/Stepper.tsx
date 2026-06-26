import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

const STEPS = ['Upload', 'Map', 'Edit', 'Confirm'] as const

/** Linear 1·2·3·4 progress indicator for the import wizard. `current` is 1-based. */
export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mt-5 flex items-center gap-2 text-[13px]">
      {STEPS.map((label, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-[11px] font-semibold',
                done && 'bg-brand-navy text-white',
                active && 'bg-brand-navy text-white',
                !done && !active && 'border border-border-default bg-white text-muted',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={2.5} /> : step}
            </span>
            <span className={cn('font-medium', active ? 'text-body' : 'text-muted')}>{label}</span>
            {step < STEPS.length && <span className="mx-1 h-px w-8 bg-border-default" />}
          </li>
        )
      })}
    </ol>
  )
}
