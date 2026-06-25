import { runFundForecast, runPortfolioForecast, xirr } from '../index';
import type { FundInputJSON, PortfolioInputJSON } from '../index';
import { acmeTemplate, acmeFees, neutralSliders, overlayEnabled, overlayDisabled } from './fixtures/acme';

// §16 reference inputs as JSON (ISO strings).
const acmeFundJSON: FundInputJSON = {
  id: 'acme-vii',
  name: 'Acme VII',
  commitment: 30_000_000,
  currency: 'EUR',
  effectiveDate: '2024-02-15',
  investmentPeriodEnd: '2029-02-15',
  standardLiquidationDate: '2034-02-15',
  template: acmeTemplate,
  sliders: neutralSliders,
  fees: acmeFees,
  status: 'ACTIVE',
};

function portfolioJSON(overlay: typeof overlayEnabled): PortfolioInputJSON {
  return {
    id: 'nordic-fof',
    name: 'Nordic FoF',
    currency: 'USD',
    size: 9_213_036,
    effectiveDate: '2024-02-15',
    investmentPeriodEnd: '2029-02-15',
    funds: [{ fund: acmeFundJSON, allocatedCommitment: 10_000_000 }],
    fx: { rates: { 'EUR->USD': 1.08 } },
    overlay,
    isFoF: true,
  };
}

describe('§16 end-to-end via public JSON API', () => {
  it('fund terminal IRRs Gross 27.09 / Pre 23.19 / Net 20.41', () => {
    const r = runFundForecast(acmeFundJSON);
    const sc = r.scenarios.find((s) => s.scenarioId === 'base')!;
    expect(sc.grossIrr!).toBeCloseTo(0.2709, 3);
    expect(sc.preCarryIrr!).toBeCloseTo(0.2319, 3);
    expect(sc.netIrr!).toBeCloseTo(0.2041, 3);
  });

  it('output is JSON-serializable (no Date / Map / class instances)', () => {
    const r = runFundForecast(acmeFundJSON);
    const round = JSON.parse(JSON.stringify(r));
    expect(round.scenarios[0].rows[0].quarter).toEqual(r.scenarios[0].rows[0].quarter);
    // quarter is a plain {year,q} object
    expect(typeof r.scenarios[0].rows[0].quarter.year).toBe('number');
    expect(typeof r.scenarios[0].rows[0].quarter.q).toBe('number');
  });

  it('fund-level Y1 row matches §16', () => {
    const r = runFundForecast(acmeFundJSON);
    const sc = r.scenarios.find((s) => s.scenarioId === 'base')!;
    let pNet = 0;
    let mgmt = 0;
    let exp = 0;
    let est = 0;
    for (let i = 0; i < 4; i++) {
      pNet += sc.rows[i].pNet;
      mgmt += sc.rows[i].mgmtFee;
      exp += sc.rows[i].expenses;
      est += sc.rows[i].establishment;
    }
    expect(pNet).toBeCloseTo(6_000_000, 0);
    expect(sc.rows[3].nav).toBeCloseTo(5_400_000, 0);
    expect(mgmt).toBeCloseTo(600_000, 0);
    expect(exp).toBeCloseTo(75_000, 0);
    expect(est).toBeCloseTo(150_000, 0);
    for (let i = 0; i < 4; i++) expect(sc.rows[i].carry).toBeCloseTo(0, 6);
  });

  it('portfolio overlay-off Stage 1/2/3 IRRs = fund Gross/Pre/Net', () => {
    const r = runPortfolioForecast(portfolioJSON(overlayDisabled));
    const sc = r.scenarios.find((s) => s.scenarioId === 'base')!;
    expect(sc.irrStages).toHaveLength(3);
    expect(sc.irrStages[0]!).toBeCloseTo(0.2709, 3);
    expect(sc.irrStages[1]!).toBeCloseTo(0.2319, 3);
    expect(sc.irrStages[2]!).toBeCloseTo(0.2041, 3);
  });

  it('portfolio Stage-2 USD Y1 paid-in 2,160,000 and Y5 distribution 4,860,000', () => {
    const r = runPortfolioForecast(portfolioJSON(overlayDisabled));
    const sc = r.scenarios.find((s) => s.scenarioId === 'base')!;
    let pin = 0;
    for (let i = 0; i < 4; i++) pin += sc.kid.stage2[i].paidIn;
    expect(pin).toBeCloseTo(2_160_000, 0);
    let dist = 0;
    for (let i = 0; i < 20; i++) dist += sc.kid.stage2[i].distributions;
    expect(dist).toBeCloseTo(4_860_000, 0);
  });

  it('portfolio overlay-on 6-stage IRRs', () => {
    const r = runPortfolioForecast(portfolioJSON(overlayEnabled));
    const sc = r.scenarios.find((s) => s.scenarioId === 'base')!;
    const expected = [0.2709, 0.2319, 0.2041, 0.1931, 0.1908, 0.1861];
    expect(sc.irrStages).toHaveLength(6);
    for (let i = 0; i < 6; i++) expect(sc.irrStages[i]!).toBeCloseTo(expected[i], 3);
  });

  it('standalone xirr matches Excel anchor', () => {
    const r = xirr([
      { date: '2021-01-01', amount: -1000 },
      { date: '2022-01-01', amount: 1200 },
    ]);
    expect(r!).toBeCloseTo(0.2, 8);
  });
});
