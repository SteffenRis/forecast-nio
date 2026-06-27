import { beforeEach, describe, expect, it } from 'vitest'
import { runFundForecast } from '@/engine'
import { resetToSeed, useStore } from '..'
import { parseSnapshot, serializeSnapshot } from '../persistence'
import {
  selectFundBaselineForecast,
  selectFundForecast,
  selectFundRecalibratedForecast,
  selectFundSetForecast,
} from '../selectors/forecast'
import type { ActualsRecord } from '../types'
import { buildSetVsUpdatedComparison } from '@/lib/setVsUpdated'
import { quarterFromOrdinal, quarterOfIso, quarterOrdinal } from '@/lib/quarter'

// The "set forecast" is the frozen plan we started with — re-derivable by the engine
// but immune to later edits of the fund, its template, sliders, fees, or overrides.
// These prove it stays put while the live `selectFundForecast` moves.

beforeEach(() => {
  resetToSeed()
})

const get = () => useStore.getState()

/** Just the per-scenario quarter rows (the figures the screen shows). */
const rowsJson = (r: { scenarios: { rows: unknown[] }[] } | null) =>
  JSON.stringify((r?.scenarios ?? []).map((s) => s.rows))

/** Place an actual far from plan, on a mid-life reporting quarter (UI convention:
 *  anchored to the fund's effective-date quarter), to force drift. */
function farActual(id: string): ActualsRecord {
  const fund = get().funds[id]
  const q = quarterFromOrdinal(quarterOrdinal(quarterOfIso(fund.effectiveDate)) + 8)
  return {
    quarter: { year: q.year, q: q.q as 1 | 2 | 3 | 4 },
    cumulativePaidIn: fund.commitment * 0.2,
    cumulativeDistributions: 0,
    nav: fund.commitment * 0.2,
  }
}

describe('selectFundSetForecast', () => {
  it('the seed fund starts with a set forecast equal to its actuals-free plan', () => {
    const id = get().fundOrder[0]
    expect(get().funds[id].setForecast).toBeDefined()

    const set = selectFundSetForecast(get(), id)
    expect(set).not.toBeNull()
    expect(set!.scenarios[0].rows.length).toBeGreaterThan(0)
    // No actuals and no edits yet → the frozen plan matches the live baseline.
    expect(rowsJson(set)).toBe(rowsJson(selectFundBaselineForecast(get(), id)))
  })

  it('is null when the fund has no set forecast', () => {
    const id = get().fundOrder[0]
    get().clearFundForecast(id)
    expect(selectFundSetForecast(get(), id)).toBeNull()
  })

  it('stays FROZEN against slider edits while the live forecast moves', () => {
    const id = get().fundOrder[0]
    const setBefore = rowsJson(selectFundSetForecast(get(), id))
    const liveBefore = rowsJson(selectFundForecast(get(), id))

    get().setFundSliders(id, { dpiMultiplier: 1.5 })

    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setBefore) // frozen
    expect(rowsJson(selectFundForecast(get(), id))).not.toBe(liveBefore) // moved
  })

  it('stays FROZEN against template edits (template is inlined by value)', () => {
    const id = get().fundOrder[0]
    const templateId = get().funds[id].templateId
    const baseId = get().templates[templateId].baseScenarioId
    const setBefore = rowsJson(selectFundSetForecast(get(), id))
    const liveBefore = rowsJson(selectFundForecast(get(), id))

    get().setScenarioPoint(templateId, baseId, 'dpi', 10, 3.0)

    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setBefore) // frozen
    expect(rowsJson(selectFundForecast(get(), id))).not.toBe(liveBefore) // moved
  })

  it('stays FROZEN against added actuals while the live forecast rebases', () => {
    const id = get().fundOrder[0]
    const setBefore = rowsJson(selectFundSetForecast(get(), id))

    get().setFundActuals(id, [farActual(id)])

    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setBefore) // frozen
    // The live forecast now reflects the actual → it diverges from the frozen plan.
    expect(rowsJson(selectFundForecast(get(), id))).not.toBe(setBefore)
  })

  it('re-set captures the current inputs (overwrites the frozen baseline)', () => {
    const id = get().fundOrder[0]
    const setBefore = rowsJson(selectFundSetForecast(get(), id))

    get().setFundSliders(id, { dpiMultiplier: 1.5 })
    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setBefore) // still old

    get().setFundForecast(id, '2030-01-01T00:00:00.000Z')

    // Re-set now reflects the new slider, and equals the current (no-actuals) plan.
    expect(rowsJson(selectFundSetForecast(get(), id))).not.toBe(setBefore)
    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(
      rowsJson(selectFundBaselineForecast(get(), id)),
    )
    expect(get().funds[id].setForecast!.setAt).toBe('2030-01-01T00:00:00.000Z')
  })

  it('addFund auto-captures an inception set forecast', () => {
    const templateId = get().funds[get().fundOrder[0]].templateId
    const newId = get().addFund(templateId, 'Fresh fund')

    expect(get().funds[newId].setForecast).toBeDefined()
    const set = selectFundSetForecast(get(), newId)
    expect(set).not.toBeNull()
    expect(rowsJson(set)).toBe(rowsJson(selectFundBaselineForecast(get(), newId)))
  })
})

