import { xirrDated, xirrFromFlows } from '../irr';
import { parseISO } from '../util/daycount';

describe('§14.9 XIRR Excel anchors', () => {
  it('{−1000@2021-01-01, +1200@2022-01-01} = 20.0000%', () => {
    const r = xirrDated([
      { date: parseISO('2021-01-01'), amount: -1000 },
      { date: parseISO('2022-01-01'), amount: 1200 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.2, 8);
  });

  it('leap {−1000@2020-01-01, +1200@2021-01-01} = 19.9402%', () => {
    const r = xirrDated([
      { date: parseISO('2020-01-01'), amount: -1000 },
      { date: parseISO('2021-01-01'), amount: 1200 },
    ]);
    // 1.2^(365/366) − 1
    const expected = Math.pow(1.2, 365 / 366) - 1;
    expect(r!).toBeCloseTo(expected, 10);
    expect(r!).toBeCloseTo(0.199402, 6);
  });
});

describe('§14.3 edge cases → null', () => {
  it('all flows same sign → null', () => {
    expect(
      xirrDated([
        { date: parseISO('2021-01-01'), amount: -100 },
        { date: parseISO('2022-01-01'), amount: -200 },
      ]),
    ).toBeNull();
  });
  it('fewer than 2 non-zero flows → null', () => {
    expect(xirrDated([{ date: parseISO('2021-01-01'), amount: -100 }])).toBeNull();
  });
  it('zero flows → null', () => {
    expect(xirrFromFlows([])).toBeNull();
  });
});
