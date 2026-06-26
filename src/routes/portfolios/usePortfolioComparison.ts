import { useMemo } from 'react'
import { useStore } from '@/store'
import { selectFundBaselineForecast } from '@/store/selectors/forecast'
import { buildFundComparison, buildPortfolioComparison, type PortfolioFundComparison } from '@/lib/comparison'
import { buildPortfolioRateResolver } from '@/lib/portfolio'
import { quarterOrdinal } from '@/lib/quarter'

/** One underlying fund's contribution to this portfolio, in the reporting currency
 *  (pro-rata × per-quarter FX) — the lookthrough decomposition of the aggregate. */
export interface LookthroughEntry {
  fundId: string
  name: string
  /** The fund's own (local) currency. */
  currency: string
  /** allocatedCommitment / fund.commitment. */
  sharePct: number
  /** The fund's allocated commitment in the reporting currency (allocated × forecast rate).
   *  Used as the `commitment` denominator when tracing this fund's contribution cells. */
  commitmentReporting: number
  /** Pro-rata × FX contribution, in the reporting currency. */
  data: ReturnType<typeof buildPortfolioComparison>
  /** Pro-rata contribution in the fund's own currency (no FX) — the LCY column of the
   *  aggregate breakdown. (Reporting = LCY × the quarter's FX rate.) */
  lcyData: ReturnType<typeof buildPortfolioComparison>
}

export interface PortfolioComparison {
  /** The aggregate plan-vs-actual roll-up across all included funds. */
  data: ReturnType<typeof buildPortfolioComparison>
  /** Per-fund contribution breakdowns (sum back to `data`). */
  lookthrough: LookthroughEntry[]
  /** Total allocated commitment in the reporting currency (Σ allocated × forecast rate) —
   *  the PIC denominator for the aggregate, and the `commitment` for tracing its cells. */
  totalCommitment: number
  includedCount: number
  /** Names of funds excluded for lack of an FX path. */
  excluded: string[]
}

/** Builds the portfolio roll-up + its per-fund lookthrough decomposition. Each underlying
 *  fund's baseline comparison (plan = underwriting, actuals stripped) is scaled by its
 *  pro-rata × per-quarter FX; the engine forecasts are globally memoized, so this only
 *  re-runs the cheap reshaping when inputs change. Shared by the roll-up grid and the
 *  fund-table lookthrough drawer. */
export function usePortfolioComparison(portfolioId: string): PortfolioComparison {
  // Subscribe to the raw inputs so the memo recomputes when any change.
  const portfolios = useStore((s) => s.portfolios)
  const funds = useStore((s) => s.funds)
  const templates = useStore((s) => s.templates)
  const fxRates = useStore((s) => s.fxRates)
  const forecastOverrides = useStore((s) => s.forecastRates)

  return useMemo(() => {
    const s = useStore.getState()
    const pf = s.portfolios[portfolioId]
    if (!pf) return { data: [], lookthrough: [], totalCommitment: 0, includedCount: 0, excluded: [] }

    const fundComparisons: PortfolioFundComparison[] = []
    const lookthrough: LookthroughEntry[] = []
    const excluded: string[] = []
    let totalCommitment = 0

    for (const [fundId, alloc] of Object.entries(pf.allocations)) {
      const fund = s.funds[fundId]
      if (!fund) continue
      const resolver = buildPortfolioRateResolver({
        from: fund.currency,
        to: pf.reportingCurrency,
        flat: pf.fx,
        pulled: s.fxRates,
        overrides: s.forecastRates,
      })
      // No resolvable rate at all (no pull, no override, no manual) → can't aggregate.
      if (resolver.forecastRate === null || fund.commitment <= 0) {
        excluded.push(fund.name)
        continue
      }
      const pr = alloc.allocatedCommitment / fund.commitment
      // Historical actuals convert at their quarter's rate, forecast quarters at the
      // forecast rate. The split is the fund's last actuals quarter.
      const lastActualOrd = fund.actuals.reduce(
        (m, a) => Math.max(m, quarterOrdinal(a.quarter)),
        -Infinity,
      )
      const factorForOrd = (ord: number) => pr * (resolver.rateForOrd(ord, lastActualOrd) ?? 0)
      const baseline = selectFundBaselineForecast(s, fundId)
      const template = s.templates[fund.templateId]
      const baseId = template?.baseScenarioId
      const scenario =
        baseline?.scenarios.find((sc) => sc.scenarioId === baseId) ?? baseline?.scenarios[0]
      const comparison = buildFundComparison({
        commitment: fund.commitment,
        effectiveDate: fund.effectiveDate,
        actuals: fund.actuals,
        forecastRows: scenario?.rows ?? [],
      })
      fundComparisons.push({ comparison, factorForOrd })
      const commitmentReporting = alloc.allocatedCommitment * resolver.forecastRate
      // Commitment denominator (portfolio multiples) at the go-forward forecast rate.
      totalCommitment += commitmentReporting
      // Lookthrough: the same aggregator over this one fund → its contribution in the
      // reporting currency, with multiples against its own allocated commitment. Because
      // buildPortfolioComparison is linear in amounts, these sum back to the aggregate.
      lookthrough.push({
        fundId,
        name: fund.name,
        currency: fund.currency,
        sharePct: pr,
        commitmentReporting,
        data: buildPortfolioComparison({
          totalCommitment: commitmentReporting,
          funds: [{ comparison, factorForOrd }],
        }),
        // Pro-rata only (no FX) → the fund's contribution in its own currency.
        lcyData: buildPortfolioComparison({
          totalCommitment: pr * fund.commitment,
          funds: [{ comparison, factorForOrd: () => pr }],
        }),
      })
    }

    return {
      data: buildPortfolioComparison({ totalCommitment, funds: fundComparisons }),
      lookthrough,
      totalCommitment,
      includedCount: fundComparisons.length,
      excluded,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, funds, templates, portfolioId, fxRates, forecastOverrides])
}
