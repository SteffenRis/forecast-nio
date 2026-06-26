import { beforeEach, describe, expect, it } from 'vitest'
import { resetToSeed, useStore } from '..'
import { selectFundBaselineForecast, selectFundForecast } from '../selectors/forecast'
import type { ActualsRecord } from '../types'

// The Performance screen's "Forecast" line is the BASELINE plan: the engine run
// with actuals stripped (no §7 rebasing). These prove the new selector ignores
// actuals while the existing selectFundForecast rebases to them.

beforeEach(() => {
  resetToSeed()
})

const get = () => useStore.getState()

/** Compare just the per-scenario quarter rows (the figures the screen shows). */
const rowsJson = (r: { scenarios: { rows: unknown[] }[] } | null) =>
  JSON.stringify((r?.scenarios ?? []).map((s) => s.rows))

describe('selectFundBaselineForecast', () => {
  it('equals selectFundForecast when the fund has no actuals', () => {
    const id = get().fundOrder[0]
    expect(get().funds[id].actuals).toHaveLength(0)

    const baseline = selectFundBaselineForecast(get(), id)
    const forecast = selectFundForecast(get(), id)

    expect(baseline).not.toBeNull()
    expect(baseline!.scenarios.length).toBeGreaterThan(0)
    expect(baseline!.scenarios[0].rows.length).toBeGreaterThan(0)
    expect(rowsJson(baseline)).toBe(rowsJson(forecast))
  })

  it('ignores actuals (baseline unchanged) while selectFundForecast rebases', () => {
    const id = get().fundOrder[0]
    const commitment = get().funds[id].commitment

    // Snapshot the plan before any actuals exist.
    const planBefore = rowsJson(selectFundBaselineForecast(get(), id))

    // An actual placed in-horizon, deliberately far from the plan, forces a rebase.
    const anchor = selectFundBaselineForecast(get(), id)!.scenarios[0].rows
    const q = anchor[Math.min(4, anchor.length - 1)].quarter
    const actual: ActualsRecord = {
      quarter: { year: q.year, q: q.q as 1 | 2 | 3 | 4 },
      cumulativePaidIn: commitment,
      cumulativeDistributions: 0,
      nav: commitment,
    }
    get().setFundActuals(id, [actual])

    const baselineAfter = rowsJson(selectFundBaselineForecast(get(), id))
    const forecastAfter = rowsJson(selectFundForecast(get(), id))

    // Baseline strips actuals → identical to the pre-actuals plan.
    expect(baselineAfter).toBe(planBefore)
    // The rebased forecast now reflects the actual → it diverges from the plan.
    expect(forecastAfter).not.toBe(planBefore)
  })
})
