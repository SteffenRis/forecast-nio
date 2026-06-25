// §3 Sliders — reshape the base scenario's curves (in inception-quarter space).
// Apply in order: §3.1 DPI multiplier, then §3.2 DPI timing.

import type { Ratio } from './types';
import { interpAt } from './util/interp';

/**
 * §3.1 Ultimate DPI multiplier. Scales DPI and TVPI proportionally; PIC
 * unchanged. Returns new arrays (never mutates inputs).
 */
export function applyDpiMultiplier(
  dpi: Ratio[],
  tvpi: Ratio[],
  multiplier: Ratio,
): { dpi: Ratio[]; tvpi: Ratio[] } {
  return {
    dpi: dpi.map((v) => v * multiplier),
    tvpi: tvpi.map((v) => v * multiplier),
  };
}

/**
 * §3.2 DPI timing. exponent = 2^dpi_timing applied to the TIME AXIS.
 * With normalized time t(q) = q / q_terminal:
 *   DPI_timed(q) = DPI'_interp( t(q)^exponent )
 * where DPI'_interp linearly interpolates the step-3.1 DPI curve at normalized
 * time u ∈ [0,1]. Endpoints pinned (0^exp=0, 1^exp=1). Reshapes DPI only.
 */
export function applyDpiTiming(dpi: Ratio[], dpiTiming: Ratio): Ratio[] {
  const n = dpi.length;
  if (n === 0) return [];
  const exponent = Math.pow(2, dpiTiming);
  // Identity fast-path keeps it exact (I14).
  if (dpiTiming === 0) return dpi.slice();

  const qTerminal = n; // inception-quarter terminal index
  // Control points: include the implicit (0,0) anchor at normalized t=0.
  const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (let q = 1; q <= n; q++) {
    points.push({ x: q / qTerminal, y: dpi[q - 1] });
  }
  const out: Ratio[] = new Array(n);
  for (let q = 1; q <= n; q++) {
    const t = q / qTerminal;
    const u = Math.pow(t, exponent);
    out[q - 1] = interpAt(points, u);
  }
  return out;
}
