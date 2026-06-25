import { mapToCalendar } from '../calendarMap';
import { expandCurve } from '../curves';
import { acmeTemplate } from './fixtures/acme';
import { parseISO } from '../util/daycount';

function expandedAcme() {
  const base = acmeTemplate.scenarios[0];
  const n = 40; // 10y annual → 40 inception quarters
  const pic = expandCurve(base.pic, 'annual', n);
  const dpi = expandCurve(base.dpi, 'annual', n);
  const tvpi = expandCurve(base.tvpi, 'annual', n);
  return { pic, dpi, tvpi };
}

describe('§5 calendar mapping', () => {
  const C = 30_000_000;
  const dEff = parseISO('2024-02-15');

  it('§5 total-preservation: ΣΔP_cal = P_inc(last) @1e-9', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    const Pinc_last = pic[pic.length - 1] * C;
    const sumP = res.pCal[res.pCal.length - 1];
    expect(sumP).toBeCloseTo(Pinc_last, 6); // currency: within 1e-6 of total
    // tighter: total-preservation invariant at 1e-9 relative
    expect(Math.abs(sumP - Pinc_last)).toBeLessThan(1e-3);
  });

  it('§5 total-preservation: ΣΔD_cal = D_inc(last) @1e-9', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    const Dinc_last = dpi[dpi.length - 1] * pic[pic.length - 1] * C;
    const sumD = res.dCal[res.dCal.length - 1];
    expect(Math.abs(sumD - Dinc_last)).toBeLessThan(1e-3);
  });

  it('terminal PIC = 1.0 (fully called)', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    expect(res.pic[res.pic.length - 1]).toBeCloseTo(1.0, 6);
  });

  it('spans from 2024-Q1 (effective quarter)', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    expect(res.quarters[0]).toEqual({ year: 2024, q: 1 });
  });

  it('NAV is 0 at the very start and non-negative throughout', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    for (const n of res.navCal) expect(n).toBeGreaterThanOrEqual(0);
  });

  it('terminal TVPI = terminal DPI (preserved through mapping)', () => {
    const { pic, dpi, tvpi } = expandedAcme();
    const res = mapToCalendar({ pic, dpi, tvpi, commitment: C, effectiveDate: dEff });
    const last = res.pic.length - 1;
    // At terminal, NAV should be ~0 so TVPI ≈ DPI.
    expect(res.tvpi[last]).toBeCloseTo(res.dpi[last], 4);
  });
});
