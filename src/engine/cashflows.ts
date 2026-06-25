// §9 Net cash flows.
// From calendar-mapped PIC/DPI/TVPI and commitment C:
//   P=PIC·C, D=DPI·P, NAV=max(0, TVPI·P − D); periodic p,d,N.

import type {
  CalendarQuarter,
  Ratio,
  Money,
  ScenarioCashflows,
  Warning,
  FundStatus,
} from './types';
import { pushWarning } from './warnings';

export interface ComputeCashflowsInput {
  scenarioId: string;
  quarters: CalendarQuarter[];
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  commitment: Money;
  warnings: Warning[];
  /** For WOUND_DOWN/ABANDONED: zero NAV & flows after this index. */
  status?: FundStatus;
  lastActualIndex?: number;
}

export function computeCashflows(input: ComputeCashflowsInput): ScenarioCashflows {
  const { quarters, pic, dpi, tvpi, commitment: C, warnings } = input;
  const n = quarters.length;
  const P: Money[] = new Array(n);
  const D: Money[] = new Array(n);
  const NAV: Money[] = new Array(n);
  for (let i = 0; i < n; i++) {
    P[i] = pic[i] * C;
    D[i] = dpi[i] * P[i];
    let nav = tvpi[i] * P[i] - D[i];
    if (nav < 0) {
      pushWarning(warnings, 'negative_nav_clamped', 'NAV clamped at 0.', {
        scenario: input.scenarioId,
        index: i,
      });
      nav = 0;
    }
    NAV[i] = nav;
  }

  // Status zeroing: for WOUND_DOWN / ABANDONED, forward quarters are zero.
  const isDead = input.status === 'WOUND_DOWN' || input.status === 'ABANDONED';
  const lastIdx = input.lastActualIndex ?? -1;
  if (isDead && lastIdx >= 0) {
    for (let i = lastIdx + 1; i < n; i++) {
      // Hold cumulative flat → p=d=0; zero NAV forward (output as zeros).
      P[i] = P[lastIdx];
      D[i] = D[lastIdx];
      NAV[i] = 0;
    }
    // At the last actual quarter NAV stays as the realized NAV.
  }

  const p: Money[] = new Array(n);
  const d: Money[] = new Array(n);
  const N: Money[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const Pprev = i === 0 ? 0 : P[i - 1];
    const Dprev = i === 0 ? 0 : D[i - 1];
    p[i] = P[i] - Pprev;
    d[i] = D[i] - Dprev;
    N[i] = d[i] - p[i];
  }

  return { scenarioId: input.scenarioId, quarters, P, D, NAV, p, d, N };
}

/**
 * §9 remaining_callable scalar = C − P_last_actual + R_last_actual.
 * Returns the value (may be negative → UI shows 0 + overcalled indicator).
 */
export function remainingCallable(
  commitment: Money,
  pLastActual: Money,
  recallableBalance: Money,
  warnings?: Warning[],
): Money {
  const v = commitment - pLastActual + recallableBalance;
  if (v < 0 && warnings) {
    pushWarning(warnings, 'overcalled', `Overcalled by ${-v}.`, { amount: -v });
  }
  return v;
}
