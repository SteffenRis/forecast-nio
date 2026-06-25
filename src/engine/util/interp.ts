// Linear interpolation helpers shared by §2 / §3.2 / §5 / §6.

/** Linear interpolation between (x0,y0) and (x1,y1) at x. */
export function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Sample a piecewise-linear function defined by sorted control points
 * {x, y} at an arbitrary u.
 *  - u <= first.x  → first.y (no extrapolation below; callers pin x=0 themselves)
 *  - u >= last.x   → last.y  (flat after last)
 *  - otherwise linear between bracketing points.
 */
export function interpAt(points: { x: number; y: number }[], u: number): number {
  const n = points.length;
  if (n === 0) return 0;
  if (u <= points[0].x) return points[0].y;
  if (u >= points[n - 1].x) return points[n - 1].y;
  // Binary search for the bracketing interval.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= u) lo = mid;
    else hi = mid;
  }
  return lerp(u, points[lo].x, points[lo].y, points[hi].x, points[hi].y);
}
