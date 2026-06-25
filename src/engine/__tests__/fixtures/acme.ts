// §16 reference example inputs (Acme VII / Nordic FoF), as plain fixtures.
// Internal Date-based shapes for module-level tests, plus ISO-string variants
// for the public-API e2e tests.

import { parseISO } from '../../util/daycount';
import type {
  FundInput,
  TemplateInput,
  Sliders,
  FeeParams,
  PortfolioInput,
  OverlayParams,
} from '../../types';

// Template (annual, 10y).
export const acmeTemplate: TemplateInput = {
  granularity: 'annual',
  scenarios: [
    {
      id: 'base',
      isBase: true,
      pic: {
        points: [
          { period: 1, value: 0.2 },
          { period: 2, value: 0.5 },
          { period: 3, value: 0.75 },
          { period: 4, value: 0.95 },
          { period: 5, value: 1.0 },
          // flat after (implicit) to year 10
        ],
      },
      dpi: {
        points: [
          { period: 1, value: 0.0 },
          { period: 2, value: 0.0 },
          { period: 3, value: 0.05 },
          { period: 4, value: 0.2 },
          { period: 5, value: 0.45 },
          { period: 6, value: 0.85 },
          { period: 7, value: 1.3 },
          { period: 8, value: 1.75 },
          { period: 9, value: 2.05 },
          { period: 10, value: 2.2 },
        ],
      },
      tvpi: {
        points: [
          { period: 1, value: 0.9 },
          { period: 2, value: 1.05 },
          { period: 3, value: 1.3 },
          { period: 4, value: 1.6 },
          { period: 5, value: 1.9 },
          { period: 6, value: 2.1 },
          { period: 7, value: 2.2 },
          { period: 8, value: 2.25 },
          { period: 9, value: 2.22 },
          { period: 10, value: 2.2 },
        ],
      },
    },
  ],
};

export const neutralSliders: Sliders = {
  dpiMultiplier: 1.0,
  dpiTiming: 0.0,
  concentration: 1.0,
};

export const acmeFees: FeeParams = {
  mgmtRateIP: 0.02,
  mgmtRatePostIP: 0.015,
  mgmtBasisIP: 'commitment',
  mgmtBasisPostIP: 'cost_basis',
  expenseRateIP: 0.0025,
  expenseRatePostIP: 0.0025,
  expenseBasisIP: 'commitment',
  expenseBasisPostIP: 'cost_basis',
  establishmentRate: 0.005,
  carryRate: 0.2,
  hurdleAnnual: 0.08,
  catchUp: true,
};

export function makeAcmeFund(overrides?: Partial<FundInput>): FundInput {
  return {
    id: 'acme-vii',
    name: 'Acme VII',
    commitment: 30_000_000,
    currency: 'EUR',
    effectiveDate: parseISO('2024-02-15'),
    investmentPeriodEnd: parseISO('2029-02-15'),
    standardLiquidationDate: parseISO('2034-02-15'),
    template: acmeTemplate,
    sliders: neutralSliders,
    fees: acmeFees,
    status: 'ACTIVE',
    ...overrides,
  };
}

export const overlayDisabled: OverlayParams = {
  enabled: false,
  mgmtRateIP: 0,
  mgmtRatePostIP: 0,
  mgmtBasisIP: 'commitment',
  mgmtBasisPostIP: 'commitment',
  expenseRateIP: 0,
  expenseRatePostIP: 0,
  expenseBasisIP: 'commitment',
  expenseBasisPostIP: 'commitment',
  establishmentRate: 0,
  carryRate: 0,
  hurdleAnnual: 0,
  catchUp: false,
  txnCostPerInvestment: 0,
  feeBasisFxPolicy: 'spot',
};

export const overlayEnabled: OverlayParams = {
  enabled: true,
  mgmtRateIP: 0.0075,
  mgmtRatePostIP: 0.005,
  mgmtBasisIP: 'commitment',
  mgmtBasisPostIP: 'commitment',
  expenseRateIP: 0.001,
  expenseRatePostIP: 0.001,
  expenseBasisIP: 'commitment',
  expenseBasisPostIP: 'commitment',
  establishmentRate: 0.002,
  carryRate: 0.05,
  hurdleAnnual: 0.08,
  catchUp: false,
  txnCostPerInvestment: 0,
  feeBasisFxPolicy: 'spot',
};

export function makeNordicPortfolio(
  fund: FundInput,
  overlay: OverlayParams = overlayDisabled,
): PortfolioInput {
  return {
    id: 'nordic-fof',
    name: 'Nordic FoF',
    currency: 'USD',
    // §16 does not state the FoF's own committed size for the overlay example.
    // This value (USD) is the Portfolio.size that reproduces the spec's
    // published overlay 6-stage IRRs [27.09, 23.19, 20.41, 19.31, 19.08, 18.61]
    // exactly (the overlay fee basis = Portfolio.size per §12). Documented as a
    // SPEC-DERIVED constant — see portfolio.test.ts overlay assertions.
    size: 9_213_036,
    effectiveDate: parseISO('2024-02-15'),
    investmentPeriodEnd: parseISO('2029-02-15'),
    funds: [{ fund, allocatedCommitment: 10_000_000 }],
    fx: { rates: { 'EUR->USD': 1.08 } },
    overlay,
    isFoF: true,
  };
}
