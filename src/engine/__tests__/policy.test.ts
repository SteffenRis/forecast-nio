import { applyActuals } from '../actuals';
import { runFund } from '../fund';
import { reportingToForecastQuarter } from '../index';
import type { CalendarQuarter, ForecastPolicyMode, Warning } from '../types';
import { calQuarterRange } from '../util/daycount';
import { makeAcmeFund } from './fixtures/acme';

// §7 forecast-update policy. The realized-quarter overwrite and the WOUND_DOWN /
// ABANDONED status freeze are policy-independent; the three modes differ only in how
// the FORWARD (q > q_last_actual) curve is built.

const quarters: CalendarQuarter[] = calQuarterRange({ year: 2024, q: 1 }, { year: 2025, q: 4 });
const C = 30_000_000;

// A non-uniform plan with varying increments; the actual at index 2 lands BELOW plan
// (0.4 vs the planned 0.6), so the modes visibly diverge forward.
const plan = [0.1, 0.3, 0.6, 0.8, 0.9, 0.95, 1.0, 1.0];

function runPic(policy?: ForecastPolicyMode): number[] {
  const w: Warning[] = [];
  return applyActuals({
    quarters,
    pic: plan.slice(),
    dpi: plan.slice(),
    tvpi: plan.map((v) => v + 0.5),
    commitment: C,
    actuals: [
      { quarter: quarters[2], cumulativePaidIn: 0.4 * C, cumulativeDistributions: 0, nav: 0.4 * C },
    ],
    status: 'ACTIVE',
    policy,
    inceptionIndex: 0,
    terminalIndex: quarters.length - 1,
    warnings: w,
  }).pic;
}

const terminal = quarters.length - 1;
const inc = (a: number[], i: number) => a[i] - a[i - 1];

describe('§7 forecast-update policy', () => {
  it("defaults to 'rebase' (snap to plan) when omitted", () => {
    const omitted = runPic(undefined);
    expect(omitted).toEqual(runPic('rebase'));
    // realized quarter overwritten; forward snaps onto the plan's absolute curve.
    expect(omitted[2]).toBeCloseTo(0.4, 9);
    for (let i = 3; i < quarters.length; i++) expect(omitted[i]).toBeCloseTo(plan[i], 9);
  });

  it("'scale' catches up gradually and reaches the original terminal", () => {
    const out = runPic('scale');
    expect(out[2]).toBeCloseTo(0.4, 9); // realized actual
    // s = (1.0 − 0.4)/(1.0 − 0.6) = 1.5; forward increments = 1.5 × plan increments.
    expect(out[3]).toBeCloseTo(0.7, 9);
    expect(out[4]).toBeCloseTo(0.85, 9);
    expect(out[terminal]).toBeCloseTo(1.0, 9); // still reaches plan terminal
    // Relative pacing preserved: the increment ratio matches the plan's.
    expect(inc(out, 4) / inc(out, 5)).toBeCloseTo((plan[4] - plan[3]) / (plan[5] - plan[4]), 6);
    // Behind plan → every forward increment is scaled UP (× 1.5 > 1).
    expect(inc(out, 4)).toBeCloseTo(1.5 * (plan[4] - plan[3]), 9);
  });

  it("'keep_plan' keeps planned increments and lets the terminal float", () => {
    const out = runPic('keep_plan');
    expect(out[2]).toBeCloseTo(0.4, 9);
    for (let i = 3; i < quarters.length; i++) {
      expect(inc(out, i)).toBeCloseTo(plan[i] - plan[i - 1], 9);
    }
    // terminal = actual + (planTerminal − planAtActual) = 0.4 + (1.0 − 0.6) = 0.8.
    expect(out[terminal]).toBeCloseTo(0.8, 9);
  });

  it('the three modes diverge forward but agree on the realized quarter', () => {
    const [r, s, k] = [runPic('rebase'), runPic('scale'), runPic('keep_plan')];
    expect(r[2]).toBeCloseTo(s[2], 9);
    expect(s[2]).toBeCloseTo(k[2], 9);
    expect(r[3]).not.toBeCloseTo(s[3], 6);
    expect(s[3]).not.toBeCloseTo(k[3], 6);
  });

  it("'keep_plan' snaps terminal TVPI to terminal DPI", () => {
    const w: Warning[] = [];
    const out = applyActuals({
      quarters,
      pic: plan.slice(),
      dpi: plan.slice(),
      tvpi: plan.map((v) => v + 0.5),
      commitment: C,
      actuals: [
        { quarter: quarters[2], cumulativePaidIn: 0.4 * C, cumulativeDistributions: 0, nav: 0.4 * C },
      ],
      status: 'ACTIVE',
      policy: 'keep_plan',
      inceptionIndex: 0,
      terminalIndex: terminal,
      warnings: w,
    });
    expect(out.tvpi[terminal]).toBeCloseTo(out.dpi[terminal], 9);
  });

  it('status WOUND_DOWN overrides any policy (flat-forward regardless of mode)', () => {
    const make = (policy: ForecastPolicyMode) =>
      applyActuals({
        quarters,
        pic: plan.slice(),
        dpi: plan.slice(),
        tvpi: plan.slice(),
        commitment: C,
        actuals: [
          {
            quarter: quarters[2],
            cumulativePaidIn: 0.4 * C,
            cumulativeDistributions: 0.1 * C,
            nav: 0.3 * C,
          },
        ],
        status: 'WOUND_DOWN',
        policy,
        inceptionIndex: 0,
        terminalIndex: terminal,
        warnings: [],
      });
    for (const policy of ['rebase', 'scale', 'keep_plan'] as const) {
      const out = make(policy);
      for (let i = 3; i < quarters.length; i++) {
        expect(out.pic[i]).toBeCloseTo(out.pic[2], 9);
        expect(out.dpi[i]).toBeCloseTo(out.dpi[2], 9);
      }
    }
  });
});

