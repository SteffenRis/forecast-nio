// §7 Actuals rebasing.
// For quarters with realized data, use actuals; rebase forward from the latest.
// WOUND_DOWN / ABANDONED → zero forward.

import type {
  CalendarQuarter,
  Ratio,
  Money,
  ActualRecord,
  FundStatus,
  Warning,
} from './types';
import { calQuarterOrdinal } from './util/daycount';
import { rebaseCurve } from './overrides';
import { pushWarning } from './warnings';

export interface ApplyActualsInput {
  quarters: CalendarQuarter[];
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  commitment: Money;
  actuals: ActualRecord[];
  status: FundStatus;
  inceptionIndex: number;
  terminalIndex: number;
  warnings: Warning[];
}

export interface ApplyActualsResult {
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  /** Index of the last actuals quarter (or -1 if none). */
  lastActualIndex: number;
}

export function applyActuals(input: ApplyActualsInput): ApplyActualsResult {
  const {
    quarters,
    commitment: C,
    actuals,
    status,
    inceptionIndex,
    terminalIndex,
    warnings,
  } = input;
  const n = quarters.length;
  const pic = input.pic.slice();
  const dpi = input.dpi.slice();
  const tvpi = input.tvpi.slice();

  if (!actuals || actuals.length === 0) {
    return { pic, dpi, tvpi, lastActualIndex: -1 };
  }

  const ordToIndex = new Map<number, number>();
  for (let i = 0; i < n; i++) ordToIndex.set(calQuarterOrdinal(quarters[i]), i);

  // Resolve actuals → indexed implied values.
  interface Indexed {
    index: number;
    pic: Ratio;
    dpi: Ratio;
    tvpi: Ratio;
  }
  const indexed: Indexed[] = [];
  for (const a of actuals) {
    const idx = ordToIndex.get(calQuarterOrdinal(a.quarter));
    if (idx === undefined) continue;
    const picA = a.cumulativePaidIn / C;
    const dpiA = a.cumulativePaidIn > 0 ? a.cumulativeDistributions / a.cumulativePaidIn : 0;
    const tvpiA =
      a.cumulativePaidIn > 0
        ? (a.cumulativeDistributions + a.nav) / a.cumulativePaidIn
        : 0;
    indexed.push({ index: idx, pic: picA, dpi: dpiA, tvpi: tvpiA });
  }
  if (indexed.length === 0) return { pic, dpi, tvpi, lastActualIndex: -1 };

  indexed.sort((x, y) => x.index - y.index);

  // Overwrite q <= q_last_actual with implied values (per actuals row).
  for (const ix of indexed) {
    pic[ix.index] = ix.pic;
    dpi[ix.index] = ix.dpi;
    tvpi[ix.index] = ix.tvpi;
  }

  const last = indexed[indexed.length - 1];
  const lastIdx = last.index;

  // Status override: WOUND_DOWN / ABANDONED → zero forward.
  if (status === 'WOUND_DOWN' || status === 'ABANDONED') {
    for (let i = lastIdx + 1; i < n; i++) {
      pic[i] = pic[lastIdx];
      dpi[i] = dpi[lastIdx];
      tvpi[i] = tvpi[lastIdx];
    }
    // The actual zeroing of *flows* forward is enforced in cashflows by holding
    // cumulative stocks flat. But for status, distributions/nav should also stop
    // changing: hold ratios flat (p=d=0). NAV held at last actual? Spec: forward
    // quarters output as zeros. We hold P/D flat (no new flow) and let NAV decay
    // is NOT applied — we zero NAV forward too by holding tvpi=dpi*?. Simpler:
    // hold the implied cumulative flat → p=d=0; NAV stays at last actual value.
    // The cashflows layer will additionally zero NAV for these statuses.
    return { pic, dpi, tvpi, lastActualIndex: lastIdx };
  }

  // Forward rebasing for q > q_last_actual using §6 formula with start anchor
  // (q_last_actual, actual value) and end = terminal. Per curve.
  const forwardRebase = (curve: Ratio[], startVal: Ratio): Ratio[] => {
    // Build a curve where index<=lastIdx are the (already set) values, and
    // rebase from lastIdx to terminal using template shape (the incoming curve
    // *is* the template for the forward region).
    const tmpl = curve.slice();
    const result = rebaseCurve({
      quarters,
      template: tmpl,
      anchors: [{ quarter: quarters[lastIdx], value: startVal }],
      inceptionIndex: lastIdx, // treat lastIdx as the new start anchor
      terminalIndex,
    });
    // rebaseCurve keeps everything from start anchor onward consistent, but it
    // also re-touches the region before lastIdx (inception..lastIdx). We only
    // want to change q > lastIdx; restore the actuals region.
    for (let i = 0; i <= lastIdx; i++) result[i] = curve[i];
    return result;
  };

  // Ahead-of-terminal handling for PIC: if actual PIC exceeds template terminal,
  // PIC flat-forwards at the elevated value (no phantom refunds).
  const picTerminal = pic[terminalIndex];
  let picOut: Ratio[];
  if (pic[lastIdx] > picTerminal) {
    pushWarning(
      warnings,
      'pic_above_terminal_flat_forward',
      'Actuals push PIC above template terminal; flat-forwarding at elevated value.',
      { index: lastIdx },
    );
    picOut = pic.slice();
    for (let i = lastIdx + 1; i < n; i++) picOut[i] = pic[lastIdx];
  } else {
    picOut = forwardRebase(pic, pic[lastIdx]);
  }

  const dpiOut = forwardRebase(dpi, dpi[lastIdx]);
  const tvpiOut = forwardRebase(tvpi, tvpi[lastIdx]);

  // Ahead-of-terminal warning for DPI/TVPI.
  if (dpi[lastIdx] > dpi[terminalIndex] + 1e-12) {
    pushWarning(
      warnings,
      'actuals_above_terminal',
      'Actual DPI exceeds terminal; forward curve may be non-monotonic.',
      { index: lastIdx },
    );
  }

  // Terminal TVPI snaps to terminal DPI.
  tvpiOut[terminalIndex] = dpiOut[terminalIndex];

  return { pic: picOut, dpi: dpiOut, tvpi: tvpiOut, lastActualIndex: lastIdx };
}
