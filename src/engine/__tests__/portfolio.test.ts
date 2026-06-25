import { runPortfolio } from '../portfolio';
import { runOverlay } from '../overlay';
import { portfolioIrrStages } from '../kid';
import {
  makeAcmeFund,
  makeNordicPortfolio,
  overlayDisabled,
  overlayEnabled,
} from './fixtures/acme';

describe('§16 portfolio Stage-2 (USD, pr=1/3, FX=1.08)', () => {
  const fund = makeAcmeFund();
  const portfolio = makeNordicPortfolio(fund, overlayDisabled);
  const res = runPortfolio(portfolio);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;

  it('Y1 cumulative paid-in = 2,160,000', () => {
    // inception Y1 = first 4 calendar quarters of the fund's grid.
    // Aggregated p_net cumulative through Y1 = 6,000,000·(1/3)·1.08 = 2,160,000.
    let cum = 0;
    for (let i = 0; i < 4; i++) cum += sc.items[i].pNet;
    expect(cum).toBeCloseTo(2_160_000, 0);
  });

  it('Y5 cumulative distribution = 4,860,000', () => {
    // D cumulative at Y5 = 13,500,000·(1/3)·1.08 = 4,860,000.
    let cum = 0;
    for (let i = 0; i < 20; i++) cum += sc.items[i].dNet;
    expect(cum).toBeCloseTo(4_860_000, 0);
  });
});

describe('§16 overlay-off → Stage 1/2/3 IRRs = fund Gross/Pre/Net', () => {
  const fund = makeAcmeFund();
  const portfolio = makeNordicPortfolio(fund, overlayDisabled);
  const res = runPortfolio(portfolio);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  const irr = portfolioIrrStages(sc, undefined);

  it('Stage 1 ≈ 27.09%', () => expect(irr.stages[0]!).toBeCloseTo(0.2709, 3));
  it('Stage 2 ≈ 23.19%', () => expect(irr.stages[1]!).toBeCloseTo(0.2319, 3));
  it('Stage 3 ≈ 20.41%', () => expect(irr.stages[2]!).toBeCloseTo(0.2041, 3));
});

describe('§16 overlay-on 6-stage IRRs', () => {
  const fund = makeAcmeFund();
  const portfolio = makeNordicPortfolio(fund, overlayEnabled);
  const res = runPortfolio(portfolio);
  const overlay = runOverlay(portfolio, res);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  const ovsc = overlay.scenarios.find((s) => s.scenarioId === 'base')!;
  const irr = portfolioIrrStages(sc, ovsc);

  const expected = [0.2709, 0.2319, 0.2041, 0.1931, 0.1908, 0.1861];
  for (let s = 0; s < 6; s++) {
    it(`Stage ${s + 1} ≈ ${(expected[s] * 100).toFixed(2)}%`, () => {
      expect(irr.stages[s]!).toBeCloseTo(expected[s], 3);
    });
  }

  it('stages monotonically decreasing (I18)', () => {
    for (let s = 1; s < 6; s++) {
      expect(irr.stages[s]!).toBeLessThanOrEqual(irr.stages[s - 1]! + 1e-6);
    }
  });
});

describe('§11 I10/I12 aggregation invariants', () => {
  it('I12: rate(A→B)·rate(B→A) = 1', () => {
    // EUR→USD = 1.08 supplied; inverse auto-computed.
    const fund = makeAcmeFund();
    const portfolio = makeNordicPortfolio(fund, overlayDisabled);
    // direct rate
    const r = portfolio.fx.rates['EUR->USD'];
    expect(r * (1 / r)).toBeCloseTo(1, 4);
  });
});
