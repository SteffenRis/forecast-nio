import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ConfirmDeleteDialogProps {
  open: boolean
  /** What is being deleted, e.g. "Q2 2024" — shown in the heading. */
  itemLabel: string
  /** Word the user must type to arm the destructive action. */
  confirmWord?: string
  description?: string
  onConfirm: () => void
  onCancel: () => void
}

/** A blocking confirmation for irreversible deletes: the user must type a word
 *  (default "Delete") before the destructive button arms. Rendered in a portal so it
 *  sits above the sticky bars and table scroll areas. */
export function ConfirmDeleteDialog({
  open,
  itemLabel,
  confirmWord = 'Delete',
  description,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset and focus the input each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setTyped('')
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Escape cancels.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const armed = typed === confirmWord

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Delete ${itemLabel}`}
        className="w-full max-w-md rounded-xl border border-border-default bg-white p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-negative">
            <TriangleAlert className="size-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-body">Delete {itemLabel}?</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {description ??
                `This permanently removes the ${itemLabel} actuals row. This cannot be undone — export your dataset first if you might need it back.`}
            </p>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[12px] text-muted">
            Type <span className="font-semibold text-negative">{confirmWord}</span> to confirm
          </span>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && armed) onConfirm()
            }}
            placeholder={confirmWord}
            aria-label={`Type ${confirmWord} to confirm`}
            autoComplete="off"
            className="h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-default bg-white px-3 py-1.5 text-[13px] font-medium text-body hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!armed}
            className={cn(
              'rounded-md bg-negative px-4 py-1.5 text-[13px] font-semibold text-white hover:opacity-90',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            Delete {itemLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
