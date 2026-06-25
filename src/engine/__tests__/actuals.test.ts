import { applyActuals } from '../actuals';
import type { CalendarQuarter, Warning } from '../types';
import { calQuarterRange } from '../util/daycount';

const quarters: CalendarQuarter[] = calQuarterRange({ year: 2024, q: 1 }, { year: 2025, q: 4 });
const C = 30_000_000;

describe('§7 actuals rebasing', () => {
  it('overwrites actual quarters with implied values', () => {
    const w: Warning[] = [];
    const pic = quarters.map((_, i) => (i + 1) / quarters.length);
    const dpi = quarters.map(() => 0);
    const tvpi = quarters.map(() => 1.0);
    const out = applyActuals({
      quarters,
      pic,
      dpi,
      tvpi,
      commitment: C,
      actuals: [
        {
          quarter: quarters[1],
          cumulativePaidIn: 9_000_000,
          cumulativeDistributions: 1_000_000,
          nav: 9_000_000,
        },
      ],
      status: 'ACTIVE',
      inceptionIndex: 0,
      terminalIndex: quarters.length - 1,
      warnings: w,
    });
    expect(out.pic[1]).toBeCloseTo(9_000_000 / C, 9);
    expect(out.dpi[1]).toBeCloseTo(1_000_000 / 9_000_000, 9);
    expect(out.tvpi[1]).toBeCloseTo((1_000_000 + 9_000_000) / 9_000_000, 9);
    expect(out.lastActualIndex).toBe(1);
  });

  it('WOUND_DOWN zeros forward (holds cumulative flat)', () => {
    const w: Warning[] = [];
    const pic = quarters.map((_, i) => (i + 1) / quarters.length);
    const dpi = quarters.map(() => 0.5);
    const tvpi = quarters.map(() => 1.5);
    const out = applyActuals({
      quarters,
      pic,
      dpi,
      tvpi,
      commitment: C,
      actuals: [
        {
          quarter: quarters[2],
          cumulativePaidIn: 15_000_000,
          cumulativeDistributions: 3_000_000,
          nav: 5_000_000,
        },
      ],
      status: 'WOUND_DOWN',
      inceptionIndex: 0,
      terminalIndex: quarters.length - 1,
      warnings: w,
    });
    // forward quarters hold flat at last actual implied cumulative
    for (let i = 3; i < quarters.length; i++) {
      expect(out.pic[i]).toBeCloseTo(out.pic[2], 9);
      expect(out.dpi[i]).toBeCloseTo(out.dpi[2], 9);
    }
  });

  it('PIC above terminal flat-forwards with warning', () => {
    const w: Warning[] = [];
    // template terminal PIC = 1.0; actual PIC = 1.1 (overcalled)
    const pic = quarters.map((_, i) => Math.min(1.0, (i + 1) / 4));
    const dpi = quarters.map(() => 0);
    const tvpi = quarters.map(() => 1.0);
    const out = applyActuals({
      quarters,
      pic,
      dpi,
      tvpi,
      commitment: C,
      actuals: [
        {
          quarter: quarters[2],
          cumulativePaidIn: 33_000_000, // 1.1x
          cumulativeDistributions: 0,
          nav: 33_000_000,
        },
      ],
      status: 'ACTIVE',
      inceptionIndex: 0,
      terminalIndex: quarters.length - 1,
      warnings: w,
    });
    expect(out.pic[2]).toBeCloseTo(1.1, 9);
    for (let i = 3; i < quarters.length; i++) {
      expect(out.pic[i]).toBeCloseTo(1.1, 9); // flat-forward, no refund
    }
    expect(w.some((x) => x.code === 'pic_above_terminal_flat_forward')).toBe(true);
  });
});
