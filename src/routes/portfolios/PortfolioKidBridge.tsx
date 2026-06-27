import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { formatMoney, formatPercent } from '@/lib/format'
import { usePortfolioForecast } from '@/store/selectors/forecast'
import { buildPortfolioRateResolver } from '@/lib/portfolio'
import {
  buildKidView,
  type KidRow,
  type KidScenarioInput,
  type WaterfallRow,
} from '@/lib/kidBridge'
import { Drawer } from '@/components/common/Drawer'

const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const DASH = '—'

/** Hypothetical investor commitment the whole KID is scaled to (reporting currency). */
const PRINCIPAL = 10_000

const fmtPp = (n: number | null) => (n == null ? DASH : `${n.toFixed(2)}pp`)
const fmtYears = (n: number | null) =>
  n == null ? DASH : n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/** Which click-to-trace drawer is open. KPI tiles → cost/drag; a per-case row → case;
 *  a waterfall row → stage (by index). */
type Audit =
  | { kind: 'cost' }
  | { kind: 'drag' }
  | { kind: 'case'; row: KidRow }
  | { kind: 'stage'; index: number }
  | null

/** A number rendered as a click-to-trace button (matches the KPI-tile affordance). */
function NumButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tabular-nums underline-offset-2 hover:text-brand-navy hover:underline"
    >
      {children}
    </button>
  )
}

function KpiTile({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: string
  sub: string
  accent?: string
  onClick: () => void
}) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'mt-1 block text-left text-lg font-bold tabular-nums underline-offset-2 hover:underline',
          accent ?? 'text-body',
        )}
      >
        {value}
      </button>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  )
}

/** A term/definition row inside an audit drawer. */
function AuditRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="text-[12px] text-muted">{term}</span>
      <span className="text-[13px] font-medium tabular-nums text-body">{value}</span>
    </div>
  )
}

