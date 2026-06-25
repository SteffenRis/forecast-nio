import {
  addMonths,
  days30360,
  actDays,
  quarterOf,
  calQuarterStart,
  calQuarterEnd,
  lastDayOfCalQuarter,
  inceptionBlockStart,
  inceptionBlockEnd,
  parseISO,
  formatISO,
  calQuarterRange,
  calQuarterOrdinal,
  calQuarterFromOrdinal,
} from '../util/daycount';

describe('addMonths (end-of-month clamp §1.4)', () => {
  const cases: [string, number, string][] = [
    ['2024-01-31', 1, '2024-02-29'],
    ['2023-01-31', 1, '2023-02-28'],
    ['2024-01-31', 3, '2024-04-30'],
    ['2024-02-29', 12, '2025-02-28'],
  ];
  for (const [start, k, expected] of cases) {
    it(`${start} + ${k}mo = ${expected}`, () => {
      expect(formatISO(addMonths(parseISO(start), k))).toBe(expected);
    });
  }
});

describe('days30360 (§1.4)', () => {
  it('a full year is 360', () => {
    expect(days30360(parseISO('2024-01-01'), parseISO('2025-01-01'))).toBe(360);
  });
  it('a quarter is 90', () => {
    expect(days30360(parseISO('2024-01-01'), parseISO('2024-04-01'))).toBe(90);
  });
  it('a month is 30', () => {
    expect(days30360(parseISO('2024-01-01'), parseISO('2024-02-01'))).toBe(30);
  });
  it('clamps day-of-month to 30', () => {
    expect(days30360(parseISO('2024-01-31'), parseISO('2024-02-29'))).toBe(29);
  });
  it('is directional (negative)', () => {
    expect(days30360(parseISO('2025-01-01'), parseISO('2024-01-01'))).toBe(-360);
  });
});

describe('actDays (ACT)', () => {
  it('365 for a non-leap year', () => {
    expect(actDays(parseISO('2021-01-01'), parseISO('2022-01-01'))).toBe(365);
  });
  it('366 across a leap year', () => {
    expect(actDays(parseISO('2020-01-01'), parseISO('2021-01-01'))).toBe(366);
  });
});

describe('quarterOf', () => {
  it('maps months to quarters', () => {
    expect(quarterOf(parseISO('2024-02-15'))).toEqual({ year: 2024, q: 1 });
    expect(quarterOf(parseISO('2024-04-01'))).toEqual({ year: 2024, q: 2 });
    expect(quarterOf(parseISO('2024-12-31'))).toEqual({ year: 2024, q: 4 });
  });
});

describe('calendar quarter bounds', () => {
  it('Q1 2024 start/end', () => {
    expect(formatISO(calQuarterStart({ year: 2024, q: 1 }))).toBe('2024-01-01');
    expect(formatISO(calQuarterEnd({ year: 2024, q: 1 }))).toBe('2024-04-01');
    expect(formatISO(lastDayOfCalQuarter({ year: 2024, q: 1 }))).toBe('2024-03-31');
  });
  it('last days of each quarter', () => {
    expect(formatISO(lastDayOfCalQuarter({ year: 2024, q: 2 }))).toBe('2024-06-30');
    expect(formatISO(lastDayOfCalQuarter({ year: 2024, q: 3 }))).toBe('2024-09-30');
    expect(formatISO(lastDayOfCalQuarter({ year: 2024, q: 4 }))).toBe('2024-12-31');
  });
});

describe('inception blocks (§1.2 / §5)', () => {
  it('effective 2024-02-15 → inception-quarter 40 ends 2034-02-15', () => {
    const dEff = parseISO('2024-02-15');
    // Block 40 spans [D_eff + 3·39 mo, D_eff + 3·40 mo) = [+117mo, +120mo).
    expect(formatISO(inceptionBlockEnd(dEff, 40))).toBe('2034-02-15');
    expect(formatISO(inceptionBlockStart(dEff, 40))).toBe('2033-11-15');
  });
  it('block 1 starts at effective date', () => {
    const dEff = parseISO('2024-02-15');
    expect(formatISO(inceptionBlockStart(dEff, 1))).toBe('2024-02-15');
    expect(formatISO(inceptionBlockEnd(dEff, 1))).toBe('2024-05-15');
  });
});

describe('calendar quarter ordinals & ranges', () => {
  it('ordinal round-trips', () => {
    const c = { year: 2024, q: 3 };
    expect(calQuarterFromOrdinal(calQuarterOrdinal(c))).toEqual(c);
  });
  it('range is inclusive', () => {
    const r = calQuarterRange({ year: 2024, q: 1 }, { year: 2024, q: 4 });
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual({ year: 2024, q: 1 });
    expect(r[3]).toEqual({ year: 2024, q: 4 });
  });
});
