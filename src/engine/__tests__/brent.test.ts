import { brent } from '../util/brent';

describe('brent root finder (§14.3)', () => {
  it('finds a simple linear root', () => {
    const r = brent((x) => x - 3, -10, 10);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(3, 10);
  });
  it('finds a quadratic root in range', () => {
    // x^2 - 2 = 0 → sqrt(2). Bracket the positive root.
    const r = brent((x) => x * x - 2, 0, 5);
    expect(r!).toBeCloseTo(Math.SQRT2, 10);
  });
  it('returns null when no sign change', () => {
    expect(brent((x) => x * x + 1, -10, 10)).toBeNull();
  });
  it('handles a transcendental root', () => {
    const r = brent((x) => Math.cos(x) - x, 0, 1);
    expect(r!).toBeCloseTo(0.7390851332, 8);
  });
});
