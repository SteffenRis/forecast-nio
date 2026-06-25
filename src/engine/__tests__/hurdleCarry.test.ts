import { computeHurdleCarry, quarterlyRate } from '../hurdleCarry';

// Build Acme inception-quarter flows (no fees needed for hurdle/carry).
function acmeFlows() {
  const picA = [0.2, 0.5, 0.75, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const dpiA = [0, 0, 0.05, 0.2, 0.45, 0.85, 1.3, 1.75, 2.05, 2.2];
  const C = 30_000_000;
  const expand = (a: number[]) => {
    const o: number[] = [];
    for (let q = 1; q <= 40; q++) {
      const y = Math.ceil(q / 4);
      const k = q - 4 * (y - 1);
      const vP = y <= 1 ? 0 : a[y - 2];
      const vC = a[y - 1];
      o.push(vP + (k / 4) * (vC - vP));
    }
    return o;
  };
  const pic = expand(picA);
  const dpi = expand(dpiA);
  const P = pic.map((v) => v * C);
  const D = pic.map((v, i) => dpi[i] * v * C);
  const p = P.map((v, i) => v - (i > 0 ? P[i - 1] : 0));
  const d = D.map((v, i) => v - (i > 0 ? D[i - 1] : 0));
  return { p, d, P, D };
}

describe('quarterlyRate', () => {
  it('8% → 0.019427', () => {
    expect(quarterlyRate(0.08)).toBeCloseTo(0.019427, 6);
  });
});

describe('§10.7 outstanding-balance hurdle (Acme)', () => {
  const { p, d, P, D } = acmeFlows();
  const hc = computeHurdleCarry({
    p,
    d,
    P,
    D,
    hurdleAnnual: 0.08,
    carryRate: 0.2,
    catchUp: true,
  });

  const targets: [number, number][] = [
    [4, 6_177_114], // Y1 = index 3
    [12, 23_779_737], // Y3
    [16, 27_160_322], // Y4
    [20, 22_851_820], // Y5
    [24, 12_325_737], // Y6
  ];
  for (const [qtr, expected] of targets) {
    it(`B at Q${qtr} ≈ ${expected}`, () => {
      expect(hc.B[qtr - 1]).toBeCloseTo(expected, -1);
    });
  }
  it('B clears at Q28 and stays clear', () => {
    expect(hc.B[27]).toBeLessThan(1);
    expect(hc.B[39]).toBeLessThan(1);
    expect(hc.qClearIndex).toBe(27);
  });
});

describe('§10.8 carry with catch-up (Acme)', () => {
  const { p, d, P, D } = acmeFlows();
  const hc = computeHurdleCarry({
    p,
    d,
    P,
    D,
    hurdleAnnual: 0.08,
    carryRate: 0.2,
    catchUp: true,
  });
  it('terminal carry_cum = 9,000,000', () => {
    expect(hc.carryCum[39]).toBeCloseTo(9_000_000, 0);
  });
  it('first carry jump = 2,250,000 at Q28', () => {
    expect(hc.carry[27]).toBeCloseTo(2_250_000, 0);
  });
  it('I5: Σ carry = carry_rate·(G_cum_terminal − P_terminal)', () => {
    const sumCarry = hc.carry.reduce((a, b) => a + b, 0);
    const expected = 0.2 * (hc.Gcum[39] - P[39]);
    expect(sumCarry).toBeCloseTo(expected, 0);
  });
});

describe('§10.8 carry without catch-up (Acme)', () => {
  const { p, d, P, D } = acmeFlows();
  const hc = computeHurdleCarry({
    p,
    d,
    P,
    D,
    hurdleAnnual: 0.08,
    carryRate: 0.2,
    catchUp: false,
  });
  it('threshold_N ≈ 38.4M', () => {
    expect(hc.thresholdN / 1e6).toBeCloseTo(38.4, 1);
  });
  it('terminal carry ≈ 6,896,678', () => {
    expect(hc.carryCum[39]).toBeCloseTo(6_896_678, -1);
  });
  it('I6: Σ carry = carry_rate·(G_cum_terminal − threshold_N)', () => {
    const sumCarry = hc.carry.reduce((a, b) => a + b, 0);
    const expected = 0.2 * (hc.Gcum[39] - hc.thresholdN);
    expect(sumCarry).toBeCloseTo(expected, 0);
  });
});

describe('§10.8 never-clearing fund (I7)', () => {
  // A fund that never returns capital: B stays > 0 → carry = 0 ∀q.
  const n = 40;
  const p = new Array(n).fill(0);
  const d = new Array(n).fill(0);
  p[0] = 30_000_000; // all called, nothing distributed
  const P = p.map((_, i) => p.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const D = d.map((_, i) => d.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const hc = computeHurdleCarry({
    p,
    d,
    P,
    D,
    hurdleAnnual: 0.08,
    carryRate: 0.2,
    catchUp: true,
  });
  it('terminal B > 0', () => {
    expect(hc.B[n - 1]).toBeGreaterThan(0);
  });
  it('carry = 0 for all q', () => {
    for (const c of hc.carry) expect(c).toBe(0);
    expect(hc.qClearIndex).toBe(-1);
  });
});
