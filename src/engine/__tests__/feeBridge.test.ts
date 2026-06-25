import { fundLifeProRata, feeBasisStock, computeFeeBridgeInception } from '../feeBridge';
import { calQuarterRange, parseISO, quarterOf } from '../util/daycount';
import { acmeFees } from './fixtures/acme';

describe('§10.1 fund-life pro-rata pr(q)', () => {
  it('pr = 1 for a fully-inside quarter', () => {
    const eff = parseISO('2024-01-01');
    const liq = parseISO('2034-01-01');
    expect(fundLifeProRata({ year: 2025, q: 2 }, eff, liq)).toBeCloseTo(1, 9);
  });

  it('pr < 1 for a partial inception quarter', () => {
    const eff = parseISO('2024-02-15'); // mid-Q1
    const liq = parseISO('2034-02-15');
    const pr = fundLifeProRata({ year: 2024, q: 1 }, eff, liq);
    expect(pr).toBeGreaterThan(0);
    expect(pr).toBeLessThan(1);
  });

  it('pr = 0 outside fund life', () => {
    const eff = parseISO('2024-01-01');
    const liq = parseISO('2034-01-01');
    expect(fundLifeProRata({ year: 2023, q: 1 }, eff, liq)).toBe(0);
    expect(fundLifeProRata({ year: 2035, q: 1 }, eff, liq)).toBe(0);
  });

  it('pr sums to exactly 40 over a 10-year fund (aligned dates)', () => {
    const eff = parseISO('2024-01-01');
    const liq = parseISO('2034-01-01');
    const quarters = calQuarterRange(quarterOf(eff), { year: 2033, q: 4 });
    let sum = 0;
    for (const q of quarters) sum += fundLifeProRata(q, eff, liq);
    expect(sum).toBeCloseTo(40, 9);
  });
});

describe('§10.2 feeBasisStock', () => {
  it('commitment basis applies pr', () => {
    expect(feeBasisStock('commitment', 30_000_000, 0, 0, 0, 0.5)).toBe(15_000_000);
  });
  it('cost_basis applies pr', () => {
    expect(feeBasisStock('cost_basis', 0, 20_000_000, 0, 0, 0.5)).toBe(10_000_000);
  });
  it('nav and paid_in do NOT apply pr', () => {
    expect(feeBasisStock('nav', 0, 0, 5_000_000, 0, 0.5)).toBe(5_000_000);
    expect(feeBasisStock('paid_in', 0, 0, 0, 7_000_000, 0.5)).toBe(7_000_000);
  });
});

describe('inception fee bridge (§16 Acme Y1)', () => {
  const n = 40;
  const C = 30_000_000;
  // Build dummy P / NAV / cost_basis: Y1 P = 6M; we only need establishment +
  // commitment-basis mgmt for the Y1 assertion.
  const P = new Array(n).fill(0).map((_, i) => Math.min(30_000_000, ((i + 1) / 20) * 30_000_000));
  const NAV = new Array(n).fill(0);
  const costBasis = P.slice();
  const fb = computeFeeBridgeInception({
    nInc: n,
    P,
    NAV,
    costBasis,
    commitment: C,
    effectiveDate: parseISO('2024-02-15'),
    investmentPeriodEnd: parseISO('2029-02-15'),
    effLiq: parseISO('2034-02-15'),
    fees: acmeFees,
  });

  it('mgmt fee IP quarters = 150,000 (2% commitment / 4)', () => {
    for (let i = 0; i < 4; i++) expect(fb.mgmtFee[i]).toBeCloseTo(150_000, 6);
  });

  it('Y1 mgmt total = 600,000', () => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += fb.mgmtFee[i];
    expect(s).toBeCloseTo(600_000, 6);
  });

  it('establishment one-shot 150,000 at q1', () => {
    expect(fb.establishment[0]).toBeCloseTo(150_000, 6);
    for (let i = 1; i < n; i++) expect(fb.establishment[i]).toBe(0);
  });

  it('all pr = 1 on the inception timeline', () => {
    for (const v of fb.pr) expect(v).toBe(1);
  });
});
