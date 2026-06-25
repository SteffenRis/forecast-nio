import { expandCurve, sparseValueAt } from '../curves';
import type { SparseCurve } from '../types';

describe('§2.2 annual → quarterly expansion', () => {
  it('PIC Y1=0.20, Y2=0.50 → q1..q8', () => {
    const curve: SparseCurve = {
      points: [
        { period: 1, value: 0.2 },
        { period: 2, value: 0.5 },
      ],
    };
    const q = expandCurve(curve, 'annual', 8);
    const expected = [0.05, 0.1, 0.15, 0.2, 0.275, 0.35, 0.425, 0.5];
    for (let i = 0; i < 8; i++) {
      expect(q[i]).toBeCloseTo(expected[i], 6);
    }
  });
});

describe('§2.1 sparse interpolation', () => {
  const curve: SparseCurve = {
    points: [
      { period: 2, value: 0.1 },
      { period: 4, value: 0.5 },
    ],
  };
  it('value 0 before first point at the implicit 0 anchor', () => {
    expect(sparseValueAt(curve, 0)).toBe(0);
  });
  it('linearly ramps from (0,0) before the first stored point', () => {
    expect(sparseValueAt(curve, 1)).toBeCloseTo(0.05, 6);
  });
  it('linear between stored points', () => {
    expect(sparseValueAt(curve, 3)).toBeCloseTo(0.3, 6);
  });
  it('flat after last point', () => {
    expect(sparseValueAt(curve, 10)).toBeCloseTo(0.5, 6);
  });
});

describe('§2.2 quarterly granularity passes through', () => {
  it('samples directly', () => {
    const curve: SparseCurve = {
      points: [
        { period: 1, value: 0.05 },
        { period: 8, value: 0.5 },
      ],
    };
    const q = expandCurve(curve, 'quarterly', 8);
    expect(q[0]).toBeCloseTo(0.05, 6);
    expect(q[7]).toBeCloseTo(0.5, 6);
  });
});
