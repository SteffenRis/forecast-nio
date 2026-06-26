// Shared shape for the "click a number → calculation trace" drawer. A pure builder
// (feeExplain, perfExplain, …) turns a clicked-cell reference R into an Explanation<R>;
// the generic CalcDrawer renders it and uses each step's optional `ref` as a drill
// target (clicking it traces that child number). Generic over R so every screen reuses
// the same drawer with its own cell-reference type.

export interface ExplainStep<R> {
  label: string
  value?: string
  note?: string
  /** When set, this step drills into another number (rendered as a button). */
  ref?: R
  /** The result row of the calculation (rendered bold). */
  emphasis?: boolean
}

export interface ExplainCheck {
  label: string
  pass: boolean
  detail: string
}

/** A small breakdown table (e.g. a portfolio number decomposed across its underlying
 *  funds). `columns` are the headers; each row's `cells` align to them. */
export interface ExplainBreakdown {
  columns: string[]
  rows: { cells: string[]; emphasis?: boolean }[]
}

export interface Explanation<R> {
  title: string
  value: string
  subtitle?: string
  formula?: string
  steps: ExplainStep<R>[]
  checks: ExplainCheck[]
  /** Optional tabular decomposition (rendered as a table under the steps). */
  breakdown?: ExplainBreakdown
}
