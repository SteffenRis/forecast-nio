import { useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useStore } from '@/store'
import { CURRENCIES, currencySymbol } from '@/lib/currency'
import { formatMoneyCompact } from '@/lib/format'
import { NumberInput } from '@/components/common/NumberInput'
import { sumFundAllocations } from '@/store/selectors/entities'
import { portfolioFxRate } from '@/lib/portfolio'
import type { Portfolio } from '@/store/types'
import { PortfolioRollup } from './PortfolioRollup'

const textField =
  'h-9 w-full rounded-md border border-border-default bg-white px-3 text-[13px] text-body outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
const selectField = cn(textField, 'pr-8')
const card = 'rounded-xl border border-border-default bg-white p-5 shadow-sm'
const grid2 = 'grid grid-cols-1 gap-4 sm:grid-cols-2'

const fmtPct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`

/** A fund can be rolled up when it shares the portfolio's reporting currency, or the
 *  portfolio already carries a usable FX rate (direct or inverse). Editing FX rates is
 *  a later refinement; this just respects rates that already exist (e.g. the seed's
 *  EUR>USD). */
function aggregable(pf: Portfolio, fundCurrency: string): boolean {
  return portfolioFxRate(pf.fx, fundCurrency, pf.reportingCurrency) !== null
}

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

export function PortfolioEditor({ portfolioId }: { portfolioId: string }) {
  const portfolio = useStore((s) => s.portfolios[portfolioId])
  const funds = useStore((s) => s.funds)
  const fundOrder = useStore((s) => s.fundOrder)
  const portfolios = useStore((s) => s.portfolios)
  const portfolioOrder = useStore((s) => s.portfolioOrder)
  const updatePortfolio = useStore((s) => s.updatePortfolio)
  const setAllocation = useStore((s) => s.setAllocation)
  const removeAllocation = useStore((s) => s.removeAllocation)

  // Total committed to each fund across ALL portfolios (over-allocation guardrail).
  const totalsAcrossPortfolios = useMemo(
    () => sumFundAllocations(portfolios, portfolioOrder),
    [portfolios, portfolioOrder],
  )

  if (!portfolio) return null
  const ccy = portfolio.reportingCurrency

  const allocatedIds = fundOrder.filter((id) => portfolio.allocations[id])
  // Add picker offers un-allocated funds the roll-up can aggregate (same currency, or
  // an FX rate already exists). A fund with no FX path would break the roll-up, so it's
  // hidden until FX-rate editing lands.
  const addable = fundOrder.filter(
    (id) => !portfolio.allocations[id] && funds[id] && aggregable(portfolio, funds[id].currency),
  )
  const hiddenNoFx = fundOrder.filter(
    (id) => !portfolio.allocations[id] && funds[id] && !aggregable(portfolio, funds[id].currency),
  ).length

  return (
    <div className="mt-5 space-y-5">
      {/* Identity */}
      <div className={card}>
        <SectionHeader
          title="Identity"
          sub="Name and the reporting currency the roll-up is expressed in."
        />
        <div className={grid2}>
          <Field label="Portfolio name">
            <input
              className={textField}
              value={portfolio.name}
              onChange={(e) => updatePortfolio(portfolioId, { name: e.target.value })}
            />
          </Field>
          <Field label="Reporting currency" helper="The aggregated roll-up is shown in this currency.">
            <select
              className={selectField}
              value={ccy}
              onChange={(e) => updatePortfolio(portfolioId, { reportingCurrency: e.target.value })}
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

      {/* Underlying funds */}
      <div className={card}>
        <SectionHeader
          title="Underlying funds"
          sub="This portfolio's commitment ÷ the fund's total commitment sets its pro-rata share of that fund's cash flows. Several portfolios may hold the same fund."
        />

        {fundOrder.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-border-default py-12 text-center">
            <div className="max-w-sm px-6">
              <p className="text-[13px] font-semibold text-body">No funds in the system yet</p>
              <p className="mt-1 text-[12px] text-muted">
                Create funds on the Funds screen first, then commit capital to them here.
              </p>
            </div>
          </div>
        ) : (
          <>
            {allocatedIds.length === 0 ? (
              <p className="text-[13px] text-muted">No fund commitments yet — add one below.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-3 text-left font-semibold">Fund</th>
                      <th className="px-3 pb-2 text-right font-semibold">Fund commitment</th>
                      <th className="px-3 pb-2 text-right font-semibold">This portfolio</th>
                      <th className="px-3 pb-2 text-right font-semibold">Share</th>
                      <th className="px-3 pb-2 text-right font-semibold">Remaining</th>
                      <th className="pb-2 pl-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {allocatedIds.map((id) => {
                      const fund = funds[id]!
                      const allocated = portfolio.allocations[id].allocatedCommitment
                      const share = fund.commitment > 0 ? allocated / fund.commitment : null
                      const totalAll = totalsAcrossPortfolios[id] ?? 0
                      const remaining = fund.commitment - totalAll
                      const over = remaining < -1e-6
                      const noFx = !aggregable(portfolio, fund.currency)
                      return (
                        <tr key={id} className="border-t border-border-subtle">
                          <td className="py-2 pr-3 font-medium text-body">
                            {fund.name}
                            {noFx && (
                              <span className="ml-2 text-[11px] font-medium text-negative">
                                FX rate needed for {fund.currency}→{ccy}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">
                            {formatMoneyCompact(fund.commitment, fund.currency)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative ml-auto w-36">
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted">
                                {currencySymbol(fund.currency)}
                              </span>
                              <NumberInput
                                value={allocated}
                                onCommit={(n) => setAllocation(portfolioId, id, n)}
                                ariaLabel={`${fund.name} commitment`}
                                align="right"
                                className="h-8 pl-6"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-body">
                            {share === null ? '—' : fmtPct(share)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 text-right tabular-nums',
                              over ? 'font-medium text-negative' : 'text-muted',
                            )}
                          >
                            {over
                              ? `over by ${formatMoneyCompact(-remaining, fund.currency)}`
                              : formatMoneyCompact(remaining, fund.currency)}
                          </td>
                          <td className="py-2 pl-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeAllocation(portfolioId, id)}
                              aria-label={`Remove ${fund.name}`}
                              className="text-muted hover:text-negative"
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add fund */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                className={cn(selectField, 'min-w-[220px]')}
                value=""
                onChange={(e) => {
                  if (e.target.value) setAllocation(portfolioId, e.target.value, 0)
                }}
                aria-label="Add a fund"
                disabled={addable.length === 0}
              >
                <option value="" disabled>
                  {addable.length === 0 ? 'No funds available to add' : 'Add a fund…'}
                </option>
                {addable.map((id) => (
                  <option key={id} value={id}>
                    {funds[id]?.name}
                  </option>
                ))}
              </select>
              {hiddenNoFx > 0 && (
                <span className="text-[12px] text-muted">
                  {hiddenNoFx} fund{hiddenNoFx === 1 ? '' : 's'} hidden — no FX rate to {ccy} yet
                  (FX-rate editing is coming).
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <PortfolioRollup portfolioId={portfolioId} />
    </div>
  )
}
