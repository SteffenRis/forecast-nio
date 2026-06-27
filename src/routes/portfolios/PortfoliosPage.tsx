import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Percent } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { KebabMenu } from '@/components/common/KebabMenu'
import { PortfolioEditor } from './PortfolioEditor'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const primaryBtn =
  'shrink-0 rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40'
const secondaryBtn =
  'rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50'

export function PortfoliosPage() {
  const portfolioOrder = useStore((s) => s.portfolioOrder)
  const portfolios = useStore((s) => s.portfolios)
  const addPortfolio = useStore((s) => s.addPortfolio)
  const duplicatePortfolio = useStore((s) => s.duplicatePortfolio)
  const removePortfolio = useStore((s) => s.removePortfolio)
  const select = useStore((s) => s.select)
  const navigate = useNavigate()

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedPortfolioId
    return sel && st.portfolioOrder.includes(sel) ? sel : (st.portfolioOrder[0] ?? '')
  })

  const effectiveId = portfolioOrder.includes(activeId) ? activeId : (portfolioOrder[0] ?? '')

  // The LP-overlay fee editor lives on its own page; the kebab selects this portfolio
  // and navigates there (mirrors the Funds-screen kebab → Edit-fund sub-page).
  function openFees() {
    select({ selectedPortfolioId: effectiveId || undefined })
    navigate('/portfolios/fees')
  }

  // Live editing (no draft): the slice's granular actions write through to the store,
  // and the pro-rata roll-up recomputes from the committed state as you type.
  function go(id: string) {
    setActiveId(id)
    select({ selectedPortfolioId: id || undefined })
  }
  function onNew() {
    go(addPortfolio())
  }
  function onDuplicate() {
    if (!effectiveId) return
    const id = duplicatePortfolio(effectiveId)
    if (id) go(id)
  }
  function onDelete() {
    if (!effectiveId) return
    const name = portfolios[effectiveId]?.name ?? 'this portfolio'
    if (!window.confirm(`Delete "${name}"? This cannot be undone (export first).`)) return
    removePortfolio(effectiveId)
    go(useStore.getState().portfolioOrder[0] ?? '')
  }

  return (
    <RoutePlaceholder navId="portfolios">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Portfolios</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            A portfolio is a fund-of-funds: commit capital to funds already in the system, and it
            receives a pro-rata share of their cash flows. Changes save automatically.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={primaryBtn} onClick={onNew}>
            New portfolio
          </button>
          {effectiveId && (
            <KebabMenu
              ariaLabel="Portfolio actions"
              items={[{ label: 'Portfolio fees', icon: Percent, onClick: openFees }]}
            />
          )}
        </div>
      </div>

      {portfolioOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No portfolios yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create your first portfolio, then commit capital to the funds it should hold.
            </p>
            <button type="button" className={cn(primaryBtn, 'mt-4')} onClick={onNew}>
              New portfolio
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select
              className={cn(fieldCls, 'min-w-[220px] pr-8')}
              value={effectiveId}
              onChange={(e) => go(e.target.value)}
              aria-label="Select portfolio"
            >
              {portfolioOrder.map((id) => (
                <option key={id} value={id}>
                  {portfolios[id]?.name}
                </option>
              ))}
            </select>
            <button type="button" className={secondaryBtn} onClick={onDuplicate}>
              Duplicate
            </button>
            <button
              type="button"
              className={cn(secondaryBtn, 'text-negative hover:bg-red-50')}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>

          <PortfolioEditor key={effectiveId} portfolioId={effectiveId} />
        </>
      )}
    </RoutePlaceholder>
  )
}
