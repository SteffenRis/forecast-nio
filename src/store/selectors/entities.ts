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
