import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { Tabs } from '@/components/common/Tabs'
import type { ForecastPolicyMode } from '@/store/types'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const primaryBtn =
  'rounded-md bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90'

const POLICY_OPTIONS: { value: ForecastPolicyMode; label: string; helper: string }[] = [
  {
    value: 'scale',
    label: 'Scale to plan (catch-up)',
    helper:
      'Scale the remaining forecast proportionally so it still reaches the plan’s original terminal — the catch-up is spread smoothly across the remaining quarters. Behind plan → remaining calls/distributions scale up; ahead → they scale down. Each quarter’s relative pacing is preserved (a quarter planned at twice another’s call stays twice as large).',
  },
  {
    value: 'rebase',
    label: 'Snap to plan',
    helper:
      'Snap the forward forecast straight back onto the plan’s absolute schedule — the entire gap to plan is made up in the first forecast quarter, then it follows the original plan. The engine’s long-standing default.',
  },
  {
    value: 'keep_plan',
    label: 'Keep plan',
    helper:
      'Record actuals for realized quarters, but keep the remaining forecast on its original planned increments. The actual-vs-plan gap rides forward and the terminal floats — no catch-up.',
  },
]

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[13px] font-semibold text-body">{title}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
    </div>
  )
}

/** Display an ISO timestamp; falls back to the raw string if it can't parse. */
function formatSetAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

interface Props {
  fundId: string
}

export function FundPolicy({ fundId }: Props) {
  const fund = useStore((s) => s.funds[fundId])
  const setFundPolicy = useStore((s) => s.setFundPolicy)
  const setFundForecast = useStore((s) => s.setFundForecast)

  if (!fund) return null

  // Falls back to 'rebase' to match the engine's omitted-policy default (only
  // pre-feature imports lack an explicit policy; funds created here default to scale).
  const mode: ForecastPolicyMode = fund.policy?.mode ?? 'rebase'
  const setForecast = fund.setForecast
  const activeHelper = POLICY_OPTIONS.find((o) => o.value === mode)!.helper

  const onSet = () => {
    if (
      setForecast &&
      !window.confirm(
        'An active forecast already exists. Overwrite it with the current forecast?',
      )
    ) {
      return
    }
    setFundForecast(fundId)
  }

  return (
    <div className="mt-5 space-y-5">
      <div className={card}>
        <SectionHeader
          title="Forecast update policy"
          subtitle="How this fund’s forecast reacts when new actuals arrive."
        />
        <Tabs
          ariaLabel="Forecast update policy"
          tabs={POLICY_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
          value={mode}
          onChange={(m) => setFundPolicy(fundId, m)}
        />
        <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-muted">{activeHelper}</p>
      </div>

      <div className={card}>
        <SectionHeader
          title="Active forecast"
          subtitle="The baseline the recalibrated forecast is built from — and what drift is measured against. The recalibrated forecast moves only with actuals, never with later plan edits, until you re-set it here."
        />
        <div className="flex items-start justify-between gap-4">
          <p className="max-w-md text-[12px] text-muted">
            {setForecast ? (
              <>
                Last set <span className="font-medium text-body">{formatSetAt(setForecast.setAt)}</span>.
                Re-setting captures the current live plan as the new active forecast (this is how you
                fold slider/fee/template edits into the baseline).
              </>
            ) : (
              'No active forecast yet. Set the current forecast as the baseline to start tracking drift against it.'
            )}
          </p>
          <button type="button" className={cn(primaryBtn, 'shrink-0')} onClick={onSet}>
            {setForecast ? 'Re-set active forecast' : 'Set active forecast'}
          </button>
        </div>
      </div>
    </div>
  )
}
