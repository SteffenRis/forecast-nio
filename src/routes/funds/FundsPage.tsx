import { useCallback, useEffect, useState } from 'react'
import { produce } from 'immer'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import type { Fund } from '@/store/types'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { Tabs } from '@/components/common/Tabs'
import { FundEditor } from './FundEditor'
import { FundFeesOverview } from './FundFeesOverview'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const primaryBtn =
  'shrink-0 rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40'
const secondaryBtn =
  'rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50'

const clone = (f: Fund): Fund => structuredClone(f)

export function FundsPage() {
  const fundOrder = useStore((s) => s.fundOrder)
  const funds = useStore((s) => s.funds)
  const templateOrder = useStore((s) => s.templateOrder)
  const templates = useStore((s) => s.templates)
  const addFund = useStore((s) => s.addFund)
  const duplicateFund = useStore((s) => s.duplicateFund)
  const removeFund = useStore((s) => s.removeFund)
  const upsertFund = useStore((s) => s.upsertFund)
  const select = useStore((s) => s.select)

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedFundId
    return sel && st.fundOrder.includes(sel) ? sel : (st.fundOrder[0] ?? '')
  })
  const [tab, setTab] = useState<'terms' | 'fees'>('terms')

  const effectiveId = fundOrder.includes(activeId) ? activeId : (fundOrder[0] ?? '')
  const stored = effectiveId ? funds[effectiveId] : undefined

  // Local working copy: edits stage here until Save. Reloads when the selection changes.
  const [draft, setDraft] = useState<Fund | null>(() => (stored ? clone(stored) : null))
  useEffect(() => {
    setDraft(stored ? clone(stored) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId])

  const draftStored = draft ? funds[draft.id] : undefined
  const dirty = !!draft && !!draftStored && JSON.stringify(draft) !== JSON.stringify(draftStored)

  const update = useCallback((recipe: (d: Fund) => void) => {
    setDraft((prev) => (prev ? produce(prev, recipe) : prev))
  }, [])

  const confirmIfDirty = () => !dirty || window.confirm('You have unsaved changes. Discard them?')

  function go(id: string) {
    setActiveId(id)
    select({ selectedFundId: id || undefined })
  }
  function choose(id: string) {
    if (!confirmIfDirty()) return
    go(id)
  }
  function onNew() {
    if (!confirmIfDirty()) return
    const templateId = templateOrder[0]
    if (!templateId) return
    go(addFund(templateId))
  }
  function onDuplicate() {
    if (!effectiveId || !confirmIfDirty()) return
    const id = duplicateFund(effectiveId)
    if (id) go(id)
  }
  function onDelete() {
    if (!effectiveId) return
    const name = funds[effectiveId]?.name ?? 'this fund'
    if (!window.confirm(`Delete "${name}"? This cannot be undone (export first).`)) return
    removeFund(effectiveId)
    go(useStore.getState().fundOrder[0] ?? '')
  }

  function onSave() {
    if (draft) upsertFund(draft)
  }
  function onDiscard() {
    setDraft(draftStored ? clone(draftStored) : null)
  }

  const noTemplates = templateOrder.length === 0

  return (
    <RoutePlaceholder navId="funds">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Edit fund</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Each fund forecasts against a template, with its own commitment, dates, fee terms
            and carry. Edits stage below until you Save.
          </p>
        </div>
        <button type="button" className={primaryBtn} onClick={onNew} disabled={noTemplates}>
          New fund
        </button>
      </div>

      {noTemplates ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">Create a template first</p>
            <p className="mt-1 text-[13px] text-muted">
              A fund forecasts against a curve-set template. Add one on the Templates screen,
              then come back to model a fund.
            </p>
          </div>
        </div>
      ) : fundOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No funds yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create your first fund to start forecasting liquidity.
            </p>
            <button type="button" className={cn(primaryBtn, 'mt-4')} onClick={onNew}>
              New fund
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select
              className={cn(fieldCls, 'min-w-[220px] pr-8')}
              value={effectiveId}
              onChange={(e) => choose(e.target.value)}
              aria-label="Select fund"
            >
              {fundOrder.map((id) => (
                <option key={id} value={id}>
                  {funds[id]?.name}
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

          <div className="mt-4">
            <Tabs
              ariaLabel="Fund view"
              tabs={[
                { id: 'terms', label: 'Terms' },
                { id: 'fees', label: 'Fees' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'terms' && draft && (
            <FundEditor
              key={draft.id}
              fund={draft}
              templates={templates}
              templateOrder={templateOrder}
              update={update}
              dirty={dirty}
              onSave={onSave}
              onDiscard={onDiscard}
            />
          )}
          {tab === 'fees' && effectiveId && (
            <FundFeesOverview fundId={effectiveId} dirty={dirty} />
          )}
        </>
      )}
    </RoutePlaceholder>
  )
}
