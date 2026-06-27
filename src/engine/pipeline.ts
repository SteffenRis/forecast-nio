// §8 Full pipeline — assemble §2–§7 into dense per-scenario curves on the
// INCEPTION-QUARTER timeline (the timeline the fund cash-flow / fee / hurdle /
// carry / IRR engine operates on). Each inception quarter i is tagged with the
// calendar quarter containing its block END (1:1 correspondence used for fee
// IP/pro-rata boundaries and for IRR flow dating).
//
// The §5 day-weighted calendar mapping (calendarMap.ts) is a separate concern
// used for displaying curves on a true calendar grid and for portfolio
// aggregation across funds with differing effective dates.
//
// Base scenario:    expand → §3.1 → §3.2 → §6 anchors → §7 actuals.
// Non-base scenario: expand → §4 concentration vs base → §7 actuals.

import type {
  FundInput,
  PipelineScenarioOutput,
  CalendarQuarter,
  Ratio,
  Warning,
} from './types';
import { expandCurve } from './curves';
import { applyDpiMultiplier, applyDpiTiming } from './sliders';
import { applyConcentration } from './concentration';
import { applyOverrides } from './overrides';
import { applyActuals } from './actuals';
import {
  quarterOf,
  inceptionBlockEnd,
  calQuarterOrdinal,
} from './util/daycount';

/** Number of inception quarters to model (fund life from effective to liq). */
export function nInceptionQuarters(fund: FundInput): number {
  const effLiq = fund.expectedLiquidationDate ?? fund.standardLiquidationDate;
  let i = 0;
  while (true) {
    i++;
    const end = inceptionBlockEnd(fund.effectiveDate, i);
    if (end.getTime() >= effLiq.getTime()) break;
    if (i > 400) break; // safety
  }
  return i;
}

/**
 * Calendar quarter that inception quarter `i` (1-indexed) maps to, by the
 * calendar quarter containing the inception block END (its end-of-quarter date).
 * Block i ends at effective + 3i months; the last covered day is end − 1 day.
 */
export function inceptionToCalendarQuarter(
  effectiveDate: Date,
  i: number,
): CalendarQuarter {
  const end = inceptionBlockEnd(effectiveDate, i);
  const lastDay = new Date(end.getTime() - 86400000);
  return quarterOf(lastDay);
}

export interface FundPipelineOutput {
  /** Per-scenario inception-quarter dense curves. */
  scenarios: PipelineScenarioOutput[];
  /** Calendar quarter per inception index (aligned with scenario arrays). */
  calendarQuarters: CalendarQuarter[];
  warnings: Warning[];
  /** Number of inception quarters. */
  nInc: number;
}

export function runPipeline(fund: FundInput): FundPipelineOutput {
  const warnings: Warning[] = [];
  const nInc = nInceptionQuarters(fund);

  const baseTemplate = fund.template.scenarios.find((s) => s.isBase);
  if (!baseTemplate) throw new Error('No base scenario in template');

  // Calendar quarter for each inception quarter (1:1 by block end).
  const calendarQuarters: CalendarQuarter[] = [];
  for (let i = 1; i <= nInc; i++) {
    calendarQuarters.push(inceptionToCalendarQuarter(fund.effectiveDate, i));
  }
  const inceptionIndex = 0;
  const terminalIndex = nInc - 1;

  // Set of calendar-quarter ordinals with actuals (for §6 conflict drop).
  const actualOrds = new Set<number>(
    (fund.actuals ?? []).map((a) => calQuarterOrdinal(a.quarter)),
  );

  // Expand base inception-quarter curves.
  const basePicRaw = expandCurve(baseTemplate.pic, fund.template.granularity, nInc);
  const baseDpiRaw = expandCurve(baseTemplate.dpi, fund.template.granularity, nInc);
  const baseTvpiRaw = expandCurve(baseTemplate.tvpi, fund.template.granularity, nInc);

  // §3.1 multiplier (DPI, TVPI), §3.2 timing (DPI).
  const { dpi: baseDpiMul, tvpi: baseTvpiMul } = applyDpiMultiplier(
    baseDpiRaw,
    baseTvpiRaw,
    fund.sliders.dpiMultiplier,
  );
  const baseDpiAdj = applyDpiTiming(baseDpiMul, fund.sliders.dpiTiming);

  // §6 anchors on base (keyed by calendar quarter → inception index via
  // calendarQuarters). §7 actuals on base.
  const baseAfterOverrides = applyOverrides({
    quarters: calendarQuarters,
    pic: basePicRaw,
    dpi: baseDpiAdj,
    tvpi: baseTvpiMul,
    overrides: fund.overrides ?? {},
    inceptionIndex,
    terminalIndex,
    actualQuarterOrds: actualOrds,
  });

  const baseAfterActuals = applyActuals({
    quarters: calendarQuarters,
    pic: baseAfterOverrides.pic,
    dpi: baseAfterOverrides.dpi,
    tvpi: baseAfterOverrides.tvpi,
    commitment: fund.commitment,
    actuals: fund.actuals ?? [],
    status: fund.status,
    policy: fund.policy,
    inceptionIndex,
    terminalIndex,
    warnings,
  });

  const scenarios: PipelineScenarioOutput[] = [];
  scenarios.push({
    scenarioId: baseTemplate.id,
    quarters: calendarQuarters,
    pic: baseAfterActuals.pic,
    dpi: baseAfterActuals.dpi,
    tvpi: baseAfterActuals.tvpi,
    terminalTvpi: baseAfterActuals.dpi[terminalIndex],
  });

  // Adjusted-base curves (post slider) for concentration anchoring.
  const adjBasePic = basePicRaw;
  const adjBaseDpi = baseDpiAdj;
  const adjBaseTvpi = baseTvpiMul;

  for (const sc of fund.template.scenarios) {
    if (sc.isBase) continue;
    const picRaw = expandCurve(sc.pic, fund.template.granularity, nInc);
    const dpiRaw = expandCurve(sc.dpi, fund.template.granularity, nInc);
    const tvpiRaw = expandCurve(sc.tvpi, fund.template.granularity, nInc);

    const conc = fund.sliders.concentration;
    // §4 concentration vs base template (raw, pre-slider) anchored on adjusted base.
    const picC = applyConcentration(adjBasePic, basePicRaw, picRaw, conc, warnings, {
      scenarioId: sc.id,
      curve: 'pic',
    });
    const dpiC = applyConcentration(adjBaseDpi, baseDpiRaw, dpiRaw, conc, warnings, {
      scenarioId: sc.id,
      curve: 'dpi',
    });
    const tvpiC = applyConcentration(adjBaseTvpi, baseTvpiRaw, tvpiRaw, conc, warnings, {
      scenarioId: sc.id,
      curve: 'tvpi',
    });

    const afterActuals = applyActuals({
      quarters: calendarQuarters,
      pic: picC,
      dpi: dpiC,
      tvpi: tvpiC,
      commitment: fund.commitment,
      actuals: fund.actuals ?? [],
      status: fund.status,
      policy: fund.policy,
      inceptionIndex,
      terminalIndex,
      warnings,
    });

    const tvpiFinal = afterActuals.tvpi.slice();
    tvpiFinal[terminalIndex] = afterActuals.dpi[terminalIndex];

    scenarios.push({
      scenarioId: sc.id,
      quarters: calendarQuarters,
      pic: afterActuals.pic,
      dpi: afterActuals.dpi,
      tvpi: tvpiFinal,
      terminalTvpi: afterActuals.dpi[terminalIndex],
    });
  }

  return { scenarios, calendarQuarters, warnings, nInc };
}

export type { CalendarQuarter, Ratio };
