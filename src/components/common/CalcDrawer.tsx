import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Drawer } from './Drawer'
import type { Explanation } from '@/lib/explain'

interface Props<R> {
  /** The clicked number, or null when the drawer is closed. */
  selected: R | null
  /** Builds the explanation for a given cell reference (pure). */
  build: (ref: R) => Explanation<R>
  onClose: () => void
}

/** The generic calculation-trace drawer: renders the explanation for the clicked
 *  number, with drill-down (steps that reference a child number) and a back-stack.
 *  Reused across screens — each passes its own `build` + cell-reference type R. */
export function CalcDrawer<R>({ selected, build, onClose }: Props<R>) {
  const [stack, setStack] = useState<R[]>([])

  // A new selection resets the drill stack. (Kept while closing so the content
  // persists through the slide-out.)
  useEffect(() => {
    if (selected) setStack([selected])
  }, [selected])

  const current = stack.length ? stack[stack.length - 1] : null
  const explanation = current ? build(current) : null

  const push = (ref: R) => setStack((s) => [...s, ref])
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  return (
    <Drawer
      open={!!selected}
      onClose={onClose}
      ariaLabel="Calculation detail"
      lead={
        stack.length > 1 ? (
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-slate-50 hover:text-body"
          >
            <ChevronLeft className="size-4" strokeWidth={2.25} />
          </button>
        ) : undefined
      }
      title={explanation?.title ?? ''}
    >
      {explanation && (
        <>
          <div className="mb-4">
            <p className="text-2xl font-bold tabular-nums text-body">{explanation.value}</p>
            {explanation.subtitle && (
              <p className="mt-0.5 text-[12px] text-muted">{explanation.subtitle}</p>
            )}
          </div>

          {explanation.formula && (
            <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-600">
              {explanation.formula}
            </div>
          )}

          <div>
            {explanation.steps.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start justify-between gap-3 py-1.5',
                  s.emphasis && 'mt-1 border-t border-border-default pt-2 font-semibold',
                )}
              >
                <div className="min-w-0">
                  {s.ref ? (
                    <button
                      type="button"
                      onClick={() => s.ref !== undefined && push(s.ref)}
                      className="group inline-flex items-center gap-1 text-left text-[13px] font-medium text-brand-navy"
                    >
                      <span className="underline-offset-2 group-hover:underline">{s.label}</span>
                      <ChevronRight className="size-3 text-slate-400" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <span className="text-[13px] text-body">{s.label}</span>
                  )}
                  {s.note && <p className="mt-0.5 text-[11px] leading-snug text-muted">{s.note}</p>}
                </div>
                {s.value !== undefined && (
                  <span
                    className={cn(
                      'shrink-0 tabular-nums text-[13px]',
                      s.emphasis ? 'text-body' : 'text-muted',
                    )}
                  >
                    {s.value}
                  </span>
                )}
              </div>
            ))}
          </div>

          {explanation.breakdown && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {explanation.breakdown.columns.map((c, i) => (
                      <th
                        key={i}
                        className={cn('pb-2 font-semibold', i === 0 ? 'text-left pr-3' : 'px-1.5 text-right')}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {explanation.breakdown.rows.map((r, ri) => (
                    <tr key={ri} className={cn(r.emphasis && 'font-semibold')}>
                      {r.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            'py-1.5',
                            ci === 0 ? 'pr-3 text-left text-body' : 'px-1.5 text-right tabular-nums',
                            ci === 0 ? '' : r.emphasis ? 'text-body' : 'text-muted',
                            r.emphasis && 'border-t border-border-default pt-2',
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {explanation.checks.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Checks
              </h4>
              <div className="space-y-2.5">
                {explanation.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-px grid size-4 shrink-0 place-items-center rounded-full',
                        c.pass ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative',
                      )}
                    >
                      {c.pass ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : (
                        <XIcon className="size-3" strokeWidth={3} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-body">{c.label}</p>
                      <p className="text-[11px] leading-snug text-muted">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Drawer>
  )
}
