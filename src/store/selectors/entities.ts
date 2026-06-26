import type { StoreState } from '../storeState'
import type { Fund, Portfolio, Template } from '../types'

// Plain (non-hook) read selectors. Components wrap these with useStore (+ useShallow
// for list results) so subscriptions stay narrow. Kept pure for easy testing.

export const selectTemplate = (s: StoreState, id: string): Template | undefined => s.templates[id]
export const selectFund = (s: StoreState, id: string): Fund | undefined => s.funds[id]
export const selectPortfolio = (s: StoreState, id: string): Portfolio | undefined =>
  s.portfolios[id]

export const selectTemplates = (s: StoreState): Template[] =>
  s.templateOrder.map((id) => s.templates[id]).filter(Boolean)
export const selectFunds = (s: StoreState): Fund[] =>
  s.fundOrder.map((id) => s.funds[id]).filter(Boolean)
export const selectPortfolios = (s: StoreState): Portfolio[] =>
  s.portfolioOrder.map((id) => s.portfolios[id]).filter(Boolean)

/** Total committed to each fund across ALL portfolios (fundId → sum of allocated
 *  commitments, in the fund's own currency). Drives the over-allocation guardrail:
 *  a fund is over-committed when this exceeds the fund's `commitment`. Returns a
 *  fresh object — call inside useMemo, not directly in a useStore subscription. */
export function sumFundAllocations(
  portfolios: Record<string, Portfolio>,
  portfolioOrder: string[],
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const pid of portfolioOrder) {
    const p = portfolios[pid]
    if (!p) continue
    for (const [fundId, a] of Object.entries(p.allocations)) {
      totals[fundId] = (totals[fundId] ?? 0) + a.allocatedCommitment
    }
  }
  return totals
}

/** Funds allocated into a portfolio, paired with their allocated commitment. */
export function selectPortfolioFunds(
  s: StoreState,
  portfolioId: string,
): { fund: Fund; allocatedCommitment: number }[] {
  const pf = s.portfolios[portfolioId]
  if (!pf) return []
  return Object.entries(pf.allocations)
    .map(([fundId, a]) => {
      const fund = s.funds[fundId]
      return fund ? { fund, allocatedCommitment: a.allocatedCommitment } : null
    })
    .filter((x): x is { fund: Fund; allocatedCommitment: number } => x !== null)
}
