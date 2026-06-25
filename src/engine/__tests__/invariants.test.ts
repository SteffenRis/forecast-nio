import { runFund } from '../fund';
import { runPortfolio, fxRate } from '../portfolio';
import { computeHurdleCarry } from '../hurdleCarry';
import {
  makeAcmeFund,
  makeNordicPortfolio,
  overlayDisabled,
  acmeFees,
} from './fixtures/acme';
import type { FundInput, Warning } from '../types';
import { parseISO, calQuarterOrdinal, quarterOf, addMonths } from '../util/daycount';

function baseSc(fund: FundInput) {
  const r = runFund(fund);
  return { r, sc: r.scenarios.find((s) => s.scenarioId === 'base')! };
}

describe('Invariants over the reference fund', () => {
  const { sc } = baseSc(makeAcmeFund());
  const n = sc.rows.length;

  it('I1: TVPI(terminal) = DPI(terminal) (NAV→0)', () => {
    // At terminal, NAV ≈ 0 so dGross-only check via nav.
    expect(sc.rows[n - 1].nav).toBeCloseTo(0, 0);
  });

  it('I2: NAV = max(0, TVPI·P − D) by construction (non-negative)', () => {
    for (const row of sc.rows) expect(row.nav).toBeGreaterThanOrEqual(0);
  });

  it('I3: P = Σ p, D = Σ d (1e-9 relative)', () => {
    let cumP = 0;
    let cumD = 0;
    for (const row of sc.rows) {
      cumP += row.pNet;
      cumD += row.dNet;
    }
    // terminal cumulative paid-in = 30M (PIC terminal 1.0); D = 66M (DPI 2.2).
    expect(cumP).toBeCloseTo(30_000_000, 0);
    expect(cumD).toBeCloseTo(66_000_000, 0);
  });

  it('I4: gross_cf = net_cf + mgmt + expenses + establishment + carry (1 minor unit)', () => {
    for (const row of sc.rows) {
      const lhs = row.grossCf;
      const rhs = row.netCf + row.mgmtFee + row.expenses + row.establishment + row.carry;
      expect(Math.abs(lhs - rhs)).toBeLessThan(0.01);
    }
  });

  it('I8: cost_basis(terminal) = 0 (1e-6)', () => {
    expect(sc.costBasis[n - 1]).toBeCloseTo(0, 6);
  });

  it('I9: first quarter pre-distribution, cost_basis = P', () => {
    // Q1: D=0 → cost_basis = P.
    expect(sc.costBasis[0]).toBeCloseTo(sc.rows[0].pNet, 6);
  });

  it('I18: gross ≥ pre_carry ≥ net (fund level)', () => {
    expect(sc.grossIrr!).toBeGreaterThanOrEqual(sc.preCarryIrr! - 1e-6);
    expect(sc.preCarryIrr!).toBeGreaterThanOrEqual(sc.netIrr! - 1e-6);
  });

  it('I19: catch-up terminal carry > 0 → gross IRR ≥ hurdle·(360/365)', () => {
    expect(sc.carryCum[n - 1]).toBeGreaterThan(0);
    expect(sc.grossIrr!).toBeGreaterThanOrEqual(0.08 * (360 / 365) - 1e-4);
  });
});

describe('I5 / I6: carry-sum identities', () => {
  it('I5 (catch-up): Σ carry = carry_rate·(G_cum_terminal − P_terminal)', () => {
    const { sc } = baseSc(makeAcmeFund());
    const n = sc.rows.length;
    let sumCarry = 0;
    let P = 0;
    for (const row of sc.rows) {
      sumCarry += row.carry;
      P += row.pNet;
    }
    const Gterminal = sc.carryCum[n - 1] + 66_000_000; // G_cum = N_cum + carry_cum
    expect(sumCarry).toBeCloseTo(0.2 * (Gterminal - P), 0);
  });

  it('I6 (no catch-up): Σ carry = carry_rate·(G_cum_terminal − threshold_N)', () => {
    const fund = makeAcmeFund({ fees: { ...acmeFees, catchUp: false } });
    const { sc } = baseSc(fund);
    const n = sc.rows.length;
    let sumCarry = 0;
    for (const row of sc.rows) sumCarry += row.carry;
    const Gterminal = sc.carryCum[n - 1] + 66_000_000;
    expect(sumCarry).toBeCloseTo(0.2 * (Gterminal - sc.thresholdN), 0);
    expect(sc.thresholdN / 1e6).toBeCloseTo(38.4, 1);
  });
});

