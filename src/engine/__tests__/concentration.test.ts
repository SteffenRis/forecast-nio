import { applyConcentration } from '../concentration';
import type { Warning } from '../types';

describe('§4 concentration scenario fan', () => {
  // Terminals: Base 2.2, Low 1.4, High 2.8; multiplier 1.5 → adjusted base 3.3.
  const adjustedBase = [3.3];
  const baseTemplate = [2.2];
  const lowTemplate = [1.4];
  const highTemplate = [2.8];

  const table: [number, number, number][] = [
    // [concentration, lowTerminal, highTerminal]
    [0.0, 3.3, 3.3],
    [0.5, 2.7, 3.75],
    [1.0, 2.1, 4.2],
    [2.0, 0.9, 5.1],
  ];

  for (const [conc, lowExp, highExp] of table) {
    it(`concentration ${conc}: Low=${lowExp}, High=${highExp}`, () => {
      const w: Warning[] = [];
      const low = applyConcentration(adjustedBase, baseTemplate, lowTemplate, conc, w);
      const high = applyConcentration(adjustedBase, baseTemplate, highTemplate, conc, w);
      expect(low[0]).toBeCloseTo(lowExp, 4);
      expect(high[0]).toBeCloseTo(highExp, 4);
    });
  }

  it('concentration=0 collapses non-base onto base (I13)', () => {
    const w: Warning[] = [];
    const low = applyConcentration(adjustedBase, baseTemplate, lowTemplate, 0, w);
    expect(low[0]).toBeCloseTo(adjustedBase[0], 9);
  });

  it('fallback formula when base template is 0', () => {
    const w: Warning[] = [];
    // adjusted base 0, base template 0, scenario template 0.1, conc 1 → 0.1
    const out = applyConcentration([0], [0], [0.1], 1, w);
    expect(out[0]).toBeCloseTo(0.1, 6);
  });

  it('clamps negative to 0 with a warning', () => {
    const w: Warning[] = [];
    // base 2.2, scenario 0 → ratio 0; conc 2 → 3.3·(1 + 2·(−1)) = 3.3·(−1) = −3.3 → 0
    const out = applyConcentration([3.3], [2.2], [0], 2, w);
    expect(out[0]).toBe(0);
    expect(w.some((x) => x.code === 'concentration_produced_negative_value')).toBe(true);
  });
});
