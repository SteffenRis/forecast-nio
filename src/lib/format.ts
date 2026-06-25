// Small display + parse helpers, shared across screens. (First introduced for the
// Templates editor; reused by later forecast views.)

/** Parse a free-typed numeric field. Returns null for empty/invalid input. */
export function parseNumberInput(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Format a dimensionless ratio (PIC/DPI/TVPI multiple) for display. */
export function formatRatio(n: number, dp = 2): string {
  return n.toFixed(dp)
}

/** Format a fraction as a percent string, e.g. 0.6 → "60%". */
export function formatPercent(n: number, dp = 0): string {
  return `${(n * 100).toFixed(dp)}%`
}