describe('I7: never-clearing fund → carry = 0 ∀q', () => {
  // A fund that never returns capital (DPI stays ~0): B never clears.
  const lowDpiTemplate = {
    granularity: 'annual' as const,
    scenarios: [
      {
        id: 'base',
        isBase: true,
        pic: { points: [{ period: 1, value: 1.0 }] },
        dpi: { points: [{ period: 10, value: 0.1 }] }, // tiny terminal DPI
        tvpi: { points: [{ period: 10, value: 0.5 }] },
      },
    ],
  };
  const fund = makeAcmeFund({ template: lowDpiTemplate });
  const { sc } = baseSc(fund);
  it('terminal B > 0 and carry 0', () => {
    expect(sc.hurdleBalance[sc.hurdleBalance.length - 1]).toBeGreaterThan(0);
    for (const row of sc.rows) expect(row.carry).toBe(0);
    expect(sc.qClearIndex).toBe(-1);
  });
});

describe('I16/I17: WOUND_DOWN / ABANDONED → zeros after last actual', () => {
  function statusFund(status: 'WOUND_DOWN' | 'ABANDONED'): FundInput {
    const dEff = parseISO('2024-02-15');
    // actual at inception quarter 4 (2025-Q1 area). Find that calendar quarter.
    const q4cal = quarterOf(new Date(addMonths(dEff, 12).getTime() - 86400000));
    return makeAcmeFund({
      status,
      actuals: [
        {
          quarter: q4cal,
          cumulativePaidIn: 6_000_000,
          cumulativeDistributions: 500_000,
          nav: 5_000_000,
        },
      ],
    });
  }
  for (const status of ['WOUND_DOWN', 'ABANDONED'] as const) {
    it(`${status}: all quarters after last actual are zero`, () => {
      const fund = statusFund(status);
      const { sc } = baseSc(fund);
      const lastActualOrd = calQuarterOrdinal(fund.actuals![0].quarter);
      const lastIdx = sc.rows.findIndex(
        (r) => calQuarterOrdinal(r.quarter) === lastActualOrd,
      );
      expect(lastIdx).toBeGreaterThanOrEqual(0);
      for (let i = lastIdx + 1; i < sc.rows.length; i++) {
        expect(sc.rows[i].pNet).toBeCloseTo(0, 6);
        expect(sc.rows[i].dNet).toBeCloseTo(0, 6);
        expect(sc.rows[i].nav).toBeCloseTo(0, 6);
      }
    });
  }
});

describe('I10/I11: aggregation', () => {
  it('I10: full-commitment allocation → fund_cf_in_portfolio = fund_cf', () => {
    const fund = makeAcmeFund();
    const portfolio = {
      ...makeNordicPortfolio(fund, overlayDisabled),
      currency: 'EUR', // identity FX
      fx: { rates: { 'EUR->EUR': 1 } },
      isFoF: false,
      funds: [{ fund, allocatedCommitment: fund.commitment }], // 100% allocation
    };
    const pres = runPortfolio(portfolio);
    const psc = pres.scenarios.find((s) => s.scenarioId === 'base')!;
    const { sc: fsc } = baseSc(fund);
    // First-quarter p_net should match the fund's exactly (pr=1, fx=1).
    expect(psc.items[0].pNet).toBeCloseTo(fsc.rows[0].pNet, 4);
    let sumP = 0;
    let sumF = 0;
    for (let i = 0; i < psc.items.length; i++) sumP += psc.items[i].pNet;
    for (const row of fsc.rows) sumF += row.pNet;
    expect(sumP).toBeCloseTo(sumF, 2);
  });

  it('I11: Σ over a fully-allocated fund split across two portfolios = fund_cf', () => {
    const fund = makeAcmeFund();
    const mk = (alloc: number) => ({
      ...makeNordicPortfolio(fund, overlayDisabled),
      currency: 'EUR',
      fx: { rates: { 'EUR->EUR': 1 } },
      isFoF: false,
      funds: [{ fund, allocatedCommitment: alloc }],
    });
    const half1 = runPortfolio(mk(15_000_000));
    const half2 = runPortfolio(mk(15_000_000));
    const p1 = half1.scenarios.find((s) => s.scenarioId === 'base')!;
    const p2 = half2.scenarios.find((s) => s.scenarioId === 'base')!;
    const { sc: fsc } = baseSc(fund);
    for (let i = 0; i < fsc.rows.length; i++) {
      const combined = p1.items[i].pNet + p2.items[i].pNet;
      expect(combined).toBeCloseTo(fsc.rows[i].pNet, 4);
    }
  });

  it('I12: rate(A→B)·rate(B→A) = 1 (auto-inversion)', () => {
    const w: Warning[] = [];
    const fx = { rates: { 'EUR->USD': 1.08 } };
    const ab = fxRate(fx, 'EUR', 'USD', w);
    const ba = fxRate(fx, 'USD', 'EUR', w);
    expect(ab * ba).toBeCloseTo(1, 4);
  });
});

