import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import type { StoreState } from './storeState'
import { createTemplatesSlice } from './slices/templatesSlice'
import { createFundsSlice } from './slices/fundsSlice'
import { createPortfoliosSlice } from './slices/portfoliosSlice'
import { createSettingsSlice } from './slices/settingsSlice'
import { createUiSlice } from './slices/uiSlice'
import {
  PERSIST_NAME,
  PERSIST_VERSION,
  migrate,
  parseSnapshot,
  partialize,
  serializeSnapshot,
} from './persistence'
import { buildSeed } from './seed'
import { downloadText, pickTextFile } from '@/lib/download'

const hadPersisted =
  typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_NAME) != null

export const useStore = create<StoreState>()(
  persist(
    immer((...a) => ({
      ...createTemplatesSlice(...a),
      ...createFundsSlice(...a),
      ...createPortfoliosSlice(...a),
      ...createSettingsSlice(...a),
      ...createUiSlice(...a),
    })),
    {
      name: PERSIST_NAME,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize,
      migrate,
    },
  ),
)

// Seed the §16 reference example on the very first run (nothing persisted yet),
// so a client opens to a working forecast rather than a blank app.
if (!hadPersisted) {
  useStore.setState(buildSeed())
}

export type { StoreState } from './storeState'

// ---- The "document" layer: export / import / reset -----------------------

export function exportData(): void {
  const json = serializeSnapshot(useStore.getState())
  const date = new Date().toISOString().slice(0, 10)
  downloadText(`fundframe-${date}.json`, json)
}

export async function importData(): Promise<{ ok: boolean; error?: string }> {
  const text = await pickTextFile()
  if (text == null) return { ok: false, error: 'No file selected.' }
  const res = parseSnapshot(text)
  if (!res.ok) return { ok: false, error: res.error }
  const d = res.data
  useStore.setState({
    templates: d.templates,
    templateOrder: d.templateOrder ?? Object.keys(d.templates),
    funds: d.funds,
    fundOrder: d.fundOrder ?? Object.keys(d.funds),
    portfolios: d.portfolios,
    portfolioOrder: d.portfolioOrder ?? Object.keys(d.portfolios),
    ...(d.settings ? { settings: d.settings } : {}),
  })
  return { ok: true }
}

export function resetToSeed(): void {
  useStore.setState(buildSeed())
}

export function clearAllData(): void {
  useStore.setState({
    templates: {},
    templateOrder: [],
    funds: {},
    fundOrder: [],
    portfolios: {},
    portfolioOrder: [],
  })
}
