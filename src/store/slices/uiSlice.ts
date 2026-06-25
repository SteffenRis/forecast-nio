import type { SliceCreator } from '../storeState'
import type { UiState } from '../types'

export interface UiSlice {
  ui: UiState
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  select: (patch: Partial<Omit<UiState, 'sidebarCollapsed'>>) => void
}

export const DEFAULT_UI: UiState = {
  sidebarCollapsed: false,
}

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
  ui: { ...DEFAULT_UI },
  toggleSidebar: () =>
    set((s) => {
      s.ui.sidebarCollapsed = !s.ui.sidebarCollapsed
    }),
  setSidebarCollapsed: (collapsed) =>
    set((s) => {
      s.ui.sidebarCollapsed = collapsed
    }),
  select: (patch) =>
    set((s) => {
      Object.assign(s.ui, patch)
    }),
})