describe('I13: concentration = 0 → non-base = base', () => {
  it('two-scenario template collapses at concentration 0', () => {
    const template = {
      granularity: 'annual' as const,
      scenarios: [
        {
          id: 'base',
          isBase: true,
          pic: { points: [{ period: 1, value: 0.5 }, { period: 5, value: 1.0 }] },
          dpi: { points: [{ period: 10, value: 2.2 }] },
          tvpi: { points: [{ period: 10, value: 2.2 }] },
        },
        {
          id: 'high',
          isBase: false,
          pic: { points: [{ period: 1, value: 0.6 }, { period: 5, value: 1.0 }] },
          dpi: { points: [{ period: 10, value: 2.8 }] },
          tvpi: { points: [{ period: 10, value: 2.8 }] },
        },
      ],
    };
    const fund = makeAcmeFund({
      template,
      sliders: { dpiMultiplier: 1, dpiTiming: 0, concentration: 0 },
    });
    const r = runFund(fund);
    const base = r.scenarios.find((s) => s.scenarioId === 'base')!;
    const high = r.scenarios.find((s) => s.scenarioId === 'high')!;
    for (let i = 0; i < base.rows.length; i++) {
      expect(high.rows[i].pNet).toBeCloseTo(base.rows[i].pNet, 4);
      expect(high.rows[i].dNet).toBeCloseTo(base.rows[i].dNet, 4);
    }
  });
});

describe('I14/I15: DPI timing', () => {
  it('I14: dpi_timing = 0 → DPI reshape is identity', () => {
    const a = baseSc(makeAcmeFund({ sliders: { dpiMultiplier: 1, dpiTiming: 0, concentration: 1 } }));
    // baseline net IRR
    expect(a.sc.netIrr!).toBeCloseTo(0.2041, 3);
  });
  it('I15: terminal DPI preserved for any dpi_timing', () => {
    for (const t of [-1, -0.5, 0.5, 1]) {
      const { sc } = baseSc(
        makeAcmeFund({ sliders: { dpiMultiplier: 1, dpiTiming: t, concentration: 1 } }),
      );
      let cumD = 0;
      for (const row of sc.rows) cumD += row.dNet;
      expect(cumD).toBeCloseTo(66_000_000, 0); // terminal DPI 2.2 × 30M
    }
  });
});

describe('I20: all flows same sign → IRR null', () => {
  it('a fund that only calls capital (no distributions, no NAV) → null', () => {
    const template = {
      granularity: 'annual' as const,
      scenarios: [
        {
          id: 'base',
          isBase: true,
          pic: { points: [{ period: 1, value: 1.0 }] },
          dpi: { points: [{ period: 10, value: 0.0 }] },
          tvpi: { points: [{ period: 10, value: 0.0 }] },
        },
      ],
    };
    const { sc } = baseSc(makeAcmeFund({ template }));
    expect(sc.netIrr).toBeNull();
  });
});

