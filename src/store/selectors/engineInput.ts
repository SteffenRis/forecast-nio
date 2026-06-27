// Pure mappers: store entities → engine JSON input shapes. Shared by the forecast
// selectors (store→engine bridge) and the funds slice (which freezes a fund's
// resolved input into its "set forecast" snapshot). No React, no store reads here.

import {
  reportingToForecastQuarter,
  type ActualRecord,
  type FeeParams,
  type ForecastOverrides,
  type FundInputJSON,
  type TemplateInput,
} from '@/engine'
import type { ActualsRecord, ForecastOverride, Fund, Template } from '../types'

export function toTemplateInput(t: Template): TemplateInput {
  return {
    granularity: t.granularity,
    scenarios: t.scenarioOrder.map((id) => {
      const scn = t.scenarios[id]
      return {
        id: scn.id,
        isBase: scn.isBase,
        pic: { points: scn.pic.map((p) => ({ period: p.periodIndex, value: p.value })) },
        dpi: { points: scn.dpi.map((p) => ({ period: p.periodIndex, value: p.value })) },
        tvpi: { points: scn.tvpi.map((p) => ({ period: p.periodIndex, value: p.value })) },
      }
    }),
  }
}

export function toFeeParams(f: Fund): FeeParams {
  const x = f.fees
  return {
    mgmtRateIP: x.mgmtRateIp,
    mgmtRatePostIP: x.mgmtRatePostIp,
    mgmtBasisIP: x.mgmtBasisIp,
    mgmtBasisPostIP: x.mgmtBasisPostIp,
    expenseRateIP: x.expenseRateIp,
    expenseRatePostIP: x.expenseRatePostIp,
    expenseBasisIP: x.expenseBasisIp,
    expenseBasisPostIP: x.expenseBasisPostIp,
    establishmentRate: x.establishmentRate,
    carryRate: x.carryRate,
    hurdleAnnual: x.hurdleAnnual,
    catchUp: x.catchUp,
  }
}

export function toOverrides(list: ForecastOverride[]): ForecastOverrides | undefined {
  if (list.length === 0) return undefined
  const out: ForecastOverrides = {}
  for (const o of list) {
    const arr = (out[o.curve] ??= [])
    arr.push({ quarter: { year: o.quarter.year, q: o.quarter.q }, value: o.value })
  }
  return out
}

/** Map store actuals onto engine ActualRecords, translating each one's quarter from
 *  the UI's effective-date-quarter convention to the engine's block-end forecast
 *  quarter (so `applyActuals` matches it). Parameterized by effectiveDate so callers
 *  can translate against either the live fund or a frozen snapshot's effective date.
 *  Actuals before the fund's first period are dropped. */
export function toActualsAt(
  actuals: ActualsRecord[],
  effectiveDateIso: string,
): ActualRecord[] | undefined {
  const out: ActualRecord[] = []
  for (const a of actuals) {
    const quarter = reportingToForecastQuarter(effectiveDateIso, {
      year: a.quarter.year,
      q: a.quarter.q,
    })
    if (!quarter) continue
    out.push({
      quarter,
      cumulativePaidIn: a.cumulativePaidIn,
      cumulativeDistributions: a.cumulativeDistributions,
      nav: a.nav,
      ...(a.recallableDistributions !== undefined
        ? { recallableBalance: a.recallableDistributions }
        : {}),
    })
  }
  return out.length ? out : undefined
}

export function toActuals(f: Fund): ActualRecord[] | undefined {
  return toActualsAt(f.actuals, f.effectiveDate)
}

export function toFundInput(f: Fund, t: Template): FundInputJSON {
  return {
    id: f.id,
    name: f.name,
    commitment: f.commitment,
    currency: f.currency,
    effectiveDate: f.effectiveDate,
    investmentPeriodEnd: f.fees.investmentPeriodEnd,
    standardLiquidationDate: f.standardLiquidationDate,
    ...(f.expectedLiquidationDate ? { expectedLiquidationDate: f.expectedLiquidationDate } : {}),
    template: toTemplateInput(t),
    sliders: { ...f.sliders },
    fees: toFeeParams(f),
    ...(toOverrides(f.overrides) ? { overrides: toOverrides(f.overrides) } : {}),
    ...(toActuals(f) ? { actuals: toActuals(f) } : {}),
    status: f.status,
    ...(f.policy ? { policy: f.policy.mode } : {}),
  }
}
