import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { currencySymbol } from '@/lib/currency'
import { FEE_BASES } from '@/lib/feeBasis'
import { DEFAULT_OVERLAY } from '@/store/slices/portfoliosSlice'
import type { FeeBasis, FxPolicy, IsoDate, OverlayParams } from '@/store/types'
import { NumberInput } from '@/components/common/NumberInput'
import { DateInput } from '@/components/common/DateInput'
import { Toggle } from '@/components/common/Toggle'

const textField =
  'h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const selectField = cn(textField, 'pr-8')
const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const grid2 = 'grid grid-cols-1 gap-4 sm:grid-cols-2'

type BasisKey = 'mgmtBasisIp' | 'mgmtBasisPostIp' | 'expenseBasisIp' | 'expenseBasisPostIp'

/** The fee-related slice of a portfolio that this editor stages and saves. The portfolio
 *  dates + size live on `Portfolio` (written via `updatePortfolio`); the overlay is the
 *  whole `OverlayParams | null` (written via `setOverlay`). */
export interface FeesDraft {
  size?: number
  effectiveDate?: IsoDate
  investmentPeriodEndDate?: IsoDate
  overlay: OverlayParams | null
}

const FX_POLICIES: { value: FxPolicy; label: string }[] = [
  { value: 'locked', label: 'Locked (establishment-quarter FX)' },
  { value: 'spot', label: 'Spot (per-quarter FX)' },
]

