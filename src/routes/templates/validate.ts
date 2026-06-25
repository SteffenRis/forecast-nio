import type { Scenario, SparsePoint } from '@/store/types'

const valueAt = (points: SparsePoint[], year: number): number | undefined =>
  points.find((p) => p.periodIndex === year)?.value

/** Soft, non-blocking sanity checks on a case's curves over its fund life.
 *  These are hints, not hard rules — the engine accepts whatever is entered. */
export function validateScenario(scn: Scenario, years: number): string[] {
  const warnings: string[] = []
  const picDrops: number[] = []
  const dpiDrops: number[] = []
  const tvpiBelowDpi: number[] = []

  for (let y = 1; y <= years; y++) {
    const pic = valueAt(scn.pic, y)
    const dpi = valueAt(scn.dpi, y)
    const tvpi = valueAt(scn.tvpi, y)

    if (y > 1) {
      const picPrev = valueAt(scn.pic, y - 1)
      const dpiPrev = valueAt(scn.dpi, y - 1)
      if (pic !== undefined && picPrev !== undefined && pic < picPrev - 1e-9) picDrops.push(y)
      if (dpi !== undefined && dpiPrev !== undefined && dpi < dpiPrev - 1e-9) dpiDrops.push(y)
    }
    if (tvpi !== undefined && dpi !== undefined && tvpi < dpi - 1e-9) tvpiBelowDpi.push(y)
  }

  if (picDrops.length) warnings.push(`PIC should not decrease (year ${picDrops.join(', ')}).`)
  if (dpiDrops.length) warnings.push(`DPI should not decrease (year ${dpiDrops.join(', ')}).`)
  if (tvpiBelowDpi.length)
    warnings.push(`TVPI should be ≥ DPI (year ${tvpiBelowDpi.join(', ')}).`)

  return warnings
}
