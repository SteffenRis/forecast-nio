// §2 Curve expansion (sparse → dense → quarterly).
// Produces a dense quarterly curve indexed by inception-quarter (1-indexed).

import type { SparseCurve, Granularity, Ratio } from './types';

/**
 * §2.1 Sparse interpolation. Returns the cumulative value at a given period
 * index (in the curve's native granularity — year index if annual, inception
 * quarter if quarterly), `terminalPeriod` is the largest index we will query.
 *  - before first point → 0 (implicit anchor at period 0)
 *  - between points → linear
 *  - after last point → flat at last value
 */
export function sparseValueAt(curve: SparseCurve, period: number): Ratio {
  const pts = curve.points;
  if (pts.length === 0) return 0;
  // Before/at the implicit 0 anchor.
  if (period <= 0) return 0;
  // Before the first stored point: interpolate from (0,0) to (q1,V1).
  if (period < pts[0].period) {
    const { period: q1, value: v1 } = pts[0];
    if (q1 <= 0) return v1;
    return (period / q1) * v1;
  }
  // After the last stored point: flat.
  const last = pts[pts.length - 1];
  if (period >= last.period) return last.value;
  // Between two stored points.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (period >= a.period && period <= b.period) {
      if (b.period === a.period) return b.value;
      return a.value + ((period - a.period) / (b.period - a.period)) * (b.value - a.value);
    }
  }
  return last.value;
}

/**
 * §2.2 Expand a curve to a dense quarterly array indexed by inception-quarter
 * 1..nQuarters. For annual granularity:
 *   q = 4(y−1) + k, V(q) = V_{y−1} + (k/4)(V_y − V_{y−1})
 * For quarterly granularity, sample the sparse curve directly per quarter.
 */
export function expandCurve(
  curve: SparseCurve,
  granularity: Granularity,
  nQuarters: number,
): Ratio[] {
  const out: Ratio[] = new Array(nQuarters);
  if (granularity === 'annual') {
    // Annual cumulative at year y (V_0 = 0).
    const annualAt = (y: number): Ratio => (y <= 0 ? 0 : sparseValueAt(curve, y));
    for (let q = 1; q <= nQuarters; q++) {
      const y = Math.ceil(q / 4);
      const k = q - 4 * (y - 1); // 1..4
      const vPrev = annualAt(y - 1);
      const vCur = annualAt(y);
      out[q - 1] = vPrev + (k / 4) * (vCur - vPrev);
    }
  } else {
    for (let q = 1; q <= nQuarters; q++) {
      out[q - 1] = sparseValueAt(curve, q);
    }
  }
  return out;
}
