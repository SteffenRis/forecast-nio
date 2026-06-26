import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  id: T
  label: string
}

interface Props<T extends string> {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
  className?: string
}

/** A small segmented control. The app is route-based and had no tab UI; this is the
 *  shared primitive for in-page tabs (first used by the Funds screen's Terms / Fees
 *  split). Styled with the design tokens — slate track, white active pill. */
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel, className }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-border-default bg-slate-50 p-1',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              active
                ? 'bg-white text-brand-navy shadow-sm'
                : 'text-muted hover:text-body',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
