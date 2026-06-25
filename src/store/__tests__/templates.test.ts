import { beforeEach, describe, expect, it } from 'vitest'
import { resetToSeed, useStore } from '..'

// Covers the Phase-2 template editor's store actions: the fixed 4-case shape,
// the dpiVsBase generator, fund-life clamping, and single-cell upserts.

beforeEach(() => {
  resetToSeed()
})

const get = () => useStore.getState()
const cases = (templateId: string) => {
  const t = get().templates[templateId]
  return t.scenarioOrder.map((id) => t.scenarios[id])
}

describe('templatesSlice — 4-case templates', () => {
  it('addTemplate builds four ordered cases with one base and default metadata', () => {
    const id = get().addTemplate('My template')
    const t = get().templates[id]

    expect(t.name).toBe('My template')
    expect(t.description).toBe('')
    expect(t.assetClass).toBe('large_cap_buyout')
    expect(t.fundLifeYears).toBe(10)
    expect(t.granularity).toBe('annual')

    const names = cases(id).map((c) => c.name)
    expect(names).toEqual(['Low-low', 'Low', 'Base', 'High'])

    const bases = cases(id).filter((c) => c.isBase)
    expect(bases).toHaveLength(1)
    expect(t.baseScenarioId).toBe(bases[0].id)

    // Every case carries one annual point per fund-life year.
    for (const c of cases(id)) {
      expect(c.dpi).toHaveLength(10)
      expect(c.pic).toHaveLength(10)
      expect(c.tvpi).toHaveLength(10)
    }
  })

  it('seeds non-base dpi/tvpi as base × dpiVsBase at creation', () => {
    const id = get().addTemplate()
    const t = get().templates[id]
    const base = t.scenarios[t.baseScenarioId]
    const lowLow = cases(id).find((c) => c.name === 'Low-low')!

    expect(lowLow.dpiVsBase).toBe(0.6)
    lowLow.dpi.forEach((p, i) => {
      expect(p.value).toBeCloseTo(base.dpi[i].value * 0.6, 4)
    })
    // PIC is untouched by the modifier — identical to base.
    lowLow.pic.forEach((p, i) => expect(p.value).toBe(base.pic[i].value))
  })

  it('setDpiVsBase re-seeds dpi & tvpi from base and stores the factor', () => {
    const id = get().addTemplate()
    const t0 = get().templates[id]
    const base = t0.scenarios[t0.baseScenarioId]
    const high = cases(id).find((c) => c.name === 'High')!
    const basePicBefore = high.pic.map((p) => p.value)

    get().setDpiVsBase(id, high.id, 1.5)

    const after = get().templates[id].scenarios[high.id]
    expect(after.dpiVsBase).toBe(1.5)
    after.dpi.forEach((p, i) => expect(p.value).toBeCloseTo(base.dpi[i].value * 1.5, 3))
    after.tvpi.forEach((p, i) => expect(p.value).toBeCloseTo(base.tvpi[i].value * 1.5, 3))
    // PIC unchanged by the generator.
    expect(after.pic.map((p) => p.value)).toEqual(basePicBefore)
  })

  it('setDpiVsBase is a no-op on the base case', () => {
    const id = get().addTemplate()
    const baseId = get().templates[id].baseScenarioId
    const before = get().templates[id].scenarios[baseId].dpi.map((p) => p.value)
    get().setDpiVsBase(id, baseId, 0.3)
    const after = get().templates[id].scenarios[baseId].dpi.map((p) => p.value)
    expect(after).toEqual(before)
  })

  it('setFundLife clamps to 1–15 and drops points beyond the horizon', () => {
    const id = get().addTemplate()

    get().setFundLife(id, 5)
    let t = get().templates[id]
    expect(t.fundLifeYears).toBe(5)
    for (const c of cases(id)) {
      expect(Math.max(...c.dpi.map((p) => p.periodIndex))).toBeLessThanOrEqual(5)
      expect(c.tvpi.every((p) => p.periodIndex <= 5)).toBe(true)
    }

    get().setFundLife(id, 99)
    expect(get().templates[id].fundLifeYears).toBe(15)
    get().setFundLife(id, 0)
    expect(get().templates[id].fundLifeYears).toBe(1)
  })

  it('generateBaseCurves builds a J-curve to the targets and re-derives non-base cases', () => {
    const id = get().addTemplate()
    get().setFundLife(id, 8)
    get().generateBaseCurves(id, 3, 3.4)

    const t = get().templates[id]
    const base = t.scenarios[t.baseScenarioId]

    // Base spans the fund life and hits the ultimate targets at the final year.
    expect(base.dpi).toHaveLength(8)
    expect(base.dpi.at(-1)!.value).toBeCloseTo(3, 4)
    expect(base.tvpi.at(-1)!.value).toBeCloseTo(3.4, 4)

    // DPI non-decreasing; TVPI ≥ DPI each year.
    let prev = -1
    for (const p of base.dpi) {
      expect(p.value).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = p.value
    }
    for (let y = 1; y <= 8; y++) {
      const d = base.dpi.find((p) => p.periodIndex === y)!.value
      const tv = base.tvpi.find((p) => p.periodIndex === y)!.value
      expect(tv).toBeGreaterThanOrEqual(d - 1e-9)
    }

    // Non-base cases are re-derived as base × their factor.
    const high = cases(id).find((c) => c.name === 'High')!
    high.dpi.forEach((p, i) => expect(p.value).toBeCloseTo(base.dpi[i].value * high.dpiVsBase, 3))
  })

  it('generateBaseCurves clamps ultimate TVPI to be ≥ ultimate DPI', () => {
    const id = get().addTemplate()
    get().generateBaseCurves(id, 2.5, 1.0) // TVPI target below DPI target
    const base = get().templates[id].scenarios[get().templates[id].baseScenarioId]
    expect(base.tvpi.at(-1)!.value).toBeCloseTo(2.5, 4) // clamped up to the DPI terminal
  })

  it('upsertTemplate replaces a template in place (the editor Save path)', () => {
    const id = get().addTemplate()
    const edited = structuredClone(get().templates[id])
    edited.name = 'Renamed'
    edited.fundLifeYears = 7
    get().upsertTemplate(edited)
    expect(get().templates[id].name).toBe('Renamed')
    expect(get().templates[id].fundLifeYears).toBe(7)
    expect(get().templateOrder.filter((x) => x === id)).toHaveLength(1) // no duplicate entry
  })

  it('setScenarioPoint upserts a single cell and keeps points sorted', () => {
    const id = get().addTemplate()
    const baseId = get().templates[id].baseScenarioId

    // Update an existing cell.
    get().setScenarioPoint(id, baseId, 'dpi', 3, 0.99)
    expect(get().templates[id].scenarios[baseId].dpi.find((p) => p.periodIndex === 3)!.value).toBe(
      0.99,
    )

    // Insert into a cleared curve out of order → stays sorted.
    get().setScenarioCurve(id, baseId, 'pic', [])
    get().setScenarioPoint(id, baseId, 'pic', 2, 0.4)
    get().setScenarioPoint(id, baseId, 'pic', 1, 0.2)
    const pic = get().templates[id].scenarios[baseId].pic
    expect(pic.map((p) => p.periodIndex)).toEqual([1, 2])
    expect(pic.map((p) => p.value)).toEqual([0.2, 0.4])
  })
})
