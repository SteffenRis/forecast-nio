import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { produce } from 'immer'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { compareByQuarter } from '@/lib/quarter'
import type { ActualsRecord } from '@/store/types'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { ActualsGrid } from './ActualsGrid'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'

const cloneActuals = (a: ActualsRecord[]): ActualsRecord[] => structuredClone(a)

export function ActualsPage() {
  const navigate = useNavigate()
  const fundOrder = useStore((s) => s.fundOrder)
  const funds = useStore((s) => s.funds)
  const setFundActuals = useStore((s) => s.setFundActuals)
  const select = useStore((s) => s.select)

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedFundId
    return sel && st.fundOrder.includes(sel) ? sel : (st.fundOrder[0] ?? '')
  })

  // View preference: persists across fund switches (the grid remounts per fund).
  const [showMetrics, setShowMetrics] = useState(false)

  const effectiveId = fundOrder.includes(activeId) ? activeId : (fundOrder[0] ?? '')
  const fund = effectiveId ? funds[effectiveId] : undefined

  // Local working copy of the fund's actuals: edits stage here until Save.
  const [draft, setDraft] = useState<ActualsRecord[]>(() => (fund ? cloneActuals(fund.actuals) : []))
  useEffect(() => {
    const f = useStore.getState().funds[effectiveId]
    setDraft(f ? cloneActuals(f.actuals) : [])
  }, [effectiveId])

  const stored = fund?.actuals ?? []
  const dirty = !!fund && JSON.stringify(draft) !== JSON.stringify(stored)

  const update = useCallback((recipe: (d: ActualsRecord[]) => void) => {
    setDraft((prev) => produce(prev, recipe))
  }, [])

  const confirmIfDirty = () => !dirty || window.confirm('You have unsaved changes. Discard them?')

  function choose(id: string) {
    if (!confirmIfDirty()) return
    setActiveId(id)
    select({ selectedFundId: id || undefined })
  }

  function onSave() {
    if (fund) setFundActuals(fund.id, [...draft].sort(compareByQuarter))
  }
  function onDiscard() {
    setDraft(fund ? cloneActuals(fund.actuals) : [])
  }

  return (
    <RoutePlaceholder navId="actuals">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Actuals</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Record realized data per quarter — contributed, distributed, recallable distributions
            and NAV. The forecast anchors to your latest actual; edits stage below until you Save.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/actuals/import')}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50"
        >
          <Upload className="size-3.5" strokeWidth={2.25} />
          Import CSV
        </button>
      </div>

      {fundOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">Create a fund first</p>
            <p className="mt-1 text-[13px] text-muted">
              Actuals are recorded against a fund. Add one on the Funds screen, then come back to
              enter its quarterly data.
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
              aria-label="Select fund"
            >
              {fundOrder.map((id) => (
                <option key={id} value={id}>
                  {funds[id]?.name}
                </option>
              ))}
            </select>
          </div>

          {fund && (
            <ActualsGrid
              key={fund.id}
              fund={fund}
              rows={draft}
              update={update}
              dirty={dirty}
              showMetrics={showMetrics}
              onToggleMetrics={setShowMetrics}
              onSave={onSave}
              onDiscard={onDiscard}
            />
          )}
        </>
      )}
    </RoutePlaceholder>
  )
}
