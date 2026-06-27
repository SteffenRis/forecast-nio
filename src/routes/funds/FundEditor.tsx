import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { addYearsIso, formatMoneyCompact } from '@/lib/format'
import { assetClassLabel } from '@/lib/assetClass'
import { CURRENCIES, currencySymbol } from '@/lib/currency'
import { FEE_BASES } from '@/lib/feeBasis'
import type { FeeBasis, Fund, Template } from '@/store/types'
import { NumberInput } from '@/components/common/NumberInput'
import { DateInput } from '@/components/common/DateInput'
import { Toggle } from '@/components/common/Toggle'
import { Slider } from '@/components/common/Slider'
import { DEFAULT_SLIDERS } from '@/store/slices/fundsSlice'

const textField =
  'h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const selectField = cn(textField, 'pr-8')
const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const grid2 = 'grid grid-cols-1 gap-4 sm:grid-cols-2'

const DEFAULT_LIFE = 10

type BasisKey = 'mgmtBasisIp' | 'mgmtBasisPostIp' | 'expenseBasisIp' | 'expenseBasisPostIp'

function Field({
  label,
  children,
  helper,
}: {
  label: string
  children: React.ReactNode
  helper?: string
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

/** Percent field: stores a fraction (0.02), shows a percent (2). */
function PercentField({
  label,
  value,
  onCommit,
  helper,
}: {
  label: string
  value: number
  onCommit: (fraction: number) => void
  helper?: string
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
  helper?: string
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

/** Range slider with an uppercase label, a live readout, and end labels. */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  readout,
  leftLabel,
  rightLabel,
  helper,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
  readout: string
  leftLabel: string
  rightLabel: string
  helper?: string
}) {
  return (
    <div className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-body">{readout}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} ariaLabel={label} />
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      {helper && <p className="mt-1.5 text-[11px] leading-snug text-muted">{helper}</p>}
    </div>
  )
}

interface Props {
  fund: Fund
  templates: Record<string, Template>
  templateOrder: string[]
  update: (recipe: (d: Fund) => void) => void
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}

export function FundEditor({
  fund,
  templates,
  templateOrder,
  update,
  dirty,
  onSave,
  onDiscard,
}: Props) {
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

  const template = templates[fund.templateId]
  const lifeOf = (templateId: string) => templates[templateId]?.fundLifeYears ?? DEFAULT_LIFE

  // Basis <select> bound to one of the four FeeBasis keys.
  function basisSelect(key: BasisKey, label: string) {
    return (
      <Field label={label}>
        <select
          className={selectField}
          value={fund.fees[key]}
          onChange={(e) =>
            update((d) => {
              d.fees[key] = e.target.value as FeeBasis
            })
          }
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

      {/* Identity */}
      <div className={card}>
        <SectionHeader title="Identity" sub="How the fund and its manager are named." />
        <div className={grid2}>
          <Field label="Fund name">
            <input
              className={textField}
              value={fund.name}
              onChange={(e) =>
                update((d) => {
                  d.name = e.target.value
                })
              }
            />
          </Field>
          <Field label="GP name">
            <input
              className={textField}
              value={fund.gpName ?? ''}
              placeholder="Manager / general partner"
              onChange={(e) =>
                update((d) => {
                  d.gpName = e.target.value
                })
              }
            />
          </Field>
          <Field
            label="Template"
            helper={`Asset class · ${template ? assetClassLabel(template.assetClass) : '—'}`}
          >
            <select
              className={selectField}
              value={fund.templateId}
              onChange={(e) => {
                const templateId = e.target.value
                const life = lifeOf(templateId)
                update((d) => {
                  d.templateId = templateId
                  d.standardLiquidationDate = addYearsIso(d.effectiveDate, life)
                })
              }}
              aria-label="Template"
            >
              {templateOrder.map((id) => (
                <option key={id} value={id}>
                  {templates[id]?.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reporting currency">
            <select
              className={selectField}
              value={fund.currency}
              onChange={(e) =>
                update((d) => {
                  d.currency = e.target.value
                })
              }
              aria-label="Reporting currency"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Capital & Lifecycle */}
      <div className={card}>
        <SectionHeader
          title="Capital & Lifecycle"
          sub="Sizing and the dates that drive the fee and curve clock."
        />
        <div className={grid2}>
          <MoneyField
            label="Your commitment"
            value={fund.commitment}
            currency={fund.currency}
            onCommit={(n) => update((d) => { d.commitment = n })}
            helper={`In the fund's reporting currency · ${formatMoneyCompact(fund.commitment, fund.currency)}`}
          />
          <MoneyField
            label="Fund size (actual)"
            value={fund.fundSizeActual}
            currency={fund.currency}
            onCommit={(n) => update((d) => { d.fundSizeActual = n })}
            helper="GP's size at final close."
          />
          <MoneyField
            label="Target fund size"
            value={fund.targetFundSize}
            currency={fund.currency}
            onCommit={(n) => update((d) => { d.targetFundSize = n })}
            helper="GP's stated target at first close."
          />
          <Field label="Acceptance date" helper="When you committed to the fund.">
            <DateInput
              value={fund.acceptanceDate}
              onCommit={(v) => update((d) => { d.acceptanceDate = v })}
              ariaLabel="Acceptance date"
            />
          </Field>
          <Field label="Effective date" helper="When the fund's calendar starts (fee + curve clock).">
            <DateInput
              value={fund.effectiveDate}
              onCommit={(v) =>
                update((d) => {
                  if (!v) return
                  d.effectiveDate = v
                  d.standardLiquidationDate = addYearsIso(v, lifeOf(d.templateId))
                })
              }
              ariaLabel="Effective date"
            />
          </Field>
          <Field
            label="Investment period end"
            helper="Switches fee + expenses from IP to post-IP rate."
          >
            <DateInput
              value={fund.fees.investmentPeriodEnd}
              onCommit={(v) => update((d) => { if (v) d.fees.investmentPeriodEnd = v })}
              ariaLabel="Investment period end"
            />
          </Field>
          <Field
            label="Expected liquidation"
            helper="Leave empty to use the template's standard liquidation."
          >
            <DateInput
              value={fund.expectedLiquidationDate}
              onCommit={(v) => update((d) => { d.expectedLiquidationDate = v })}
              ariaLabel="Expected liquidation"
            />
          </Field>
        </div>
      </div>

      {/* Profile shaping */}
      <div className={card}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Profile shaping
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Tune the template's scenarios for this fund. The base case is untouched by
              concentration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => update((d) => { d.sliders = { ...DEFAULT_SLIDERS } })}
            className="shrink-0 rounded-md border border-border-default bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-slate-50"
          >
            Reset to template
          </button>
        </div>
        <div className={grid2}>
          <SliderField
            label="Concentration index"
            value={fund.sliders.concentration}
            min={0}
            max={2}
            step={0.05}
            onChange={(n) => update((d) => { d.sliders.concentration = n })}
            readout={`${fund.sliders.concentration.toFixed(2)}×`}
            leftLabel="Tight (0)"
            rightLabel="Wide (2)"
            helper="Spread of the Low/High scenarios around the base. Higher = more volatile; the base case is unchanged."
          />
          <SliderField
            label="Cash-flow timing"
            value={fund.sliders.dpiTiming}
            min={-1}
            max={1}
            step={0.05}
            onChange={(n) => update((d) => { d.sliders.dpiTiming = n })}
            readout={
              fund.sliders.dpiTiming === 0
                ? 'Neutral'
                : fund.sliders.dpiTiming < 0
                  ? `Front-loaded (${fund.sliders.dpiTiming.toFixed(2)})`
                  : `Back-loaded (+${fund.sliders.dpiTiming.toFixed(2)})`
            }
            leftLabel="Front-loaded (−1)"
            rightLabel="Back-loaded (+1)"
            helper="Pulls distributions earlier (front) or later (back) across all scenarios. Terminal DPI unchanged."
          />
          <SliderField
            label="Ultimate DPI multiplier"
            value={fund.sliders.dpiMultiplier}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(n) => update((d) => { d.sliders.dpiMultiplier = n })}
            readout={`${fund.sliders.dpiMultiplier.toFixed(2)}×`}
            leftLabel="0.5×"
            rightLabel="2.0×"
            helper="Scales every scenario's DPI up or down. 1.00× = the template as drawn."
          />
        </div>
      </div>

      {/* Management Fees & Expenses */}
      <div className={card}>
        <SectionHeader
          title="Management Fees & Expenses"
          sub="Annual rates, charged quarterly and pro-rated. The management fee and expenses each take an independent basis per period."
        />
        <div className={grid2}>
          <PercentField
            label="Mgmt fee — investment period"
            value={fund.fees.mgmtRateIp}
            onCommit={(f) => update((d) => { d.fees.mgmtRateIp = f })}
          />
          {basisSelect('mgmtBasisIp', 'Mgmt fee basis — investment period')}
          <PercentField
            label="Mgmt fee — post-IP"
            value={fund.fees.mgmtRatePostIp}
            onCommit={(f) => update((d) => { d.fees.mgmtRatePostIp = f })}
          />
          {basisSelect('mgmtBasisPostIp', 'Mgmt fee basis — post-IP')}
          <PercentField
            label="Expenses — investment period"
            value={fund.fees.expenseRateIp}
            onCommit={(f) => update((d) => { d.fees.expenseRateIp = f })}
          />
          {basisSelect('expenseBasisIp', 'Expenses basis — investment period')}
          <PercentField
            label="Expenses — post-IP"
            value={fund.fees.expenseRatePostIp}
            onCommit={(f) => update((d) => { d.fees.expenseRatePostIp = f })}
          />
          {basisSelect('expenseBasisPostIp', 'Expenses basis — post-IP')}
          <PercentField
            label="Establishment costs (one-time)"
            value={fund.fees.establishmentRate}
            onCommit={(f) => update((d) => { d.fees.establishmentRate = f })}
            helper="Percentage of commitment, charged once at fund inception."
          />
        </div>
      </div>

      {/* Carry & Hurdle */}
      <div className={card}>
        <SectionHeader
          title="Carry & Hurdle"
          sub="The GP's profit share and the LP's preferred return."
        />
        <div className={grid2}>
          <PercentField
            label="Carry rate"
            value={fund.fees.carryRate}
            onCommit={(f) => update((d) => { d.fees.carryRate = f })}
            helper="GP share above the hurdle · typical 20%."
          />
          <PercentField
            label="Hurdle (annual)"
            value={fund.fees.hurdleAnnual}
            onCommit={(f) => update((d) => { d.fees.hurdleAnnual = f })}
            helper="LP preferred return · typical 8%."
          />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-border-default bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-body">GP catch-up</p>
            <p className="mt-0.5 max-w-xl text-[12px] text-muted">
              After the hurdle, the GP catches up to its full carry share before the 80/20 split
              resumes.
            </p>
          </div>
          <Toggle
            checked={fund.fees.catchUp}
            onChange={(checked) => update((d) => { d.fees.catchUp = checked })}
            ariaLabel="GP catch-up"
            className="mt-0.5"
          />
        </div>
      </div>
    </div>
  )
}