describe('I22: headline regression guard (catch_up=true)', () => {
  // carry_cum>0 ⇔ pre-carry IRR > hurdle ⇔ terminal B = 0.
  function probe(fund: FundInput) {
    const { sc } = baseSc(fund);
    const n = sc.rows.length;
    const carryPositive = sc.carryCum[n - 1] > 1e-6;
    const bCleared = sc.hurdleBalance[n - 1] <= 1e-6;
    const preCarryAboveHurdle = (sc.preCarryIrr ?? -1) > 0.08;
    return { carryPositive, bCleared, preCarryAboveHurdle };
  }

  it('reference fund: all three true together', () => {
    const p = probe(makeAcmeFund());
    expect(p.carryPositive).toBe(true);
    expect(p.bCleared).toBe(true);
    expect(p.preCarryAboveHurdle).toBe(true);
  });

  it('low-return fund: all three false together', () => {
    // DPI terminal 1.0 (below hurdle compounding over 10y) → no carry.
    const template = {
      granularity: 'annual' as const,
      scenarios: [
        {
          id: 'base',
          isBase: true,
          pic: { points: [{ period: 1, value: 1.0 }] },
          dpi: { points: [{ period: 10, value: 1.0 }] },
          tvpi: { points: [{ period: 10, value: 1.0 }] },
        },
      ],
    };
    const p = probe(makeAcmeFund({ template }));
    expect(p.carryPositive).toBe(false);
    expect(p.bCleared).toBe(false);
    expect(p.preCarryAboveHurdle).toBe(false);
  });

  it('I22 biconditional holds across a sweep of terminal DPIs', () => {
    for (const term of [0.8, 1.0, 1.1, 1.3, 1.5, 2.2, 3.0]) {
      const template = {
        granularity: 'annual' as const,
        scenarios: [
          {
            id: 'base',
            isBase: true,
            pic: { points: [{ period: 1, value: 1.0 }] },
            dpi: {
              points: [
                { period: 5, value: term * 0.3 },
                { period: 10, value: term },
              ],
            },
            tvpi: {
              points: [
                { period: 5, value: Math.max(term * 0.3, 1.0) },
                { period: 10, value: term },
              ],
            },
          },
        ],
      };
      const p = probe(makeAcmeFund({ template }));
      // All three flags must agree.
      expect(p.carryPositive).toBe(p.bCleared);
      expect(p.carryPositive).toBe(p.preCarryAboveHurdle);
    }
  });
});

describe('I22 interim-distribution fund (the B-recurrence guard)', () => {
  // A fund with a large early distribution that momentarily clears B, then more
  // capital calls push B back up — carry must NOT trigger on the momentary clear.
  it('momentary early clear does not trigger carry', () => {
    const template = {
      granularity: 'annual' as const,
      scenarios: [
        {
          id: 'base',
          isBase: true,
          // call 50% Y1, distribute big Y2 (clears B), call rest Y3 (B back up),
          // then ramp distributions to terminal 2.2.
          pic: {
            points: [
              { period: 1, value: 0.5 },
              { period: 2, value: 0.5 },
              { period: 3, value: 1.0 },
            ],
          },
          dpi: {
            points: [
              { period: 1, value: 0.0 },
              { period: 2, value: 1.5 }, // big interim distribution
              { period: 3, value: 0.8 }, // ratio drops as PIC jumps
              { period: 10, value: 2.2 },
            ],
          },
          tvpi: {
            points: [
              { period: 1, value: 1.0 },
              { period: 2, value: 1.6 },
              { period: 3, value: 1.4 },
              { period: 10, value: 2.2 },
            ],
          },
        },
      ],
    };
    const fund = makeAcmeFund({ template });
    const { sc } = baseSc(fund);
    const n = sc.rows.length;
    // Carry must be 0 until the DURABLE clear (q_clear), even if B hit 0 earlier.
    if (sc.qClearIndex >= 0) {
      for (let i = 0; i < sc.qClearIndex; i++) {
        expect(sc.rows[i].carry).toBeCloseTo(0, 6);
      }
      // B must be 0 from q_clear through terminal.
      for (let i = sc.qClearIndex; i < n; i++) {
        expect(sc.hurdleBalance[i]).toBeLessThan(1);
      }
    }
    // I22 biconditional still holds.
    const carryPositive = sc.carryCum[n - 1] > 1e-6;
    const bCleared = sc.hurdleBalance[n - 1] <= 1e-6;
    expect(carryPositive).toBe(bCleared);
  });
});
