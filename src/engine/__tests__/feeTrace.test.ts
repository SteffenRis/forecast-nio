import { describe, expect, it } from 'vitest';
import { runFundFeeTrace, runFundForecast } from '../index';
import type { FundInputJSON } from '../index';
import { acmeTemplate, acmeFees, neutralSliders } from './fixtures/acme';

// The fee trace must reproduce the engine's OWN numbers (it shares
// computeScenarioPrimitives with runFund) and expose the intermediates behind each
// fee/carry figure. These guard against drift and verify the step-by-step arithmetic
// the auditability drawer renders, against the §16 Acme reference.

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

const trace = runFundFeeTrace(acmeFundJSON);
const sc = trace.scenarios.find((s) => s.scenarioId === 'base')!;
const forecast = runFundForecast(acmeFundJSON);
const fsc = forecast.scenarios.find((s) => s.scenarioId === 'base')!;

describe('fee trace — drift guard vs runFund', () => {
  it('per-quarter fee/carry figures equal the forecast rows', () => {
    expect(sc.quarters).toHaveLength(fsc.rows.length);
    for (let i = 0; i < fsc.rows.length; i++) {
      const t = sc.quarters[i];
      const r = fsc.rows[i];
      expect(t.mgmtFee).toBeCloseTo(r.mgmtFee, 6);
      expect(t.expenses).toBeCloseTo(r.expenses, 6);
      expect(t.establishment).toBeCloseTo(r.establishment, 6);
      expect(t.carry).toBeCloseTo(r.carry, 6);
    }
  });

  it('hurdle/carry trajectories equal the scenario arrays', () => {
    for (let i = 0; i < sc.quarters.length; i++) {
      expect(sc.quarters[i].b).toBeCloseTo(fsc.hurdleBalance[i], 6);
      expect(sc.quarters[i].carryCum).toBeCloseTo(fsc.carryCum[i], 6);
      expect(sc.quarters[i].costBasis).toBeCloseTo(fsc.costBasis[i], 6);
    }
    expect(sc.qClearIndex).toBe(fsc.qClearIndex);
    expect(sc.thresholdN).toBeCloseTo(fsc.thresholdN, 6);
  });
});

describe('fee trace — step arithmetic is reproducible', () => {
  it('mgmt fee = basis stock × (rate ÷ 4) every quarter', () => {
    for (const t of sc.quarters) {
      expect(t.mgmtFee).toBeCloseTo(t.mgmtStock * (t.mgmtRate / 4), 6);
      expect(t.expenses).toBeCloseTo(t.expenseStock * (t.expenseRate / 4), 6);
    }
  });

  it('outstanding balance recurrence B(q) = max(0, owedBeforeDist − d)', () => {
    for (const t of sc.quarters) {
      expect(t.owedBeforeDist).toBeCloseTo(t.bPrev * (1 + sc.quarterlyHurdleRate) + t.pNet, 4);
      expect(t.b).toBeCloseTo(Math.max(0, t.owedBeforeDist - t.dNet), 4);
    }
  });

  it('quarterly hurdle rate compounds to the 8% annual hurdle', () => {
    expect(Math.pow(1 + sc.quarterlyHurdleRate, 4) - 1).toBeCloseTo(0.08, 9);
  });

  it('IP boundary: 5y IP from a 2024-02-15 start → last IP quarter index 19 (Q20)', () => {
    expect(sc.qIPEndIndex).toBe(19);
    expect(sc.quarters[19].inIP).toBe(true);
    expect(sc.quarters[20].inIP).toBe(false);
  });

  it('establishment is a one-shot at inception: 150,000 at index 0, else 0', () => {
    expect(sc.quarters[0].establishment).toBeCloseTo(150_000, 6);
    for (let i = 1; i < sc.quarters.length; i++) expect(sc.quarters[i].establishment).toBe(0);
  });
});

describe('fee trace — carry waterfall + identity (§16)', () => {
  it('carry turns on at the durable hurdle-clear, zero before', () => {
    expect(sc.qClearIndex).toBe(27);
    for (let i = 0; i < 27; i++) {
      expect(sc.quarters[i].aboveHurdle).toBe(false);
      expect(sc.quarters[i].carry).toBeCloseTo(0, 6);
    }
    expect(sc.quarters[27].aboveHurdle).toBe(true);
    expect(sc.quarters[27].carry).toBeCloseTo(2_250_000, 0);
  });

  it('terminal carry_cum = 9,000,000 and the I5 identity Σ carry = carry·(G − P) holds', () => {
    expect(sc.carryCumTerminal).toBeCloseTo(9_000_000, 0);
    const sumCarry = sc.quarters.reduce((a, t) => a + t.carry, 0);
    expect(sumCarry).toBeCloseTo(sc.carryRate * (sc.gcumTerminal - sc.pTerminal), 0);
    expect(sc.carryRate).toBeCloseTo(0.2, 9);
  });
});
