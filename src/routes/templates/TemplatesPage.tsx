import { useCallback, useEffect, useState } from 'react'
import { produce } from 'immer'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import type { Template } from '@/store/types'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { TemplateEditor } from './TemplateEditor'

const fieldCls =
  'h-9 rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const primaryBtn =
  'shrink-0 rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90'
const secondaryBtn =
  'rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50'

const clone = (t: Template): Template => structuredClone(t)

export function TemplatesPage() {
  const templateOrder = useStore((s) => s.templateOrder)
  const templates = useStore((s) => s.templates)
  const addTemplate = useStore((s) => s.addTemplate)
  const duplicateTemplate = useStore((s) => s.duplicateTemplate)
  const removeTemplate = useStore((s) => s.removeTemplate)
  const upsertTemplate = useStore((s) => s.upsertTemplate)
  const select = useStore((s) => s.select)

  const [activeId, setActiveId] = useState<string>(() => {
    const st = useStore.getState()
    const sel = st.ui.selectedTemplateId
    return sel && st.templateOrder.includes(sel) ? sel : (st.templateOrder[0] ?? '')
  })

  const effectiveId = templateOrder.includes(activeId) ? activeId : (templateOrder[0] ?? '')
  const stored = effectiveId ? templates[effectiveId] : undefined

  // Local working copy: edits stage here until Save. Reloads when the selection changes.
  const [draft, setDraft] = useState<Template | null>(() => (stored ? clone(stored) : null))
  useEffect(() => {
    setDraft(stored ? clone(stored) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId])

  const draftStored = draft ? templates[draft.id] : undefined
  const dirty = !!draft && !!draftStored && JSON.stringify(draft) !== JSON.stringify(draftStored)

  const update = useCallback((recipe: (d: Template) => void) => {
    setDraft((prev) => (prev ? produce(prev, recipe) : prev))
  }, [])

  const confirmIfDirty = () =>
    !dirty || window.confirm('You have unsaved changes. Discard them?')

  function go(id: string) {
    setActiveId(id)
    select({ selectedTemplateId: id || undefined })
  }
  function choose(id: string) {
    if (!confirmIfDirty()) return
    go(id)
  }
  function onNew() {
    if (!confirmIfDirty()) return
    go(addTemplate())
  }
  function onDuplicate() {
    if (!effectiveId || !confirmIfDirty()) return
    const id = duplicateTemplate(effectiveId)
    if (id) go(id)
  }
  function onDelete() {
    if (!effectiveId) return
    const name = templates[effectiveId]?.name ?? 'this template'
    if (!window.confirm(`Delete "${name}"? This cannot be undone (export first).`)) return
    removeTemplate(effectiveId)
    go(useStore.getState().templateOrder[0] ?? '')
  }

  function onSave() {
    if (draft) upsertTemplate(draft)
  }
  function onDiscard() {
    setDraft(draftStored ? clone(draftStored) : null)
  }

  return (
    <RoutePlaceholder navId="templates">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Templates</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Reusable PIC / DPI / TVPI curve sets. Each template has four cases —
            Low-low · Low · Base · High — that funds forecast against.
          </p>
        </div>
        <button type="button" className={primaryBtn} onClick={onNew}>
          New template
        </button>
      </div>

      {templateOrder.length === 0 ? (
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
          <div className="max-w-sm px-6">
            <p className="text-sm font-semibold text-body">No templates yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create your first curve-set template to start modelling funds.
            </p>
            <button type="button" className={cn(primaryBtn, 'mt-4')} onClick={onNew}>
              New template
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
              aria-label="Select template"
            >
              {templateOrder.map((id) => (
                <option key={id} value={id}>
                  {templates[id]?.name}
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

          {draft && (
            <TemplateEditor
              key={draft.id}
              template={draft}
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
