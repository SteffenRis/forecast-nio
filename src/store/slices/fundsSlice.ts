import type { SliceCreator } from '../storeState'
import type {
  ActualsRecord,
  FeeTerms,
  Fund,
  FundSliders,
  ForecastOverride,
} from '../types'
import { newId } from '@/lib/id'

export interface FundsSlice {
  funds: Record<string, Fund>
  fundOrder: string[]

  addFund: (templateId: string, name?: string) => string
  updateFund: (
    id: string,
    patch: Partial<Omit<Fund, 'id' | 'fees' | 'sliders' | 'overrides' | 'actuals'>>,
  ) => void
  setFundFees: (id: string, patch: Partial<FeeTerms>) => void
  setFundSliders: (id: string, patch: Partial<FundSliders>) => void
  /** Replace a fund wholesale (the editor's Save path — commits a staged draft). */
  upsertFund: (fund: Fund) => void
  removeFund: (id: string) => void
  duplicateFund: (id: string) => string | null

  setFundOverrides: (id: string, overrides: ForecastOverride[]) => void
  setFundActuals: (id: string, actuals: ActualsRecord[]) => void
}

export const DEFAULT_SLIDERS: FundSliders = {
  dpiMultiplier: 1.0,
  dpiTiming: 0.0,
  concentration: 1.0,
}

/** Spec defaults (§3, §10): IP mgmt on commitment, post-IP on cost_basis, etc. */
export const DEFAULT_FEES: FeeTerms = {
  mgmtRateIp: 0.02,
  mgmtRatePostIp: 0.015,
  mgmtBasisIp: 'commitment',
  mgmtBasisPostIp: 'cost_basis',
  expenseRateIp: 0.0025,
  expenseRatePostIp: 0.0025,
  expenseBasisIp: 'commitment',
  expenseBasisPostIp: 'cost_basis',
  establishmentRate: 0.005,
  investmentPeriodEnd: '2029-01-01',
  carryRate: 0.2,
  hurdleAnnual: 0.08,
  catchUp: true,
}

export const createFundsSlice: SliceCreator<FundsSlice> = (set, get) => ({
  funds: {},
  fundOrder: [],

  addFund: (templateId, name = 'Untitled fund') => {
    const fund: Fund = {
      id: newId('fund'),
      name,
      templateId,
      commitment: 30_000_000,
      currency: 'EUR',
      effectiveDate: '2024-01-01',
      standardLiquidationDate: '2034-01-01',
      status: 'ACTIVE',
      sliders: { ...DEFAULT_SLIDERS },
      fees: { ...DEFAULT_FEES },
      overrides: [],
      actuals: [],
    }
    set((s) => {
      s.funds[fund.id] = fund
      s.fundOrder.push(fund.id)
    })
    return fund.id
  },

  updateFund: (id, patch) =>
    set((s) => {
      const f = s.funds[id]
      if (f) Object.assign(f, patch)
    }),

  setFundFees: (id, patch) =>
    set((s) => {
      const f = s.funds[id]
      if (f) Object.assign(f.fees, patch)
    }),

  setFundSliders: (id, patch) =>
    set((s) => {
      const f = s.funds[id]
      if (f) Object.assign(f.sliders, patch)
    }),

  upsertFund: (fund) =>
    set((s) => {
      s.funds[fund.id] = fund
      if (!s.fundOrder.includes(fund.id)) s.fundOrder.push(fund.id)
    }),

  removeFund: (id) =>
    set((s) => {
      delete s.funds[id]
      s.fundOrder = s.fundOrder.filter((x) => x !== id)
    }),

  duplicateFund: (id) => {
    const src = get().funds[id]
    if (!src) return null
    const copy: Fund = {
      ...src,
      id: newId('fund'),
      name: `${src.name} (copy)`,
      sliders: { ...src.sliders },
      fees: { ...src.fees },
      overrides: src.overrides.map((o) => ({ ...o, quarter: { ...o.quarter } })),
      actuals: src.actuals.map((a) => ({ ...a, quarter: { ...a.quarter } })),
    }
    set((s) => {
      s.funds[copy.id] = copy
      s.fundOrder.push(copy.id)
    })
    return copy.id
  },

  setFundOverrides: (id, overrides) =>
    set((s) => {
      const f = s.funds[id]
      if (f) f.overrides = overrides
    }),

  setFundActuals: (id, actuals) =>
    set((s) => {
      const f = s.funds[id]
      if (f) f.actuals = actuals
    }),
})
