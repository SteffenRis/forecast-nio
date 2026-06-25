import type { SliceCreator } from '../storeState'
import type { OverlayParams, Portfolio } from '../types'
import { newId } from '@/lib/id'

export interface PortfoliosSlice {
  portfolios: Record<string, Portfolio>
  portfolioOrder: string[]

  addPortfolio: (name?: string) => string
  updatePortfolio: (
    id: string,
    patch: Partial<Omit<Portfolio, 'id' | 'allocations' | 'fx' | 'overlay'>>,
  ) => void
  removePortfolio: (id: string) => void
  duplicatePortfolio: (id: string) => string | null

  setAllocation: (portfolioId: string, fundId: string, allocatedCommitment: number) => void
  removeAllocation: (portfolioId: string, fundId: string) => void
  setFxRate: (portfolioId: string, from: string, to: string, rate: number) => void
  setOverlay: (portfolioId: string, overlay: OverlayParams | null) => void
}

export const DEFAULT_OVERLAY: OverlayParams = {
  mgmtRateIp: 0.0075,
  mgmtRatePostIp: 0.005,
  mgmtBasisIp: 'commitment',
  mgmtBasisPostIp: 'cost_basis',
  expenseRate: 0.001,
  expenseBasisIp: 'commitment',
  expenseBasisPostIp: 'cost_basis',
  establishmentRate: 0.002,
  carryRate: 0.05,
  hurdleAnnual: 0.08,
  catchUp: false,
  txnCostPerInvestment: 0,
  valueFees: 0,
  feeBasisFxPolicy: 'spot',
}

export const createPortfoliosSlice: SliceCreator<PortfoliosSlice> = (set, get) => ({
  portfolios: {},
  portfolioOrder: [],

  addPortfolio: (name = 'Untitled portfolio') => {
    const portfolio: Portfolio = {
      id: newId('pf'),
      name,
      reportingCurrency: 'EUR',
      allocations: {},
      fx: {},
      overlay: null,
    }
    set((s) => {
      s.portfolios[portfolio.id] = portfolio
      s.portfolioOrder.push(portfolio.id)
    })
    return portfolio.id
  },

  updatePortfolio: (id, patch) =>
    set((s) => {
      const p = s.portfolios[id]
      if (p) Object.assign(p, patch)
    }),

  removePortfolio: (id) =>
    set((s) => {
      delete s.portfolios[id]
      s.portfolioOrder = s.portfolioOrder.filter((x) => x !== id)
    }),

  duplicatePortfolio: (id) => {
    const src = get().portfolios[id]
    if (!src) return null
    const copy: Portfolio = {
      ...src,
      id: newId('pf'),
      name: `${src.name} (copy)`,
      allocations: structuredClone(src.allocations),
      fx: { ...src.fx },
      overlay: src.overlay ? { ...src.overlay } : null,
    }
    set((s) => {
      s.portfolios[copy.id] = copy
      s.portfolioOrder.push(copy.id)
    })
    return copy.id
  },

  setAllocation: (portfolioId, fundId, allocatedCommitment) =>
    set((s) => {
      const p = s.portfolios[portfolioId]
      if (p) p.allocations[fundId] = { allocatedCommitment }
    }),

  removeAllocation: (portfolioId, fundId) =>
    set((s) => {
      const p = s.portfolios[portfolioId]
      if (p) delete p.allocations[fundId]
    }),

  setFxRate: (portfolioId, from, to, rate) =>
    set((s) => {
      const p = s.portfolios[portfolioId]
      if (p) p.fx[`${from}>${to}`] = rate
    }),

  setOverlay: (portfolioId, overlay) =>
    set((s) => {
      const p = s.portfolios[portfolioId]
      if (p) p.overlay = overlay
    }),
})
