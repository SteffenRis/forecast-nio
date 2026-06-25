// §4 Concentration (scenario fan).
// Widens/narrows non-base scenarios around the adjusted base, per curve & quarter.

import type { Ratio, Warning } from './types';
import { pushWarning } from './warnings';

/**
 * Apply concentration for one non-base scenario curve.
 *  Primary (base ≠ 0): final = adjusted_base × (1 + conc·(ratio − 1)),
 *     ratio = scenario_template / base_template
 *  Fallback (base = 0): final = adjusted_base + conc·(scenario_template − base_template)
 *  Defensive clamp: final < 0 → 0 + warn.
 *
 * Inputs are aligned arrays in the SAME index space (calendar quarter).
 */
export function applyConcentration(
  adjustedBase: Ratio[],
  baseTemplate: Ratio[],
  scenarioTemplate: Ratio[],
  concentration: Ratio,
  warnings: Warning[],
  ctx?: { scenarioId?: string; curve?: string },
): Ratio[] {
  const n = adjustedBase.length;
  const out: Ratio[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ab = adjustedBase[i];
    const bt = baseTemplate[i];
    const st = scenarioTemplate[i];
    let final: number;
    if (bt !== 0) {
      const ratio = st / bt;
      final = ab * (1 + concentration * (ratio - 1));
    } else {
      final = ab + concentration * (st - bt);
    }
    if (final < 0) {
      pushWarning(
        warnings,
        'concentration_produced_negative_value',
        'Concentration produced a negative curve value; clamped to 0.',
        {
          ...(ctx?.scenarioId ? { scenario: ctx.scenarioId } : {}),
          ...(ctx?.curve ? { curve: ctx.curve } : {}),
          index: i,
        },
      );
      final = 0;
    }
    out[i] = final;
  }
  return out;
}
