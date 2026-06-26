import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  /** Optional left-of-title control, e.g. a back button. */
  lead?: React.ReactNode
  children: React.ReactNode
  ariaLabel?: string
}

// Stack of open drawers so a single Escape closes only the topmost (nested drawers,
// e.g. a calc-trace opened from a lookthrough drawer, peel off one layer at a time).
const openStack: symbol[] = []

/** A large right-side slide-in panel. Rendered in a portal above everything, with a
 *  scrim, Escape + click-outside to close, and a slide transition on open/close.
 *  Mirrors ConfirmDeleteDialog's portal conventions. */
export function Drawer({ open, onClose, title, lead, children, ariaLabel }: DrawerProps) {
  // Drives the enter/exit transition: mount → animate in; close → animate out, then unmount.
  const [shown, setShown] = useState(false)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const id = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const token = Symbol('drawer')
    openStack.push(token)
    function onKey(e: KeyboardEvent) {
      // Only the topmost open drawer responds to Escape.
      if (e.key === 'Escape' && openStack[openStack.length - 1] === token) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = openStack.indexOf(token)
      if (i >= 0) openStack.splice(i, 1)
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300',
        shown ? 'opacity-100' : 'opacity-0',
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'fixed right-0 top-0 flex h-full w-[560px] max-w-[92vw] flex-col border-l border-border-default bg-white shadow-xl transition-transform duration-300',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center gap-2 border-b border-border-default px-5 py-3.5">
          {lead}
          <div className="min-w-0 flex-1 text-sm font-semibold text-body">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-slate-50 hover:text-body"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