describe('reportingToForecastQuarter (actuals quarter translation)', () => {
  it('maps the effective-date quarter to the first forecast (block-end) quarter', () => {
    // effective 2024-02-15 → effective-date quarter Q1 2024; first forecast row is Q2 2024.
    expect(reportingToForecastQuarter('2024-02-15', { year: 2024, q: 1 })).toEqual({
      year: 2024,
      q: 2,
    });
    expect(reportingToForecastQuarter('2024-02-15', { year: 2024, q: 2 })).toEqual({
      year: 2024,
      q: 3,
    });
  });

  it('is identity when the effective date sits at the start of a quarter', () => {
    // effective 2024-01-01 → block 1 ends 2024-04-01 (last covered day Mar 31) → Q1 2024.
    expect(reportingToForecastQuarter('2024-01-01', { year: 2024, q: 1 })).toEqual({
      year: 2024,
      q: 1,
    });
    expect(reportingToForecastQuarter('2024-01-01', { year: 2024, q: 2 })).toEqual({
      year: 2024,
      q: 2,
    });
  });

  it('returns null for a reporting quarter before the fund starts', () => {
    expect(reportingToForecastQuarter('2024-02-15', { year: 2023, q: 4 })).toBeNull();
  });
});

describe('policy threads through runFund', () => {
  const baseRows = (policy?: ForecastPolicyMode) => {
    // Anchor the actual to a real mid-life inception quarter from the no-actuals run.
    const baseline = runFund(makeAcmeFund()).scenarios.find((s) => s.scenarioId === 'base')!;
    const q = baseline.rows[Math.min(8, baseline.rows.length - 1)].quarter;
    const actual = {
      quarter: q,
      cumulativePaidIn: 6_000_000, // ~0.2 PIC — behind the planned pace by then
      cumulativeDistributions: 0,
      nav: 6_000_000,
    };
    const sc = runFund(makeAcmeFund({ actuals: [actual], policy })).scenarios.find(
      (s) => s.scenarioId === 'base',
    )!;
    return JSON.stringify(sc.rows.map((r) => [r.pNet, r.dNet]));
  };

  it('produces a different forward forecast for each mode', () => {
    expect(baseRows('rebase')).not.toBe(baseRows('scale'));
    expect(baseRows('scale')).not.toBe(baseRows('keep_plan'));
    expect(baseRows(undefined)).toBe(baseRows('rebase')); // omitted → rebase
  });
});
