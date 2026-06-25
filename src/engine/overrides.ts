// §6 Forecast overrides (anchor rebasing).
// Apply user anchor points (calendar_quarter, value) per curve to the
// calendar-mapped base curve.

import type { CalendarQuarter, Ratio, AnchorPoint, CurveName } from './types';
import { calQuarterOrdinal } from './util/daycount';

export interface RebaseCurveInput {
  /** Calendar quarters aligned with `template`. */
  quarters: CalendarQuarter[];
  /** Template-derived values (post §5) aligned with `quarters`. */
  template: Ratio[];
  /** User anchors (not including implicit start/terminal). */
  anchors: AnchorPoint[];
  /** Index (into quarters) of the inception quarter (implicit start = 0). */
  inceptionIndex: number;
  /** Index (into quarters) of the terminal quarter. */
  terminalIndex: number;
}

interface ResolvedAnchor {
  index: number; // index into quarters (virtual start uses inceptionIndex-1)
  value: Ratio;
  /** Template value at this anchor (0 for the virtual period-0 start anchor). */
  templateValue: Ratio;
}

/**
 * §6 between-anchor rebasing. Returns a new curve array.
 *   if T_e == T_s: new(q) = v_s
 *   else: share = (T_q − T_s)/(T_e − T_s); new(q) = v_s + share·(v_e − v_s)
 * Exactly matches anchors at anchor quarters; preserves template shape between.
 */
export function rebaseCurve(input: RebaseCurveInput): Ratio[] {
  const { quarters, template, anchors, inceptionIndex, terminalIndex } = input;
  const n = quarters.length;
  const ordToIndex = new Map<number, number>();
  for (let i = 0; i < n; i++) ordToIndex.set(calQuarterOrdinal(quarters[i]), i);

  // Resolve anchors to indices.
  const resolved: ResolvedAnchor[] = [];
  // Implicit start anchor at the inception INSTANT (period 0), placed at the
  // virtual index inceptionIndex-1 with template value 0 and anchor value 0. It
  // never overwrites the first dense quarter; it only seeds the share formula.
  resolved.push({ index: inceptionIndex - 1, value: 0, templateValue: 0 });
  for (const a of anchors) {
    const idx = ordToIndex.get(calQuarterOrdinal(a.quarter));
    if (idx === undefined) continue; // outside range — skip
    resolved.push({ index: idx, value: a.value, templateValue: template[idx] });
  }
  // Implicit terminal anchor, value = template at terminal.
  resolved.push({
    index: terminalIndex,
    value: template[terminalIndex],
    templateValue: template[terminalIndex],
  });

  // Sort ascending by index, dedupe (later wins for same index → user anchors
  // override implicit when they coincide).
  resolved.sort((x, y) => x.index - y.index);
  const dedup: ResolvedAnchor[] = [];
  for (const r of resolved) {
    if (dedup.length && dedup[dedup.length - 1].index === r.index) {
      dedup[dedup.length - 1] = r; // later overrides
    } else {
      dedup.push(r);
    }
  }

  const out = template.slice();
  // Set anchor values exactly (skip the virtual start index < 0).
  for (const a of dedup) if (a.index >= 0) out[a.index] = a.value;

  // Between consecutive anchors, rebase.
  for (let k = 0; k < dedup.length - 1; k++) {
    const s = dedup[k];
    const e = dedup[k + 1];
    const Ts = s.templateValue;
    const Te = e.templateValue;
    const from = Math.max(0, s.index + 1);
    for (let i = from; i < e.index; i++) {
      const Tq = template[i];
      if (Te === Ts) {
        out[i] = s.value;
      } else {
        const share = (Tq - Ts) / (Te - Ts);
        out[i] = s.value + share * (e.value - s.value);
      }
    }
  }
  // After terminal: leave as template (out of fund life; dropped downstream).
  return out;
}

/**
 * Apply overrides to all three curves with the special rules:
 *  - terminal TVPI auto-snaps to terminal DPI if both anchored and differ.
 */
export interface ApplyOverridesInput {
  quarters: CalendarQuarter[];
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  overrides: { pic?: AnchorPoint[]; dpi?: AnchorPoint[]; tvpi?: AnchorPoint[] };
  inceptionIndex: number;
  terminalIndex: number;
  /** Quarters that have actuals records — drop conflicting anchors. */
  actualQuarterOrds?: Set<number>;
}

export function applyOverrides(input: ApplyOverridesInput): {
  pic: Ratio[];
  dpi: Ratio[];
  tvpi: Ratio[];
  droppedAnchors: { curve: CurveName; quarter: CalendarQuarter }[];
} {
  const { quarters, inceptionIndex, terminalIndex, actualQuarterOrds } = input;
  const dropped: { curve: CurveName; quarter: CalendarQuarter }[] = [];

  const filterAnchors = (anchors: AnchorPoint[] | undefined, curve: CurveName): AnchorPoint[] => {
    if (!anchors) return [];
    if (!actualQuarterOrds) return anchors;
    return anchors.filter((a) => {
      const ord = calQuarterOrdinal(a.quarter);
      if (actualQuarterOrds.has(ord)) {
        dropped.push({ curve, quarter: a.quarter });
        return false;
      }
      return true;
    });
  };

  const picAnchors = filterAnchors(input.overrides.pic, 'pic');
  const dpiAnchors = filterAnchors(input.overrides.dpi, 'dpi');
  const tvpiAnchors = filterAnchors(input.overrides.tvpi, 'tvpi');

  const pic = rebaseCurve({
    quarters,
    template: input.pic,
    anchors: picAnchors,
    inceptionIndex,
    terminalIndex,
  });
  let dpi = rebaseCurve({
    quarters,
    template: input.dpi,
    anchors: dpiAnchors,
    inceptionIndex,
    terminalIndex,
  });
  let tvpi = rebaseCurve({
    quarters,
    template: input.tvpi,
    anchors: tvpiAnchors,
    inceptionIndex,
    terminalIndex,
  });

  // Terminal TVPI auto-snaps to terminal DPI if both exist and differ.
  // After rebasing, terminal carries the (anchor or template) value.
  // Snap TVPI terminal to DPI terminal.
  tvpi = tvpi.slice();
  tvpi[terminalIndex] = dpi[terminalIndex];

  return { pic, dpi, tvpi, droppedAnchors: dropped };
}