function Field({
  label,
  children,
  helper,
}: {
  label: string
  children: React.ReactNode
  helper?: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {helper && <p className="mt-1 text-[11px] leading-snug text-muted">{helper}</p>}
    </label>
  )
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

/** Percent field: stores a fraction (0.0075), shows a percent (0.75). */
function PercentField({
  label,
  value,
  onCommit,
  helper,
}: {
  label: string
  value: number
  onCommit: (fraction: number) => void
  helper?: React.ReactNode
}) {
  return (
    <Field label={label} helper={helper}>
      <div className="relative">
        <NumberInput
          value={Math.round(value * 1e6) / 1e4}
          onCommit={(pct) => onCommit(pct / 100)}
          ariaLabel={label}
          align="left"
          className="h-9 pr-7"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">
          %
        </span>
      </div>
    </Field>
  )
}

function MoneyField({
  label,
  value,
  currency,
  onCommit,
  helper,
}: {
  label: string
  value: number | undefined
  currency: string
  onCommit: (n: number) => void
  helper?: React.ReactNode
}) {
  return (
    <Field label={label} helper={helper}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">
          {currencySymbol(currency)}
        </span>
        <NumberInput
          value={value}
          onCommit={onCommit}
          ariaLabel={label}
          align="left"
          placeholder="0"
          className="h-9 pl-7"
        />
      </div>
    </Field>
  )
}

interface Props {
  draft: FeesDraft
  /** Reporting currency the overlay's flat fees are charged in. */
  currency: string
  update: (recipe: (d: FeesDraft) => void) => void
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}

export function PortfolioFeesEditor({ draft, currency, update, dirty, onSave, onDiscard }: Props) {
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

  const overlay = draft.overlay

  // Patch one overlay field on the draft (no-op while the overlay is disabled).
  function patchOverlay(patch: Partial<OverlayParams>) {
    update((d) => {
      if (d.overlay) Object.assign(d.overlay, patch)
    })
  }

  // Basis <select> bound to one of the four FeeBasis keys.
  function basisSelect(key: BasisKey, label: string) {
    if (!overlay) return null
    return (
      <Field label={label}>
        <select
          className={selectField}
          value={overlay[key]}
          onChange={(e) => patchOverlay({ [key]: e.target.value as FeeBasis })}
          aria-label={label}
        >
          {FEE_BASES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  const sizeUnset = !draft.size
  const ipBeforeEffective =
    !!draft.effectiveDate &&
    !!draft.investmentPeriodEndDate &&
    draft.investmentPeriodEndDate <= draft.effectiveDate

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
            className={cn('inline-block size-2 rounded-full', dirty ? 'bg-amber-500' : 'bg-positive')}
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

      {/* Master switch */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Portfolio fees (LP overlay)
            </h3>
            <p className="mt-0.5 max-w-2xl text-[12px] text-muted">
              The fee-of-funds GP's own charges, applied on top of the underlying funds' fees to
              get the end-investor's net result. When off, the investor's net (Stage 3) equals the
              funds' aggregated net (Stage 2) — the FoF charges nothing.
            </p>
          </div>
          <Toggle
            checked={overlay != null}
            onChange={(checked) =>
              update((d) => {
                d.overlay = checked ? { ...DEFAULT_OVERLAY } : null
              })
            }
            ariaLabel="Enable LP overlay"
            className="mt-0.5"
          />
        </div>
      </div>

      {overlay && (
        <>
          {/* Commitment basis & fee clock */}
          <div className={card}>
            <SectionHeader
              title="Commitment basis & fee clock"
              sub="The FoF's committed size and the two dates that drive the overlay fee clock."
            />
            <div className={grid2}>
              <MoneyField
                label="Portfolio size"
                value={draft.size}
                currency={currency}
                onCommit={(n) => update((d) => { d.size = n })}
                helper={
                  sizeUnset ? (
                    <span className="text-negative">
                      Set a size — fees & carry on the commitment basis accrue on nothing while
                      it's empty.
                    </span>
                  ) : (
                    'FoF committed capital, in the reporting currency — the commitment fee basis.'
                  )
                }
              />
              <div />
              <Field
                label="Effective date"
                helper="The FoF fee-clock start; the establishment cost is billed in this quarter."
              >
                <DateInput
                  value={draft.effectiveDate}
                  onCommit={(v) => update((d) => { d.effectiveDate = v })}
                  ariaLabel="Effective date"
                />
              </Field>
              <Field
                label="Investment period end"
                helper={
                  ipBeforeEffective ? (
                    <span className="text-negative">Must be after the effective date.</span>
                  ) : (
                    'Switches the management fee & expenses from the IP rate/basis to post-IP.'
                  )
                }
              >
                <DateInput
                  value={draft.investmentPeriodEndDate}
                  onCommit={(v) => update((d) => { d.investmentPeriodEndDate = v })}
                  ariaLabel="Investment period end"
                />
              </Field>
            </div>
          </div>

          {/* Management fees & expenses */}
          <div className={card}>
            <SectionHeader
              title="Management fees & expenses"
              sub="Annual rates, charged quarterly on the selected basis. The management fee and expenses each take an independent basis per period."
            />
            <div className={grid2}>
              <PercentField
                label="Mgmt fee — investment period"
                value={overlay.mgmtRateIp}
                onCommit={(f) => patchOverlay({ mgmtRateIp: f })}
              />
              {basisSelect('mgmtBasisIp', 'Mgmt fee basis — investment period')}
              <PercentField
                label="Mgmt fee — post-IP"
                value={overlay.mgmtRatePostIp}
                onCommit={(f) => patchOverlay({ mgmtRatePostIp: f })}
              />
              {basisSelect('mgmtBasisPostIp', 'Mgmt fee basis — post-IP')}
              <PercentField
                label="Expenses"
                value={overlay.expenseRate}
                onCommit={(f) => patchOverlay({ expenseRate: f })}
                helper="One rate, applied to both the investment period and post-IP."
              />
              <div />
              {basisSelect('expenseBasisIp', 'Expenses basis — investment period')}
              {basisSelect('expenseBasisPostIp', 'Expenses basis — post-IP')}
              <PercentField
                label="Establishment costs (one-time)"
                value={overlay.establishmentRate}
                onCommit={(f) => patchOverlay({ establishmentRate: f })}
                helper="Percentage of portfolio size, charged once at the effective-date quarter."
              />
            </div>
          </div>

          {/* Costs & FX */}
          <div className={card}>
            <SectionHeader
              title="Costs & FX"
              sub="Flat per-investment cost and the FX policy used to value fee bases in the reporting currency."
            />
            <div className={grid2}>
              <MoneyField
                label="Transaction cost per investment"
                value={overlay.txnCostPerInvestment}
                currency={currency}
                onCommit={(n) => patchOverlay({ txnCostPerInvestment: n })}
                helper="Flat amount, charged once per underlying fund at its effective-date quarter."
              />
              <Field
                label="Fee-basis FX policy"
                helper="How per-fund basis stocks convert to the reporting currency."
              >
                <select
                  className={selectField}
                  value={overlay.feeBasisFxPolicy}
                  onChange={(e) => patchOverlay({ feeBasisFxPolicy: e.target.value as FxPolicy })}
                  aria-label="Fee-basis FX policy"
                >
                  {FX_POLICIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Carry & hurdle */}
          <div className={card}>
            <SectionHeader
              title="Carry & hurdle"
              sub="The FoF GP's profit share and the investor's preferred return (European waterfall on aggregated Stage-2 distributions)."
            />
            <div className={grid2}>
              <PercentField
                label="Carry rate"
                value={overlay.carryRate}
                onCommit={(f) => patchOverlay({ carryRate: f })}
                helper="GP share above the hurdle · typical 5%."
              />
              <PercentField
                label="Hurdle (annual)"
                value={overlay.hurdleAnnual}
                onCommit={(f) => patchOverlay({ hurdleAnnual: f })}
                helper="Investor preferred return · typical 8%."
              />
            </div>
            <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-border-default bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-body">GP catch-up</p>
                <p className="mt-0.5 max-w-xl text-[12px] text-muted">
                  After the hurdle clears, the GP catches up to its full carry share before the
                  split resumes.
                </p>
              </div>
              <Toggle
                checked={overlay.catchUp}
                onChange={(checked) => patchOverlay({ catchUp: checked })}
                ariaLabel="GP catch-up"
                className="mt-0.5"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
