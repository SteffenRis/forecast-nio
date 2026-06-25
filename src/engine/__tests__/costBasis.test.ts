import { computeCostBasis } from '../costBasis';

describe('§10.3 cost basis (C=30M, terminal 2.2x)', () => {
  // 5-row worked table at annual snapshots.
  const rows = [
    { P: 6_000_000, D: 0, expected: 6_000_000, pct: 100.0 },
    { P: 22_500_000, D: 1_125_000, expected: 21_988_636, pct: 97.7 },
    { P: 30_000_000, D: 13_500_000, expected: 23_863_636, pct: 79.5 },
    { P: 30_000_000, D: 39_000_000, expected: 12_272_727, pct: 40.9 },
    { P: 30_000_000, D: 66_000_000, expected: 0, pct: 0.0 },
  ];
  const tvpiTerminal = 2.2;

  for (const r of rows) {
    it(`P=${r.P}, D=${r.D} → ${r.expected}`, () => {
      const cb = computeCostBasis([r.P], [r.D], tvpiTerminal)[0];
      expect(cb).toBeCloseTo(r.expected, 0); // 1 currency unit
      if (r.P > 0) {
        expect((cb / r.P) * 100).toBeCloseTo(r.pct, 1);
      }
    });
  }

  it('clamps at 0 when DPI exceeds terminal (warns)', () => {
    const w: import('../types').Warning[] = [];
    const cb = computeCostBasis([30_000_000], [70_000_000], 2.2, w, 'base')[0];
    expect(cb).toBe(0);
    expect(w.some((x) => x.code === 'cost_basis_clamped')).toBe(true);
  });

  it('cost_basis(0 paid-in) = 0', () => {
    expect(computeCostBasis([0], [0], 2.2)[0]).toBe(0);
  });
});
