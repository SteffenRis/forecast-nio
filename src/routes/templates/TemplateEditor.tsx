import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { ASSET_CLASSES } from '@/lib/assetClass'
import { MAX_FUND_LIFE, MIN_FUND_LIFE, applyFundLife } from '@/lib/curves'
import type { AssetClass, Template } from '@/store/types'
import { NumberInput } from '@/components/common/NumberInput'
import { CaseGrid } from './CaseGrid'

const textField =
  'h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-body">{label}</span>
      {children}
    </label>
  )
}

interface Props {
  template: Template
  update: (recipe: (d: Template) => void) => void
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}

export function TemplateEditor({ template, update, dirty, onSave, onDiscard }: Props) {
  const [activeCaseId, setActiveCaseId] = useState(template.baseScenarioId)

  // Cmd/Ctrl+S saves when there are pending changes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, onSave])

  const activeId = template.scenarioOrder.includes(activeCaseId)
    ? activeCaseId
    : template.baseScenarioId
  const activeScenario = template.scenarios[activeId]

  return (
    <div className="mt-5 space-y-5">
      {/* Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-border-default bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
        <span
          className={cn(
            'flex items-center gap-2 text-[13px] font-medium',
            dirty ? 'text-body' : 'text-muted',
          )}
        >
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              dirty ? 'bg-amber-500' : 'bg-positive',
            )}
          />
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!dirty}
            className="rounded-md border border-border-default bg-white px-3 py-1.5 text-[13px] font-medium text-body hover:bg-slate-50 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty}
            className="rounded-md bg-brand-navy px-4 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border-default bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name">
              <input
                className={textField}
                value={template.name}
                onChange={(e) =>
                  update((d) => {
                    d.name = e.target.value
                  })
                }
              />
            </Field>
          </div>
          <Field label="Asset class">
            <select
              className={cn(textField, 'pr-8')}
              value={template.assetClass}
              onChange={(e) =>
                update((d) => {
                  d.assetClass = e.target.value as AssetClass
                })
              }
            >
              {ASSET_CLASSES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fund life">
            <div className="flex items-center gap-2">
              <StepButton
                label="Decrease fund life"
                disabled={template.fundLifeYears <= MIN_FUND_LIFE}
                onClick={() => update((d) => applyFundLife(d, template.fundLifeYears - 1))}
              >
                −
              </StepButton>
              <NumberInput
                value={template.fundLifeYears}
                onCommit={(v) => update((d) => applyFundLife(d, v))}
                ariaLabel="Fund life in years"
                align="left"
                className="w-14 text-center"
              />
              <StepButton
                label="Increase fund life"
                disabled={template.fundLifeYears >= MAX_FUND_LIFE}
                onClick={() => update((d) => applyFundLife(d, template.fundLifeYears + 1))}
              >
                +
              </StepButton>
              <span className="text-[12px] text-muted">
                years ({MIN_FUND_LIFE}–{MAX_FUND_LIFE})
              </span>
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                className={cn(textField, 'h-auto min-h-[64px] resize-y py-2')}
                value={template.description}
                placeholder="Optional notes about this curve set…"
                onChange={(e) =>
                  update((d) => {
                    d.description = e.target.value
                  })
                }
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Cases */}
      <div className="rounded-xl border border-border-default bg-white p-5 shadow-sm">
        <div className="mb-4 inline-flex rounded-lg border border-border-default bg-slate-50 p-0.5">
          {template.scenarioOrder.map((id) => {
            const scn = template.scenarios[id]
            const active = id === activeId
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCaseId(id)}
                className={cn(
                  'rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                  active ? 'bg-white text-body shadow-xs' : 'text-muted hover:text-body',
                )}
              >
                {scn.name}
              </button>
            )
          })}
        </div>

        {activeScenario && (
          <CaseGrid
            scenario={activeScenario}
            fundLifeYears={template.fundLifeYears}
            update={update}
          />
        )}
      </div>
    </div>
  )
}

function StepButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-md border border-border-default bg-white text-[15px] leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