export function PortfolioKidBridge({ portfolioId }: { portfolioId: string }) {
  const portfolio = useStore((s) => s.portfolios[portfolioId])
  const funds = useStore((s) => s.funds)
  const templates = useStore((s) => s.templates)
  const fxRates = useStore((s) => s.fxRates)
  const forecastRates = useStore((s) => s.forecastRates)
  const forecast = usePortfolioForecast(portfolioId)

  const [audit, setAudit] = useState<Audit>(null)

  const { view, totalCommitment, numFunds } = useMemo(() => {
    if (!portfolio || !forecast || forecast.scenarios.length === 0) {
      return { view: null, totalCommitment: 0, numFunds: 0 }
    }

    // Σ allocated commitments in the reporting currency (PortfolioRollup pattern), plus
    // the count of contributing funds — the transaction cost is charged once per fund.
    let totalCommitment = 0
    let numFunds = 0
    for (const [fundId, alloc] of Object.entries(portfolio.allocations)) {
      const fund = funds[fundId]
      if (!fund) continue
      const resolver = buildPortfolioRateResolver({
        from: fund.currency,
        to: portfolio.reportingCurrency,
        flat: portfolio.fx,
        pulled: fxRates,
        overrides: forecastRates,
      })
      if (resolver.forecastRate === null || fund.commitment <= 0) continue
      totalCommitment += alloc.allocatedCommitment * resolver.forecastRate
      numFunds += 1
    }

    // Hard-coded transaction cost from the fees-page input: flat per underlying fund,
    // already in the reporting currency. buildKidView scales it to the investor.
    const transactionCostTotal = (portfolio.overlay?.txnCostPerInvestment ?? 0) * numFunds

    // Derive the base scenario from the plurality of the funds' template base cases.
    const counts = new Map<string, number>()
    const orderedIds: string[] = []
    const seen = new Set<string>()
    const labelById = new Map<string, string>()
    for (const fundId of Object.keys(portfolio.allocations)) {
      const tmpl = templates[funds[fundId]?.templateId ?? '']
      if (!tmpl) continue
      if (tmpl.baseScenarioId) counts.set(tmpl.baseScenarioId, (counts.get(tmpl.baseScenarioId) ?? 0) + 1)
      for (const sid of tmpl.scenarioOrder) {
        if (!seen.has(sid)) {
          seen.add(sid)
          orderedIds.push(sid)
        }
        if (!labelById.has(sid) && tmpl.scenarios[sid]) labelById.set(sid, tmpl.scenarios[sid].name)
      }
    }
    let derivedBaseId: string | null = null
    let best = -1
    for (const [id, c] of counts) if (c > best) ((best = c), (derivedBaseId = id))
    const forecastIds = new Set(forecast.scenarios.map((s) => s.scenarioId))
    const baseInForecast = derivedBaseId != null && forecastIds.has(derivedBaseId)
    const baseScenarioId = baseInForecast ? derivedBaseId : (forecast.scenarios[0]?.scenarioId ?? null)
    const baseUsedFallback = !baseInForecast

    // Display order: funds' scenarioOrder, then any forecast scenario not covered.
    const caseOrder = orderedIds.filter((id) => forecastIds.has(id))
    for (const s of forecast.scenarios) if (!caseOrder.includes(s.scenarioId)) caseOrder.push(s.scenarioId)

    const scenarios: KidScenarioInput[] = forecast.scenarios.map((sc) => ({
      scenarioId: sc.scenarioId,
      label: labelById.get(sc.scenarioId) ?? sc.scenarioId,
      isBase: sc.scenarioId === baseScenarioId,
      stage1: sc.kid.stage1,
      stage3: sc.kid.stage3,
      irrStages: sc.irrStages,
    }))

    const view = buildKidView({
      scenarios,
      caseOrder,
      baseScenarioId,
      baseUsedFallback,
      quartersLength: forecast.quarters.length,
      totalCommitment,
      principal: PRINCIPAL,
      transactionCostTotal,
    })
    return { view, totalCommitment, numFunds }
  }, [portfolio, forecast, funds, templates, fxRates, forecastRates])

  if (!portfolio) return null
  const ccy = portfolio.reportingCurrency
  const money = (n: number) => formatMoney(n, ccy)

  if (!view) {
    const blocking = forecast?.warnings.find((w) => w.code === 'portfolio_forecast_failed')
    return (
      <div className={cn(card, 'mt-2 grid place-items-center border-dashed py-16 text-center')}>
        <div className="max-w-sm px-6">
          <p className="text-sm font-semibold text-body">No KID yet</p>
          <p className="mt-1 text-[13px] text-muted">
            {blocking
              ? blocking.message
              : `Commit capital to funds the roll-up can aggregate (a resolvable FX rate to ${ccy}) to see the key information document.`}
          </p>
        </div>
      </div>
    )
  }

  const { totalCostsOverPeriod, annualCostDragPp, baseGrossIrr, baseNetIrr, baseUsedFallback, scaleFactor, perCase, irrWaterfall, years } =
    view

  const cell = (n: number | null, fmt: (x: number) => string) => (n == null ? DASH : fmt(n))
  const pct1 = (n: number) => formatPercent(n, 1)
  const pct2 = (n: number) => formatPercent(n, 2)
  const pp = (n: number) => `${n.toFixed(2)}pp`
  // A number cell that opens a trace drawer, or a plain dash when there's nothing to show.
  const traceCase = (n: number | null, fmt: (x: number) => string, row: KidRow) =>
    n == null ? DASH : <NumButton onClick={() => setAudit({ kind: 'case', row })}>{fmt(n)}</NumButton>
  const traceStage = (n: number | null, fmt: (x: number) => string, i: number) =>
    n == null ? DASH : <NumButton onClick={() => setAudit({ kind: 'stage', index: i })}>{fmt(n)}</NumButton>

  // Trace inputs for the per-stage cost breakdown (the pro-rata split + the txn reserve).
  const txnPerInvestment = portfolio.overlay?.txnCostPerInvestment ?? 0
  const txnReserved = irrWaterfall.find((r) => r.kind === 'txn')?.costAllocation ?? 0
  const denomPp = irrWaterfall.reduce(
    (a, r) => a + (r.kind === 'fee' && r.dragPp && r.dragPp > 0 ? r.dragPp : 0),
    0,
  )
  const distributable = Math.max(0, totalCostsOverPeriod - txnReserved)

  // Narrow the open audit to plain values so the drawer bodies type-check (no closures).
  const caseRow = audit?.kind === 'case' ? audit.row : null
  const stageRow = audit?.kind === 'stage' ? (irrWaterfall[audit.index] ?? null) : null
  const stagePrev = audit?.kind === 'stage' ? (irrWaterfall[audit.index - 1] ?? null) : null

  return (
    <div className="mt-2 space-y-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile
          label="Total costs over period"
          value={money(totalCostsOverPeriod)}
          sub={`for a ${money(PRINCIPAL)} commitment`}
          accent="text-brand-navy"
          onClick={() => setAudit({ kind: 'cost' })}
        />
        <KpiTile
          label="Annual IRR drag (pp)"
          value={fmtPp(annualCostDragPp)}
          sub="base case · gross to net"
          accent={annualCostDragPp && annualCostDragPp > 0 ? 'text-negative' : undefined}
          onClick={() => setAudit({ kind: 'drag' })}
        />
      </div>

      {/* Per-case table */}
      <div className={card}>
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            What each case returns
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Value an investor gets back per {money(PRINCIPAL)} committed, after all fees and carry
            (★ marks the base case).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 text-left font-semibold">Case</th>
                <th className="px-3 pb-2 text-right font-semibold">Value back (per {money(PRINCIPAL)})</th>
                <th className="px-3 pb-2 text-right font-semibold">Net IRR</th>
              </tr>
            </thead>
            <tbody>
              {perCase.map((r, i) => (
                <tr key={r.caseId} className={i > 0 ? 'border-t border-border-subtle' : ''}>
                  <td className={cn('py-2 pr-3 text-left font-medium text-body', i > 0 && 'border-t border-border-subtle')}>
                    {r.caseLabel}
                    {r.isBase && <span className="ml-1.5 text-amber-500">★</span>}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums text-body', i > 0 && 'border-t border-border-subtle')}>
                    {traceCase(r.totalValueBack, money, r)}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums text-body', i > 0 && 'border-t border-border-subtle')}>
                    {traceCase(r.netIrr, pct1, r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* IRR waterfall */}
      {irrWaterfall.length > 0 && (
        <div className={card}>
          <div className="mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              How the base case gets from gross to net
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Each cost layer steps the IRR down from the gross return to the net return an
              investor receives.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 text-left font-semibold">Stage</th>
                  <th className="px-1.5 pb-2 text-right font-semibold">Drag</th>
                  <th className="px-1.5 pb-2 text-right font-semibold">Accum. drag</th>
                  <th className="px-1.5 pb-2 text-right font-semibold">IRR</th>
                  <th className="px-1.5 pb-2 text-right font-semibold">Cost</th>
                  <th className="px-1.5 pb-2 text-right font-semibold">Annual cost</th>
                </tr>
              </thead>
              <tbody>
                {irrWaterfall.map((r: WaterfallRow, i) => {
                  const anchor = r.kind === 'start' || r.kind === 'end'
                  const tx = anchor ? 'font-semibold text-body' : 'text-body'
                  const bg = anchor ? 'bg-slate-50' : ''
                  return (
                    <tr key={`${r.kind}-${i}`} className={bg}>
                      <td className={cn('py-1.5 pr-3 text-left', tx, i > 0 && 'border-t border-border-subtle')}>
                        <button
                          type="button"
                          onClick={() => setAudit({ kind: 'stage', index: i })}
                          className="text-left underline-offset-2 hover:text-brand-navy hover:underline"
                        >
                          {r.label}
                        </button>
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums text-muted', i > 0 && 'border-t border-border-subtle')}>
                        {traceStage(r.dragPp, pp, i)}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tx, i > 0 && 'border-t border-border-subtle')}>
                        {traceStage(r.accumulatedDragPp, pp, i)}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tx, i > 0 && 'border-t border-border-subtle')}>
                        {traceStage(r.irrAfter, pct1, i)}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tx, i > 0 && 'border-t border-border-subtle')}>
                        {traceStage(r.costAllocation, money, i)}
                      </td>
                      <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tx, i > 0 && 'border-t border-border-subtle')}>
                        {traceStage(r.annualCostAllocation, money, i)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1.5 text-[11px] leading-snug text-muted">
            <p>
              <span className="font-medium text-slate-500">Drag / accum. drag</span> — the IRR drop
              across that stage; accumulated drag is the gross IRR minus the IRR after that stage.
            </p>
            <p>
              <span className="font-medium text-slate-500">Cost</span> — a pro-rata allocation of the
              period's total cost across the IRR-drag layers: a presentation estimate, not an
              accounting decomposition of fees actually paid.
            </p>
            <p>
              <span className="font-medium text-slate-500">Our transaction costs</span> — the flat
              per-underlying-fund charge set on the fees page, shown at its input value (carved out
              of the total rather than pro-rated). Its return impact is folded into the adjacent
              stage, so it doesn't step the IRR on its own — its drag shows as 0.00pp.
            </p>
            <p>
              <span className="font-medium text-slate-500">Annual cost</span> — Cost ÷ fund years
              ({fmtYears(years)}). For a fund-of-funds holding funds with non-overlapping vintages,
              the quarter span is the union of the underlying funds' lives and can overstate the
              effective horizon.
            </p>
          </div>
        </div>
      )}

      {/* Audit drawers */}
      <Drawer
        open={audit?.kind === 'cost'}
        onClose={() => setAudit(null)}
        title="Total costs over period"
        ariaLabel="Total costs audit"
      >
        <p className="text-[12px] text-muted">
          Σ Stage 1 net cash flow − Σ Stage 3 net cash flow, base case, × scale factor.
        </p>
        <div className="mt-3">
          <AuditRow term="Stage 1 (gross) net cash flow" value={money(view.baseSumStage1)} />
          <AuditRow term="Stage 3 (final net) net cash flow" value={money(view.baseSumStage3)} />
          <AuditRow
            term="Scale factor"
            value={`${scaleFactor.toExponential(3)} = ${money(PRINCIPAL)} ÷ ${money(totalCommitment)}`}
          />
          <AuditRow term="Total cost (difference)" value={money(totalCostsOverPeriod)} />
          <AuditRow term="Fund years" value={fmtYears(years)} />
        </div>
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-snug text-muted">
          Captures all fee leakage between gross and final-net cash flow (underlying fund fees and
          carry, plus any fund-of-funds overlay). A raw cash-flow difference — not PRIIPs-discounted.
        </p>
      </Drawer>

      <Drawer
        open={audit?.kind === 'drag'}
        onClose={() => setAudit(null)}
        title="Annual IRR drag"
        ariaLabel="Annual IRR drag audit"
      >
        <p className="text-[12px] text-muted">(Gross IRR − final net IRR) × 100, base case.</p>
        <div className="mt-3">
          <AuditRow term="Gross IRR (Stage 1)" value={cell(baseGrossIrr, (n) => formatPercent(n, 2))} />
          <AuditRow term="Final net IRR (Stage 3)" value={cell(baseNetIrr, (n) => formatPercent(n, 2))} />
          <AuditRow term="Annual IRR drag" value={fmtPp(annualCostDragPp)} />
        </div>
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-snug text-muted">
          EU PRIIPs reduction-in-yield (RIY) shape. A negative drag (a downstream stage IRR
          exceeding the gross — model noise) is suppressed to {DASH}, never shown as a negative or
          clamped-zero cost.
        </p>
        {baseUsedFallback && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-snug text-amber-800">
            No scenario is flagged as the base case; showing the first scenario instead.
          </p>
        )}
      </Drawer>

      {/* Per-case audit — opened from a "What each case returns" row. */}
      <Drawer
        open={audit?.kind === 'case'}
        onClose={() => setAudit(null)}
        title={caseRow ? `${caseRow.caseLabel}${caseRow.isBase ? ' ★' : ''}` : ''}
        ariaLabel="Case audit"
      >
        {caseRow && (
          <>
            <p className="text-[12px] text-muted">
              What an investor gets back per {money(PRINCIPAL)} committed, and this case's net IRR.
            </p>
            <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Value back
            </p>
            <div>
              <AuditRow term="Paid-in (your share)" value={money(caseRow.paidIn)} />
              <AuditRow term="Distributions (your share)" value={money(caseRow.distributions)} />
              <AuditRow
                term="TVPI = distributions ÷ paid-in"
                value={caseRow.tvpi == null ? DASH : `${caseRow.tvpi.toFixed(2)}×`}
              />
              <AuditRow
                term={`Value back = TVPI × ${money(PRINCIPAL)}`}
                value={cell(caseRow.totalValueBack, money)}
              />
            </div>
            <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Net IRR
            </p>
            <div>
              <AuditRow term="Gross IRR (Stage 1)" value={cell(caseRow.grossIrr, pct2)} />
              <AuditRow term="Net IRR (after all fees & carry)" value={cell(caseRow.netIrr, pct2)} />
              <AuditRow
                term="Total drag (gross − net)"
                value={fmtPp(
                  caseRow.grossIrr != null && caseRow.netIrr != null
                    ? (caseRow.grossIrr - caseRow.netIrr) * 100
                    : null,
                )}
              />
            </div>
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-snug text-muted">
              TVPI and IRR are net of underlying fund fees and carry plus any fund-of-funds overlay.
              Value back normalizes the multiple to a {money(PRINCIPAL)} commitment.
            </p>
          </>
        )}
      </Drawer>

      {/* Per-stage audit — opened from an IRR-waterfall row. */}
      <Drawer
        open={audit?.kind === 'stage'}
        onClose={() => setAudit(null)}
        title={stageRow?.label ?? ''}
        ariaLabel="Stage audit"
      >
        {stageRow && stageRow.kind === 'start' && (
          <>
            <p className="text-[12px] text-muted">
              The gross return before any fees — the waterfall's starting point.
            </p>
            <div className="mt-3">
              <AuditRow term="Gross IRR" value={cell(stageRow.irrAfter, pct2)} />
            </div>
          </>
        )}
        {stageRow && stageRow.kind === 'end' && (
          <>
            <p className="text-[12px] text-muted">
              The investor's net return after every cost layer.
            </p>
            <div className="mt-3">
              <AuditRow term="Net IRR" value={cell(stageRow.irrAfter, pct2)} />
              <AuditRow term="Total accumulated drag" value={fmtPp(stageRow.accumulatedDragPp)} />
              <AuditRow term="Total cost over period" value={cell(stageRow.costAllocation, money)} />
              <AuditRow
                term={`Annual cost = cost ÷ years (${fmtYears(years)})`}
                value={cell(stageRow.annualCostAllocation, money)}
              />
            </div>
          </>
        )}
        {stageRow && stageRow.kind === 'txn' && (
          <>
            <p className="text-[12px] text-muted">
              A flat per-underlying-fund charge set on the fees page (hard-coded input), scaled to
              the investor.
            </p>
            <div className="mt-3">
              <AuditRow term="IRR after (unchanged)" value={cell(stageRow.irrAfter, pct2)} />
              <AuditRow term="Drag" value={fmtPp(stageRow.dragPp)} />
              <AuditRow term="Transaction cost per fund" value={money(txnPerInvestment)} />
              <AuditRow term="Underlying funds" value={String(numFunds)} />
              <AuditRow term="Scale to investor" value={scaleFactor.toExponential(3)} />
              <AuditRow
                term="Cost = per-fund × funds × scale"
                value={cell(stageRow.costAllocation, money)}
              />
              <AuditRow
                term={`Annual cost = cost ÷ years (${fmtYears(years)})`}
                value={cell(stageRow.annualCostAllocation, money)}
              />
            </div>
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-snug text-muted">
              Its return impact is folded into the adjacent stage, so its own drag is 0.00pp.
            </p>
          </>
        )}
        {stageRow && stageRow.kind === 'fee' && (
          <>
            <p className="text-[12px] text-muted">
              How this fee layer steps the IRR down, and its share of the period's cost.
            </p>
            <div className="mt-3">
              <AuditRow term="Previous stage IRR" value={cell(stagePrev?.irrAfter ?? null, pct2)} />
              <AuditRow term="IRR after this stage" value={cell(stageRow.irrAfter, pct2)} />
              <AuditRow term="Drag (previous − this)" value={fmtPp(stageRow.dragPp)} />
              <AuditRow term="Accumulated drag (gross − this)" value={fmtPp(stageRow.accumulatedDragPp)} />
            </div>
            <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cost (pro-rata by drag)
            </p>
            <div>
              <AuditRow
                term="Drag weight"
                value={
                  stageRow.dragPp != null && denomPp > 0
                    ? `${stageRow.dragPp.toFixed(2)}pp ÷ ${denomPp.toFixed(2)}pp`
                    : DASH
                }
              />
              <AuditRow term="Distributable cost" value={money(distributable)} />
              <AuditRow term="Cost = weight × distributable" value={cell(stageRow.costAllocation, money)} />
              <AuditRow
                term={`Annual cost = cost ÷ years (${fmtYears(years)})`}
                value={cell(stageRow.annualCostAllocation, money)}
              />
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
