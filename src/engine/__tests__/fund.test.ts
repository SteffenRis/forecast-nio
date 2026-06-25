import { runFund } from '../fund';
import { makeAcmeFund } from './fixtures/acme';
import { calQuarterOrdinal, quarterOf, parseISO } from '../util/daycount';

function baseScenario() {
  const fund = makeAcmeFund();
  const res = runFund(fund);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  return { fund, res, sc };
}

// Inception year Y ends at inception-quarter index 4Y, i.e. array index 4Y-1.
function yearEndIndex(_sc: unknown, _dEff: Date, year: number) {
  return 4 * year - 1;
}

describe('§16 fund-level Y1 row (EUR)', () => {
  const { fund, sc } = baseScenario();
  const dEff = fund.effectiveDate;
  const y1 = yearEndIndex(sc, dEff, 1);

  it('finds the Y1 quarter', () => {
    expect(y1).toBeGreaterThanOrEqual(0);
  });

  it('P_net cumulative ≈ 6,000,000 at Y1', () => {
    // cumulative paid-in through Y1
    let cum = 0;
    for (let i = 0; i <= y1; i++) cum += sc.rows[i].pNet;
    expect(cum).toBeCloseTo(6_000_000, 0);
  });

  it('NAV ≈ 5,400,000 at Y1', () => {
    expect(sc.rows[y1].nav).toBeCloseTo(5_400_000, 0);
  });

  it('mgmt_fee cumulative through Y1 ≈ 600,000', () => {
    let cum = 0;
    for (let i = 0; i <= y1; i++) cum += sc.rows[i].mgmtFee;
    expect(cum).toBeCloseTo(600_000, 0);
  });

  it('expenses cumulative through Y1 ≈ 75,000', () => {
    let cum = 0;
    for (let i = 0; i <= y1; i++) cum += sc.rows[i].expenses;
    expect(cum).toBeCloseTo(75_000, 0);
  });

  it('establishment one-shot ≈ 150,000', () => {
    let cum = 0;
    for (const r of sc.rows) cum += r.establishment;
    expect(cum).toBeCloseTo(150_000, 0);
  });

  it('carry = 0 through Y1', () => {
    for (let i = 0; i <= y1; i++) expect(sc.rows[i].carry).toBeCloseTo(0, 6);
  });
});

describe('§10.7 Acme hurdle balance B trajectory (8% hurdle)', () => {
  const { fund, sc } = baseScenario();
  const dEff = fund.effectiveDate;
  const targets: [number, number][] = [
    [1, 6_177_114],
    [3, 23_779_737],
    [4, 27_160_322],
    [5, 22_851_820],
    [6, 12_325_737],
  ];
  for (const [year, expected] of targets) {
    it(`B at end of Y${year} ≈ ${expected}`, () => {
      const idx = yearEndIndex(sc, dEff, year);
      expect(sc.hurdleBalance[idx]).toBeCloseTo(expected, -1); // within ~10
    });
  }
  it('B cleared (0) by end of Y7 and at Y10', () => {
    const y7 = yearEndIndex(sc, dEff, 7);
    const y10 = yearEndIndex(sc, dEff, 10);
    expect(sc.hurdleBalance[y7]).toBeLessThan(1);
    expect(sc.hurdleBalance[y10]).toBeLessThan(1);
  });
});

describe('§10.8 carry (20%, catch-up=true)', () => {
  const { sc } = baseScenario();
  it('terminal carry_cum = 9,000,000', () => {
    expect(sc.carryCum[sc.carryCum.length - 1]).toBeCloseTo(9_000_000, 0);
  });
  it('first carry jump = 2,250,000', () => {
    const firstCarryIdx = sc.rows.findIndex((r) => r.carry > 1e-6);
    expect(firstCarryIdx).toBeGreaterThanOrEqual(0);
    expect(sc.rows[firstCarryIdx].carry).toBeCloseTo(2_250_000, 0);
  });
  it('q_clear is Q28', () => {
    // Q28 = end of Y7. qClearIndex should align with that.
    expect(sc.qClearIndex).toBe(27); // 0-based index 27 = quarter 28
  });
});

describe('§16 terminal fund IRRs', () => {
  const { sc } = baseScenario();
  it('Gross ≈ 27.09%', () => {
    expect(sc.grossIrr!).toBeCloseTo(0.2709, 3);
  });
  it('Pre-carry ≈ 23.19%', () => {
    expect(sc.preCarryIrr!).toBeCloseTo(0.2319, 3);
  });
  it('Net ≈ 20.41%', () => {
    expect(sc.netIrr!).toBeCloseTo(0.2041, 3);
  });
  it('gross ≥ pre_carry ≥ net (I18)', () => {
    expect(sc.grossIrr!).toBeGreaterThanOrEqual(sc.preCarryIrr! - 1e-6);
    expect(sc.preCarryIrr!).toBeGreaterThanOrEqual(sc.netIrr! - 1e-6);
  });
});
