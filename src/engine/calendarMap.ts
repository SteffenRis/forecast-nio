// §5 Calendar mapping (inception-quarter → calendar-quarter, day-weighted 30/360).
// Day-weight CURRENCY flows, then rebuild ratios. NAV is a STOCK
// (linear-interpolate on time). Preserves cash-flow totals exactly.

import type { CalendarQuarter, Ratio, Money } from './types';
import {
  days30360,
  inceptionBlockStart,
  inceptionBlockEnd,
  calQuarterStart,
  calQuarterEnd,
  quarterOf,
  calQuarterRange,
  BLOCK_DAYS,
} from './util/daycount';

export interface CalendarMapInput {
  /** Inception-quarter ratios (1-indexed → index 0 = quarter 1). */
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  commitment: Money;
  effectiveDate: Date;
}

export interface CalendarMapResult {
  quarters: CalendarQuarter[];
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  /** Currency stocks for invariants/debug. */
  pCal: Money[];
  dCal: Money[];
  navCal: Money[];
}

/** overlap(i,c) in 30/360 days, clamped at 0. */
function overlap(
  dEff: Date,
  i: number,
  cStart: Date,
  cEnd: Date,
): number {
  const bStart = inceptionBlockStart(dEff, i);
  const bEnd = inceptionBlockEnd(dEff, i);
  const lo = bStart.getTime() > cStart.getTime() ? bStart : cStart;
  const hi = bEnd.getTime() < cEnd.getTime() ? bEnd : cEnd;
  return Math.max(0, days30360(lo, hi));
}

export function mapToCalendar(input: CalendarMapInput): CalendarMapResult {
  const { pic, dpi, tvpi, commitment: C, effectiveDate: dEff } = input;
  const nInc = pic.length;

  // 1. Inception-quarter currency stocks (P_inc(0)=D_inc(0)=NAV_inc(0)=0).
  const Pinc: Money[] = new Array(nInc + 1).fill(0);
  const Dinc: Money[] = new Array(nInc + 1).fill(0);
  const NAVinc: Money[] = new Array(nInc + 1).fill(0);
  for (let i = 1; i <= nInc; i++) {
    const p = pic[i - 1] * C;
    const d = dpi[i - 1] * p;
    const tv = tvpi[i - 1] * p;
    Pinc[i] = p;
    Dinc[i] = d;
    NAVinc[i] = Math.max(0, tv - d);
  }

  // 2. Flow increments.
  const dPinc: Money[] = new Array(nInc + 1).fill(0);
  const dDinc: Money[] = new Array(nInc + 1).fill(0);
  for (let i = 1; i <= nInc; i++) {
    dPinc[i] = Pinc[i] - Pinc[i - 1];
    dDinc[i] = Dinc[i] - Dinc[i - 1];
  }

  // Determine the calendar-quarter range we span: from the quarter of the
  // effective date to the quarter containing the last block's end (inclusive).
  const firstQ = quarterOf(dEff);
  const lastBlockEnd = inceptionBlockEnd(dEff, nInc);
  // last block end is exclusive; the quarter containing the last covered day.
  const lastQ = quarterOf(new Date(lastBlockEnd.getTime() - 86400000));
  const quarters = calQuarterRange(firstQ, lastQ);
  const nCal = quarters.length;

  // Precompute calendar quarter bounds.
  const cStarts = quarters.map((c) => calQuarterStart(c));
  const cEnds = quarters.map((c) => calQuarterEnd(c));

  // 3. Day-weight flows into calendar quarters.
  const dPcal: Money[] = new Array(nCal).fill(0);
  const dDcal: Money[] = new Array(nCal).fill(0);
  for (let i = 1; i <= nInc; i++) {
    if (dPinc[i] === 0 && dDinc[i] === 0) continue;
    const bStart = inceptionBlockStart(dEff, i);
    const bEnd = inceptionBlockEnd(dEff, i);
    for (let c = 0; c < nCal; c++) {
      // Quick skip if no temporal overlap at all.
      if (cEnds[c].getTime() <= bStart.getTime()) continue;
      if (cStarts[c].getTime() >= bEnd.getTime()) continue;
      const ov = overlap(dEff, i, cStarts[c], cEnds[c]);
      if (ov <= 0) continue;
      const w = ov / BLOCK_DAYS;
      dPcal[c] += dPinc[i] * w;
      dDcal[c] += dDinc[i] * w;
    }
  }

  // 4. NAV is a stock — linear-interpolate on time at each calendar quarter end.
  const navCal: Money[] = new Array(nCal).fill(0);
  for (let c = 0; c < nCal; c++) {
    // calendar quarter end is exclusive; "end of quarter" = last instant.
    // Use the inclusive last day for block selection.
    const end = new Date(cEnds[c].getTime() - 86400000);
    // Find block i* with block_start(i*) <= end < block_end(i*).
    let istar = -1;
    for (let i = 1; i <= nInc; i++) {
      const bs = inceptionBlockStart(dEff, i);
      const be = inceptionBlockEnd(dEff, i);
      if (bs.getTime() <= end.getTime() && end.getTime() < be.getTime()) {
        istar = i;
        break;
      }
    }
    if (istar === -1) {
      // Before block 1 → 0; at/after last block end → NAV_inc(last).
      const block1Start = inceptionBlockStart(dEff, 1);
      if (end.getTime() < block1Start.getTime()) {
        navCal[c] = 0;
      } else {
        navCal[c] = NAVinc[nInc];
      }
    } else {
      const bs = inceptionBlockStart(dEff, istar);
      const f = days30360(bs, end) / BLOCK_DAYS;
      navCal[c] = NAVinc[istar - 1] + f * (NAVinc[istar] - NAVinc[istar - 1]);
    }
  }

  // 5. Cumulative stocks.
  const pCal: Money[] = new Array(nCal).fill(0);
  const dCal: Money[] = new Array(nCal).fill(0);
  let accP = 0;
  let accD = 0;
  for (let c = 0; c < nCal; c++) {
    accP += dPcal[c];
    accD += dDcal[c];
    pCal[c] = accP;
    dCal[c] = accD;
  }

  // 6. Reconstruct ratios.
  const picCal: Ratio[] = new Array(nCal);
  const dpiCal: Ratio[] = new Array(nCal);
  const tvpiCal: Ratio[] = new Array(nCal);
  for (let c = 0; c < nCal; c++) {
    picCal[c] = pCal[c] / C;
    if (pCal[c] > 0) {
      dpiCal[c] = dCal[c] / pCal[c];
      tvpiCal[c] = (dCal[c] + navCal[c]) / pCal[c];
    } else {
      dpiCal[c] = 0;
      tvpiCal[c] = 0;
    }
  }

  return {
    quarters,
    pic: picCal,
    dpi: dpiCal,
    tvpi: tvpiCal,
    pCal,
    dCal,
    navCal,
  };
}
