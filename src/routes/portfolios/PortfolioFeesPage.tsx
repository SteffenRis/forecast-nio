import { useCallback, useEffect, useState } from 'react'
import { produce } from 'immer'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import type { Portfolio } from '@/store/types'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { PortfolioFeesEditor, type FeesDraft } from './PortfolioFeesEditor'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const secondaryBtn =
  'flex items-center gap-1.5 rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50'

/** Stage just the fee-related slice of a portfolio (a deep-ish copy so edits don't
 *  touch the stored object until Save). */
function draftOf(p: Portfolio): FeesDraft {
  return {
    size: p.size,
    effectiveDate: p.effectiveDate,
    investmentPeriodEndDate: p.investmentPeriodEndDate,
    overlay: p.overlay ? { ...p.overlay } : null,
  }
}

export function PortfolioFeesPage() {
  const portfolioOrder = useStore((s) => s.portfolioOrder)
  const portfolios = useStore((s) => s.portfolios)
  const updatePortfolio = useStore((s) => s.updatePortfolio)
  const setOverlay = useStore((s) => s.setOverlay)
  const select = useStore((s) => s.select)
  const navigate = useNavigate()

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedPortfolioId
    return sel && st.portfolioOrder.includes(sel) ? sel : (st.portfolioOrder[0] ?? '')
  })

  const effectiveId = portfolioOrder.includes(activeId) ? activeId : (portfolioOrder[0] ?? '')
  const stored = effectiveId ? portfolios[effectiveId] : undefined

  // Local working copy: edits stage here until Save. Reloads when the selection changes.
  const [draft, setDraft] = useState<FeesDraft | null>(() => (stored ? draftOf(stored) : null))
  useEffect(() => {
    const p = useStore.getState().portfolios[effectiveId]
    setDraft(p ? draftOf(p) : null)
  }, [effectiveId])

  const dirty = !!draft && !!stored && JSON.stringify(draft) !== JSON.stringify(draftOf(stored))

  const update = useCallback((recipe: (d: FeesDraft) => void) => {
    setDraft((prev) => (prev ? produce(prev, recipe) : prev))
  }, [])

  const confirmIfDirty = () => !dirty || window.confirm('You have unsaved changes. Discard them?')

  function choose(id: string) {
    if (!confirmIfDirty()) return
    setActiveId(id)
    select({ selectedPortfolioId: id || undefined })
  }

  function onBack() {
    if (!confirmIfDirty()) return
    navigate('/portfolios')
  }

  function onSave() {
    if (!draft || !effectiveId) return
    updatePortfolio(effectiveId, {
      size: draft.size,
      effectiveDate: draft.effectiveDate,
      investmentPeriodEndDate: draft.investmentPeriodEndDate,
    })
    setOverlay(effectiveId, draft.overlay)
  }
  function onDiscard() {
    setDraft(stored ? draftOf(stored) : null)
  }

  return (
    <RoutePlaceholder navId="portfolios">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Portfolio fees</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            The LP overlay the fund-of-funds charges its own investors, on top of the underlying
            funds' fees. Edits stage below until you Save.
          </p>
        </div>
        <button type="button" className={secondaryBtn} onClick={onBack}>
          <ArrowLeft className="size-3.5" strokeWidth={2.25} />
          Back to portfolio
        </button>
      </div>

      {portfolioOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No portfolios yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create a portfolio on the Portfolios screen first, then set its fee overlay here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select
              className={cn(fieldCls, 'min-w-[220px] pr-8')}
              value={effectiveId}
              onChange={(e) => choose(e.target.value)}
              aria-label="Select portfolio"
            >
              {portfolioOrder.map((id) => (
                <option key={id} value={id}>
                  {portfolios[id]?.name}
                </option>
              ))}
            </select>
          </div>

          {draft && stored && (
            <PortfolioFeesEditor
              key={effectiveId}
              draft={draft}
              currency={stored.reportingCurrency}
              update={update}
              dirty={dirty}
              onSave={onSave}
              onDiscard={onDiscard}
            />
          )}
        </>
      )}
    </RoutePlaceholder>
  )
}
