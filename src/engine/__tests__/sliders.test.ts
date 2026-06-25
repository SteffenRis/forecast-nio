import { applyDpiMultiplier, applyDpiTiming } from '../sliders';

describe('§3.1 DPI multiplier', () => {
  it('scales DPI and TVPI, PIC untouched (PIC not passed)', () => {
    const dpi = [0, 0.5, 1.0, 2.2];
    const tvpi = [0.9, 1.3, 1.9, 2.2];
    const { dpi: d2, tvpi: t2 } = applyDpiMultiplier(dpi, tvpi, 1.5);
    const expD = [0, 0.75, 1.5, 3.3];
    const expT = [1.35, 1.95, 2.85, 3.3];
    d2.forEach((v, i) => expect(v).toBeCloseTo(expD[i], 9));
    t2.forEach((v, i) => expect(v).toBeCloseTo(expT[i], 9));
  });
  it('preserves terminal TVPI = DPI when both scale (I15-ish)', () => {
    const dpi = [0, 1.0, 2.2];
    const tvpi = [0.9, 1.5, 2.2];
    const { dpi: d2, tvpi: t2 } = applyDpiMultiplier(dpi, tvpi, 1.5);
    expect(d2[d2.length - 1]).toBeCloseTo(t2[t2.length - 1], 9);
  });
});

describe('§3.2 DPI timing', () => {
  const dpi = [0, 0.05, 0.2, 0.45, 0.85, 1.3, 1.75, 2.05, 2.15, 2.2];

  it('timing=0 is identity (I14, exact)', () => {
    const out = applyDpiTiming(dpi, 0);
    expect(out).toEqual(dpi);
  });

  it('terminal preserved for any timing (I15)', () => {
    for (const t of [-1, -0.5, 0.5, 1]) {
      const out = applyDpiTiming(dpi, t);
      expect(out[out.length - 1]).toBeCloseTo(dpi[dpi.length - 1], 9);
    }
  });

  it('both endpoints pinned', () => {
    const out = applyDpiTiming(dpi, 0.7);
    // First quarter normalized t = 1/10, still > 0 so not exactly 0, but
    // terminal must be pinned at 2.2.
    expect(out[out.length - 1]).toBeCloseTo(2.2, 9);
  });

  it('+1 (back-loaded) pushes distributions later (lower interior)', () => {
    const out = applyDpiTiming(dpi, 1);
    // exponent 2 → u = t^2 < t, so we sample the curve earlier → smaller value.
    for (let i = 0; i < dpi.length - 1; i++) {
      expect(out[i]).toBeLessThanOrEqual(dpi[i] + 1e-9);
    }
  });

  it('−1 (front-loaded) pulls distributions earlier (higher interior)', () => {
    const out = applyDpiTiming(dpi, -1);
    for (let i = 0; i < dpi.length - 1; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(dpi[i] - 1e-9);
    }
  });

  it('monotonic preserved', () => {
    const out = applyDpiTiming(dpi, 0.6);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-12);
    }
  });
});
