import type { SliceCreator } from '../storeState'
import type { Settings } from '../types'

export interface SettingsSlice {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCurrency: 'EUR',
  locale: 'en-US',
  showRollingIrr: false,
}

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set) => ({
  settings: { ...DEFAULT_SETTINGS },
  updateSettings: (patch) =>
    set((s) => {
      Object.assign(s.settings, patch)
    }),
})
