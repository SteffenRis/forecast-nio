import { rebaseCurve, applyOverrides } from '../overrides';
import type { CalendarQuarter } from '../types';
import { calQuarterRange } from '../util/daycount';

const quarters: CalendarQuarter[] = calQuarterRange({ year: 2024, q: 1 }, { year: 2025, q: 4 });
// 8 quarters, indices 0..7

describe('§6 rebaseCurve between-anchor', () => {
  it('matches anchors exactly and preserves shape between', () => {
    // template linear 0..0.8 over 8 quarters
    const template = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    // anchor at index 4 (value 0.5 instead of template 0.4), terminal idx 7
    const out = rebaseCurve({
      quarters,
      template,
      anchors: [{ quarter: quarters[4], value: 0.5 }],
      inceptionIndex: 0,
      terminalIndex: 7,
    });
    expect(out[0]).toBeCloseTo(0, 9); // start anchor
    expect(out[4]).toBeCloseTo(0.5, 9); // user anchor exact
    expect(out[7]).toBeCloseTo(0.7, 9); // terminal = template
    // between 0 and 4: template T_s=0,T_e=0.4; share at idx2 T=0.2 → 0.5
    // new = 0 + 0.5·(0.5−0) = 0.25
    expect(out[2]).toBeCloseTo(0.25, 9);
  });

  it('flat template segment uses start value', () => {
    const template = [0, 0.5, 0.5, 0.5];
    const q = calQuarterRange({ year: 2024, q: 1 }, { year: 2024, q: 4 });
    const out = rebaseCurve({
      quarters: q,
      template,
      anchors: [
        { quarter: q[1], value: 0.3 },
        { quarter: q[3], value: 0.9 },
      ],
      inceptionIndex: 0,
      terminalIndex: 3,
    });
    // between idx1(0.3) and idx3(0.9): template flat 0.5→0.5 → new(idx2)=v_s=0.3
    expect(out[2]).toBeCloseTo(0.3, 9);
  });
});

describe('§6 terminal TVPI auto-snaps to terminal DPI', () => {
  it('snaps even when template/anchor differ', () => {
    const pic = [0, 0.25, 0.5, 1.0];
    const dpi = [0, 0.5, 1.5, 2.2];
    const tvpi = [0.9, 1.5, 2.0, 2.5]; // terminal 2.5 ≠ dpi terminal 2.2
    const q = calQuarterRange({ year: 2024, q: 1 }, { year: 2024, q: 4 });
    const out = applyOverrides({
      quarters: q,
      pic,
      dpi,
      tvpi,
      overrides: {},
      inceptionIndex: 0,
      terminalIndex: 3,
    });
    expect(out.tvpi[3]).toBeCloseTo(out.dpi[3], 9);
    expect(out.tvpi[3]).toBeCloseTo(2.2, 9);
  });
});