describe('selectFundRecalibratedForecast', () => {
  it('equals the active forecast when the fund has no actuals', () => {
    const id = get().fundOrder[0]
    expect(get().funds[id].actuals).toHaveLength(0)
    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).toBe(
      rowsJson(selectFundSetForecast(get(), id)),
    )
  })

  it('is null until an active forecast exists', () => {
    const id = get().fundOrder[0]
    get().clearFundForecast(id)
    expect(selectFundRecalibratedForecast(get(), id)).toBeNull()
  })

  it('auto-tracks actuals (recomputes when actuals change)', () => {
    const id = get().fundOrder[0]
    const before = rowsJson(selectFundRecalibratedForecast(get(), id))
    get().setFundActuals(id, [farActual(id)])
    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).not.toBe(before)
  })

  it('is ANCHORED to the active forecast: a later slider edit does not move it', () => {
    const id = get().fundOrder[0]
    get().setFundActuals(id, [farActual(id)])
    const recalBefore = rowsJson(selectFundRecalibratedForecast(get(), id))
    const liveBefore = rowsJson(selectFundForecast(get(), id))

    get().setFundSliders(id, { dpiMultiplier: 1.5 })

    // The recalibrated forecast is built from the frozen active baseline → unchanged.
    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).toBe(recalBefore)
    // The live forecast absorbs the slider edit → it moves.
    expect(rowsJson(selectFundForecast(get(), id))).not.toBe(liveBefore)
  })

  it('re-setting the active forecast folds live plan edits into the recalibration', () => {
    const id = get().fundOrder[0]
    get().setFundActuals(id, [farActual(id)])
    const recalBefore = rowsJson(selectFundRecalibratedForecast(get(), id))

    get().setFundSliders(id, { dpiMultiplier: 1.5 })
    get().setFundForecast(id, '2030-01-01T00:00:00.000Z') // new active = current live plan

    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).not.toBe(recalBefore)
  })

  it('policy change moves the recalibrated forecast', () => {
    const id = get().fundOrder[0]
    get().setFundActuals(id, [farActual(id)])
    const scaleRows = rowsJson(selectFundRecalibratedForecast(get(), id))
    get().setFundPolicy(id, 'keep_plan')
    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).not.toBe(scaleRows)
  })
})

describe('forecast-update policy', () => {
  it('new funds default to scale; changing policy moves the live forecast, not the set forecast', () => {
    const id = get().fundOrder[0]
    expect(get().funds[id].policy?.mode).toBe('scale')
    get().setFundActuals(id, [farActual(id)])

    const setBefore = rowsJson(selectFundSetForecast(get(), id))
    const scaleForecast = rowsJson(selectFundForecast(get(), id))

    get().setFundPolicy(id, 'keep_plan')
    const keepForecast = rowsJson(selectFundForecast(get(), id))

    expect(keepForecast).not.toBe(scaleForecast) // policy changed the live forecast
    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setBefore) // baseline frozen
  })
})

describe('actuals quarter-convention (regression for the dropped-actual bug)', () => {
  it('applies an actual entered at the effective-date quarter (was silently dropped)', () => {
    const id = get().fundOrder[0]
    const fund = get().funds[id]
    // The exact bug case: an actual at the fund's effective-date quarter (Q1 2024 for
    // the seed). Previously this matched no engine forecast row and was dropped.
    const q = quarterOfIso(fund.effectiveDate)
    const actual: ActualsRecord = {
      quarter: { year: q.year, q: q.q },
      cumulativePaidIn: 1_000_000,
      cumulativeDistributions: 300_000,
      nav: 1_200_000,
    }

    const activeRows = rowsJson(selectFundSetForecast(get(), id))
    get().setFundActuals(id, [actual])

    // The recalibrated + live forecasts now reflect the actual (previously: zero effect).
    expect(rowsJson(selectFundRecalibratedForecast(get(), id))).not.toBe(activeRows)
    expect(rowsJson(selectFundForecast(get(), id))).not.toBe(
      rowsJson(selectFundBaselineForecast(get(), id)),
    )

    // In the Active-vs-recalibrated comparison, the effective-date quarter's Recalibrated
    // row shows the ACTUAL contributed (1,000,000), not the plan.
    const snapInput = get().funds[id].setForecast!.input
    const setScn = selectFundSetForecast(get(), id)!.scenarios[0]
    const recalScn = selectFundRecalibratedForecast(get(), id)!.scenarios[0]
    const rows = buildSetVsUpdatedComparison({
      commitment: snapInput.commitment,
      effectiveDate: snapInput.effectiveDate,
      setRows: setScn.rows,
      updatedRows: recalScn.rows,
    })
    const first = rows.find((r) => r.quarter.year === q.year && r.quarter.q === q.q)!
    expect(Math.round(first.updated!.contributed)).toBe(1_000_000)
    expect(first.set!.contributed).toBeGreaterThan(first.updated!.contributed) // plan > actual
  })
})

describe('persistence', () => {
  it('round-trips policy + set forecast through serialize → parse → import', () => {
    const id = get().fundOrder[0]
    get().setFundPolicy(id, 'keep_plan')
    const setRows = rowsJson(selectFundSetForecast(get(), id))

    const res = parseSnapshot(serializeSnapshot(get() as never))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const f = res.data.funds[id]
    expect(f.policy?.mode).toBe('keep_plan')
    expect(f.setForecast).toBeDefined()
    // Re-deriving from the imported snapshot reproduces the frozen forecast.
    expect(rowsJson(runFundForecast(f.setForecast!.input))).toBe(setRows)

    // Simulate import (what importData does) and confirm the selector still works.
    useStore.setState({ funds: res.data.funds, fundOrder: res.data.fundOrder })
    expect(rowsJson(selectFundSetForecast(get(), id))).toBe(setRows)
  })
})
