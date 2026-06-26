import type { StateCreator } from 'zustand'
import type { TemplatesSlice } from './slices/templatesSlice'
import type { FundsSlice } from './slices/fundsSlice'
import type { PortfoliosSlice } from './slices/portfoliosSlice'
import type { SettingsSlice } from './slices/settingsSlice'
import type { FxRatesSlice } from './slices/fxRatesSlice'
import type { UiSlice } from './slices/uiSlice'

/** The whole app database = the union of all slices. */
export type StoreState = TemplatesSlice &
  FundsSlice &
  PortfoliosSlice &
  SettingsSlice &
  FxRatesSlice &
  UiSlice

/** Slice creator typed for the `persist(immer(...))` middleware stack. */
export type SliceCreator<T> = StateCreator<
  StoreState,
  [['zustand/persist', unknown], ['zustand/immer', never]],
  [],
  T
>
