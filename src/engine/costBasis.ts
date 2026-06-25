// §10.3 Cost basis (split out so the overlay can reuse it).
//   cost_basis(q) = max(0, P(q) − D(q)/TVPI_terminal)
//                 = max(0, P(q)·(1 − DPI(q)/TVPI_terminal))
// Clamp at 0 (warn cost_basis_clamped). TVPI_terminal is scenario-specific.

import type { Money, Ratio, Warning } from './types';
import { pushWarning } from './warnings';

export function computeCostBasis(
  P: Money[],
  D: Money[],
  tvpiTerminal: Ratio,
  warnings?: Warning[],
  scenarioId?: string,
): Money[] {
  const n = P.length;
  const out: Money[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let cb: number;
    if (tvpiTerminal === 0) {
      cb = P[i]; // degenerate; no harvest scaling
    } else {
      cb = P[i] - D[i] / tvpiTerminal;
    }
    if (cb < 0) {
      if (warnings) {
        pushWarning(warnings, 'cost_basis_clamped', 'Cost basis clamped at 0.', {
          ...(scenarioId ? { scenario: scenarioId } : {}),
          index: i,
        });
      }
      cb = 0;
    }
    out[i] = cb;
  }
  return out;
}
