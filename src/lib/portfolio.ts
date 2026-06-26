// Portfolio-side helpers that stay independent of the store/engine runtime (only
// primitives in/out), so they're trivially unit-testable and reusable across the
// editor and the roll-up.

/** Resolve an FX rate from a portfolio's flat 'FROM>TO' table, mirroring the engine's
 *  §11 auto-inversion: same currency → 1, direct rate, else inverse, else null (no
 *  path — the fund can't be aggregated until a rate exists). */
export function portfolioFxRate(
  fx: Record<string, number>,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1
  const direct = fx[`${from}>${to}`]
  if (direct !== undefined) return direct
  const inverse = fx[`${to}>${from}`]
  if (inverse !== undefined && inverse !== 0) return 1 / inverse
  return null
}
