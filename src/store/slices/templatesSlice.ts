import type { SliceCreator } from '../storeState'
import type { CurveKind, Scenario, SparsePoint, Template } from '../types'
import { newId } from '@/lib/id'
import {
  applyDpiVsBase,
  applyFundLife,
  applyGenerateBase,
  applyScenarioPoint,
  makeTemplate,
} from '@/lib/curves'

export interface TemplatesSlice {
  templates: Record<string, Template>
  templateOrder: string[]

  addTemplate: (name?: string) => string
  updateTemplate: (id: string, patch: Partial<Omit<Template, 'id' | 'scenarios'>>) => void
  removeTemplate: (id: string) => void
  duplicateTemplate: (id: string) => string | null
  /** Replace a whole template (the editor's Save commits its draft through here). */
  upsertTemplate: (template: Template) => void

  /** Set fund life (clamped 1–15) and drop any curve points beyond the new horizon. */
  setFundLife: (templateId: string, years: number) => void
  /** Upsert a single cell on one curve of one case. */
  setScenarioPoint: (
    templateId: string,
    scenarioId: string,
    kind: CurveKind,
    periodIndex: number,
    value: number,
  ) => void
  /** Non-base modifier: store the factor and re-seed dpi/tvpi = base × factor (PIC untouched). */
  setDpiVsBase: (templateId: string, scenarioId: string, factor: number) => void
  /** Generate a normal J-curve base from target ultimate DPI/TVPI over the current
   *  fund life, then re-derive the non-base cases from it. */
  generateBaseCurves: (templateId: string, ultimateDpi: number, ultimateTvpi: number) => void

  // Lower-level scenario CRUD (kept for completeness; the editor uses the helpers above).
  addScenario: (templateId: string, name?: string) => string | null
  updateScenario: (
    templateId: string,
    scenarioId: string,
    patch: Partial<Omit<Scenario, 'id'>>,
  ) => void
  removeScenario: (templateId: string, scenarioId: string) => void
  setScenarioCurve: (
    templateId: string,
    scenarioId: string,
    kind: CurveKind,
    points: SparsePoint[],
  ) => void
}

function emptyScenario(name: string, isBase: boolean): Scenario {
  return { id: newId('scn'), name, isBase, dpiVsBase: 1.0, pic: [], dpi: [], tvpi: [] }
}

export const createTemplatesSlice: SliceCreator<TemplatesSlice> = (set, get) => ({
  templates: {},
  templateOrder: [],

  addTemplate: (name = 'Untitled template') => {
    const template = makeTemplate(name)
    set((s) => {
      s.templates[template.id] = template
      s.templateOrder.push(template.id)
    })
    return template.id
  },

  updateTemplate: (id, patch) =>
    set((s) => {
      const t = s.templates[id]
      if (t) Object.assign(t, patch)
    }),

  removeTemplate: (id) =>
    set((s) => {
      delete s.templates[id]
      s.templateOrder = s.templateOrder.filter((x) => x !== id)
    }),

  duplicateTemplate: (id) => {
    const src = get().templates[id]
    if (!src) return null
    const idMap = new Map<string, string>()
    const scenarios: Record<string, Scenario> = {}
    for (const sid of src.scenarioOrder) {
      const scn = src.scenarios[sid]
      const copy: Scenario = {
        ...scn,
        id: newId('scn'),
        pic: scn.pic.map((p) => ({ ...p })),
        dpi: scn.dpi.map((p) => ({ ...p })),
        tvpi: scn.tvpi.map((p) => ({ ...p })),
      }
      idMap.set(sid, copy.id)
      scenarios[copy.id] = copy
    }
    const copy: Template = {
      ...src,
      id: newId('tpl'),
      name: `${src.name} (copy)`,
      scenarios,
      scenarioOrder: src.scenarioOrder.map((sid) => idMap.get(sid)!),
      baseScenarioId: idMap.get(src.baseScenarioId)!,
    }
    set((s) => {
      s.templates[copy.id] = copy
      s.templateOrder.push(copy.id)
    })
    return copy.id
  },

  upsertTemplate: (template) =>
    set((s) => {
      s.templates[template.id] = template
      if (!s.templateOrder.includes(template.id)) s.templateOrder.push(template.id)
    }),

  setFundLife: (templateId, years) =>
    set((s) => {
      const t = s.templates[templateId]
      if (t) applyFundLife(t, years)
    }),

  setScenarioPoint: (templateId, scenarioId, kind, periodIndex, value) =>
    set((s) => {
      const t = s.templates[templateId]
      if (t) applyScenarioPoint(t, scenarioId, kind, periodIndex, value)
    }),

  setDpiVsBase: (templateId, scenarioId, factor) =>
    set((s) => {
      const t = s.templates[templateId]
      if (t) applyDpiVsBase(t, scenarioId, factor)
    }),

  generateBaseCurves: (templateId, ultimateDpi, ultimateTvpi) =>
    set((s) => {
      const t = s.templates[templateId]
      if (t) applyGenerateBase(t, ultimateDpi, ultimateTvpi)
    }),

  addScenario: (templateId, name = 'Scenario') => {
    const t = get().templates[templateId]
    if (!t) return null
    const scn = emptyScenario(name, false)
    set((s) => {
      s.templates[templateId].scenarios[scn.id] = scn
      s.templates[templateId].scenarioOrder.push(scn.id)
    })
    return scn.id
  },

  updateScenario: (templateId, scenarioId, patch) =>
    set((s) => {
      const scn = s.templates[templateId]?.scenarios[scenarioId]
      if (scn) Object.assign(scn, patch)
    }),

  removeScenario: (templateId, scenarioId) =>
    set((s) => {
      const t = s.templates[templateId]
      if (!t || t.baseScenarioId === scenarioId) return // never remove the base
      delete t.scenarios[scenarioId]
      t.scenarioOrder = t.scenarioOrder.filter((x) => x !== scenarioId)
    }),

  setScenarioCurve: (templateId, scenarioId, kind, points) =>
    set((s) => {
      const scn = s.templates[templateId]?.scenarios[scenarioId]
      if (scn) scn[kind] = points
    }),
})
