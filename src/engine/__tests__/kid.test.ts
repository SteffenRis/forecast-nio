import { annualCostAllocation, kidScenario } from '../kid';
import { runPortfolio } from '../portfolio';
import { runOverlay } from '../overlay';
import { makeAcmeFund, makeNordicPortfolio, overlayDisabled, overlayEnabled } from './fixtures/acme';

describe('§13 annualCostAllocation edge', () => {
  it('divides by span (quarters/4)', () => {
    expect(annualCostAllocation(4000, 40)).toBeCloseTo(400, 9); // 40/4 = 10 yrs
  });
  it('null on 0 span', () => {
    expect(annualCostAllocation(4000, 0)).toBeNull();
  });
  it('null on non-finite span', () => {
    expect(annualCostAllocation(4000, Infinity)).toBeNull();
  });
});

describe('§13 KID three-stage (overlay disabled → Stage 3 = Stage 2)', () => {
  const fund = makeAcmeFund();
  const portfolio = makeNordicPortfolio(fund, overlayDisabled);
  const res = runPortfolio(portfolio);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  const kid = kidScenario(sc, undefined, 0);

  it('stage 3 equals stage 2 identically', () => {
    for (let i = 0; i < kid.stage2.length; i++) {
      expect(kid.stage3[i].paidIn).toBeCloseTo(kid.stage2[i].paidIn, 6);
      expect(kid.stage3[i].distributions).toBeCloseTo(kid.stage2[i].distributions, 6);
    }
  });

  it('stage 1 paid-in >= stage 2 paid-in (gross deploys less per LP €)', () => {
    // Stage 1 paid-in is p_gross (deployed); Stage 2 is p_net (LP funds fees).
    // p_net >= p_gross, so Stage 2 paid-in >= Stage 1 paid-in.
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < kid.stage1.length; i++) {
      s1 += kid.stage1[i].paidIn;
      s2 += kid.stage2[i].paidIn;
    }
    expect(s2).toBeGreaterThanOrEqual(s1 - 1e-6);
  });
});

describe('§13 KID three-stage (overlay enabled → Stage 3 adds overlay fees)', () => {
  const fund = makeAcmeFund();
  const portfolio = makeNordicPortfolio(fund, overlayEnabled);
  const res = runPortfolio(portfolio);
  const overlay = runOverlay(portfolio, res);
  const sc = res.scenarios.find((s) => s.scenarioId === 'base')!;
  const ovsc = overlay.scenarios.find((s) => s.scenarioId === 'base')!;
  const kid = kidScenario(sc, ovsc, 0);

  it('stage 3 paid-in >= stage 2 paid-in (overlay fees added)', () => {
    let s2 = 0;
    let s3 = 0;
    for (let i = 0; i < kid.stage2.length; i++) {
      s2 += kid.stage2[i].paidIn;
      s3 += kid.stage3[i].paidIn;
    }
    expect(s3).toBeGreaterThan(s2);
  });

  it('stage 3 distributions <= stage 2 distributions (overlay carry taken)', () => {
    let s2 = 0;
    let s3 = 0;
    for (let i = 0; i < kid.stage2.length; i++) {
      s2 += kid.stage2[i].distributions;
      s3 += kid.stage3[i].distributions;
    }
    expect(s3).toBeLessThanOrEqual(s2 + 1e-6);
  });
});
