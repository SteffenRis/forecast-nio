import { useEffect, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface KebabItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
}

/** A small "⋮" overflow menu. Closes on outside-click, Escape, or item select.
 *  Anchored to the trigger (right-aligned). */
export function KebabMenu({
  items,
  ariaLabel = 'More actions',
}: {
  items: KebabItem[]
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'grid size-9 place-items-center rounded-md border border-border-default bg-white text-muted hover:bg-slate-50 hover:text-body',
          open && 'bg-slate-50 text-body',
        )}
      >
        <EllipsisVertical className="size-4" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-lg border border-border-default bg-white py-1 shadow-md"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-body hover:bg-slate-50"
            >
              {it.icon && <it.icon className="size-4 shrink-0 text-muted" strokeWidth={2} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
