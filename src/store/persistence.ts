import type { StoreState } from './storeState'
import { buildSeed } from './seed'
import type { Fund, Portfolio, Settings, Template } from './types'

export const PERSIST_NAME = 'fundframe-forecasting'
// v2: Template gained description/assetClass/fundLifeYears and a fixed 4-case shape
// (Scenario.dpiVsBase). v3: Fund gained descriptive fields (gpName, fundSizeActual,
// targetFundSize, acceptanceDate). A bump resets old localStorage to the new seed
// (see migrate); JSON export/import is the escape hatch.
export const PERSIST_VERSION = 3
export const SCHEMA_VERSION = 3

/** The portable data document (the "save file"). */
export interface SnapshotData {
  templates: Record<string, Template>
  templateOrder: string[]
  funds: Record<string, Fund>
  fundOrder: string[]
  portfolios: Record<string, Portfolio>
  portfolioOrder: string[]
  settings: Settings
}

export interface DataSnapshot {
  schemaVersion: number
  exportedAt: string
  data: SnapshotData
}

export function dataFromState(s: StoreState): SnapshotData {
  return {
    templates: s.templates,
    templateOrder: s.templateOrder,
    funds: s.funds,
    fundOrder: s.fundOrder,
    portfolios: s.portfolios,
    portfolioOrder: s.portfolioOrder,
    settings: s.settings,
  }
}

/** What `persist` writes to localStorage (data slices + the one persisted ui flag).
 *  `fxRates` is persisted so pulled rates survive a reload, but is deliberately kept
 *  out of SnapshotData — it's a re-pullable reference cache, not part of the portable
 *  document, so the export schema is untouched. (Additive on load: an old localStorage
 *  without `fxRates` simply falls back to the slice's empty initial state.) */
export function partialize(s: StoreState): Partial<StoreState> {
  return {
    ...dataFromState(s),
    fxRates: s.fxRates,
    ui: { sidebarCollapsed: s.ui.sidebarCollapsed },
  }
}

export function serializeSnapshot(s: StoreState): string {
  const snap: DataSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: dataFromState(s),
  }
  return JSON.stringify(snap, null, 2)
}

export type ParseResult =
  | { ok: true; data: SnapshotData }
  | { ok: false; error: string }

/** Shallow validation only — a deliberate prototype trade-off (see ARCHITECTURE.md). */
export function parseSnapshot(text: string): ParseResult {
  try {
    const parsed = JSON.parse(text) as Partial<DataSnapshot>
    const d = parsed?.data
    if (!d || typeof d !== 'object') {
      return { ok: false, error: 'Not a FundFrame export (missing "data").' }
    }
    if (!d.templates || !d.funds || !d.portfolios) {
      return { ok: false, error: 'Export is missing required collections.' }
    }
    return { ok: true, data: d as SnapshotData }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' }
  }
}

/** Prototype migration policy: reset to the seeded default on any version mismatch. */
export function migrate(persisted: unknown, version: number): StoreState {
  if (version !== PERSIST_VERSION) {
    return buildSeed() as unknown as StoreState
  }
  return persisted as StoreState
}
