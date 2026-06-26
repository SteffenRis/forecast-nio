// §10 Net-to-gross fee bridge.
// mgmt fee (basis stock + fund-life pro-rata pr(q)), expenses, establishment
// (one-shot on commitment), gross assembly, itemized §10.10 rows.

import type {
  CalendarQuarter,
  Money,
  Ratio,
  FeeBasis,
  FeeParams,
} from './types';
import {
  days30360,
  calQuarterStart,
  calQuarterEnd,
  calQuarterOrdinal,
  quarterOf,
  BLOCK_DAYS,
} from './util/daycount';

export interface FeeBridgeInput {
  quarters: CalendarQuarter[];
  /** cumulative paid-in P(q). */
  P: Money[];
  /** NAV(q). */
  NAV: Money[];
  /** cost_basis(q) (§10.3). */
  costBasis: Money[];
  commitment: Money;
  effectiveDate: Date;
  investmentPeriodEnd: Date;
  /** eff_liq = expectedLiquidationDate ?? standardLiquidationDate. */
  effLiq: Date;
  fees: FeeParams;
}

export interface FeeBridgeResult {
  mgmtFee: Money[];
  expenses: Money[];
  establishment: Money[];
  /** pr(q) fund-life pro-rata. */
  pr: Ratio[];
}

/**
 * The inception-bridge result, plus the per-quarter intermediates the calculation
 * passes through. These are surfaced (additively) so an auditability/trace view can
 * show every step — the basis chosen, the stock it was applied to, the rate — without
 * the UI re-deriving any math. The plain `FeeBridgeResult` (calendar variant) is
 * unchanged.
 */
export interface FeeBridgeInceptionResult extends FeeBridgeResult {
  /** Per-quarter: is the quarter inside the investment period (IP rate) or post-IP? */
  inIP: boolean[];
  mgmtBasis: FeeBasis[];
  mgmtRate: Ratio[];
  /** The basis "stock" the management rate was applied to (the fee denominator). */
  mgmtStock: Money[];
  expenseBasis: FeeBasis[];
  expenseRate: Ratio[];
  expenseStock: Money[];
  /** 0-based index of the last inception quarter that still gets the IP rate. */
  qIPEndIndex: number;
}

/**
 * §10.1 Fund-life pro-rata:
 *   pr(q) = days_30_360(max(eff, qtr_start), min(eff_liq, qtr_end)) / 90
 */
export function fundLifeProRata(
  q: CalendarQuarter,
  effectiveDate: Date,
  effLiq: Date,
): Ratio {
  const qs = calQuarterStart(q);
  const qe = calQuarterEnd(q);
  const lo = qs.getTime() > effectiveDate.getTime() ? qs : effectiveDate;
  const hi = qe.getTime() < effLiq.getTime() ? qe : effLiq;
  return Math.max(0, days30360(lo, hi)) / BLOCK_DAYS;
}

/** §10.2 feeBasisStock. */
export function feeBasisStock(
  basis: FeeBasis,
  commitment: Money,
  costBasisQ: Money,
  navQ: Money,
  paidInQ: Money,
  prQ: Ratio,
): Money {
  switch (basis) {
    case 'commitment':
      return commitment * prQ;
    case 'cost_basis':
      return costBasisQ * prQ;
    case 'nav':
      return navQ; // tracks fund-life in its own value; no pr
    case 'paid_in':
      return paidInQ; // monotonic; no pr
  }
}

// ---------------------------------------------------------------------------
// Inception-quarter fee bridge (the timeline the fund engine uses).
// pr(q) = 1 for every inception quarter (each block is wholly within fund life).
// IP boundary: inception quarter index q_IP_end = the inception quarter whose
// block CONTAINS investmentPeriodEnd (inclusive — that quarter gets the IP rate).
// ---------------------------------------------------------------------------

export interface FeeBridgeInceptionInput {
  nInc: number;
  P: Money[];
  NAV: Money[];
  costBasis: Money[];
  commitment: Money;
  effectiveDate: Date;
  investmentPeriodEnd: Date;
  effLiq: Date;
  fees: FeeParams;
}

/**
 * Inception quarter (1-indexed) for the IP-end boundary. §10.1: the quarter
 * "containing" the period end, INCLUSIVE — that quarter still gets the IP rate.
 * Block i END = eff + 3i months. When the boundary date falls exactly on a
 * block end (e.g. a clean 5-year IP), that quarter (i) is the last IP quarter.
 * Implementation: months/3 → if the date is exactly on a block boundary
 * (months divisible by 3), q_IP_end = months/3; otherwise the quarter whose
 * block contains the date = floor(months/3)+1.
 */
function inceptionQuarterOf(effectiveDate: Date, d: Date): number {
  const ms = days30360(effectiveDate, d); // 30/360 days
  const months = ms / 30;
  const exactBoundary = Math.abs(months % 3) < 1e-9;
  let i = exactBoundary ? months / 3 : Math.floor(months / 3) + 1;
  if (i < 1) i = 1;
  return i;
}

export function computeFeeBridgeInception(
  input: FeeBridgeInceptionInput,
): FeeBridgeInceptionResult {
  const {
    nInc,
    P,
    NAV,
    costBasis,
    commitment: C,
    effectiveDate,
    investmentPeriodEnd,
    fees,
  } = input;

  // q_IP_end (inclusive). The inception quarter containing investmentPeriodEnd.
  const qIPEnd = inceptionQuarterOf(effectiveDate, investmentPeriodEnd);

  const mgmtFee: Money[] = new Array(nInc).fill(0);
  const expenses: Money[] = new Array(nInc).fill(0);
  const establishment: Money[] = new Array(nInc).fill(0);
  const pr: Ratio[] = new Array(nInc).fill(1); // every inception quarter is full
  // Intermediates (additive — see FeeBridgeInceptionResult).
  const inIPArr: boolean[] = new Array(nInc).fill(false);
  const mgmtBasisArr: FeeBasis[] = new Array(nInc).fill('commitment');
  const mgmtRateArr: Ratio[] = new Array(nInc).fill(0);
  const mgmtStockArr: Money[] = new Array(nInc).fill(0);
  const expenseBasisArr: FeeBasis[] = new Array(nInc).fill('commitment');
  const expenseRateArr: Ratio[] = new Array(nInc).fill(0);
  const expenseStockArr: Money[] = new Array(nInc).fill(0);

  for (let idx = 0; idx < nInc; idx++) {
    const i = idx + 1; // 1-indexed inception quarter
    const inIP = i <= qIPEnd;
    const mgmtBasis = inIP ? fees.mgmtBasisIP : fees.mgmtBasisPostIP;
    const mgmtRate = inIP ? fees.mgmtRateIP : fees.mgmtRatePostIP;
    const expBasis = inIP ? fees.expenseBasisIP : fees.expenseBasisPostIP;
    const expRate = inIP ? fees.expenseRateIP : fees.expenseRatePostIP;

    const mgmtStock = feeBasisStock(mgmtBasis, C, costBasis[idx], NAV[idx], P[idx], 1);
    const expStock = feeBasisStock(expBasis, C, costBasis[idx], NAV[idx], P[idx], 1);

    mgmtFee[idx] = mgmtStock * (mgmtRate / 4);
    expenses[idx] = expStock * (expRate / 4);

    // Establishment one-shot at inception quarter 1 (= effective-date quarter).
    if (i === 1) {
      establishment[idx] = C * fees.establishmentRate;
    }

    inIPArr[idx] = inIP;
    mgmtBasisArr[idx] = mgmtBasis;
    mgmtRateArr[idx] = mgmtRate;
    mgmtStockArr[idx] = mgmtStock;
    expenseBasisArr[idx] = expBasis;
    expenseRateArr[idx] = expRate;
    expenseStockArr[idx] = expStock;
  }

  return {
    mgmtFee,
    expenses,
    establishment,
    pr,
    inIP: inIPArr,
    mgmtBasis: mgmtBasisArr,
    mgmtRate: mgmtRateArr,
    mgmtStock: mgmtStockArr,
    expenseBasis: expenseBasisArr,
    expenseRate: expenseRateArr,
    expenseStock: expenseStockArr,
    qIPEndIndex: Math.max(0, qIPEnd - 1),
  };
}

export function computeFeeBridge(input: FeeBridgeInput): FeeBridgeResult {
  const {
    quarters,
    P,
    NAV,
    costBasis,
    commitment: C,
    effectiveDate,
    investmentPeriodEnd,
    effLiq,
    fees,
  } = input;
  const n = quarters.length;

  const qIPEnd = calQuarterOrdinal(quarterOf(investmentPeriodEnd));
  const qEff = quarterOf(effectiveDate);
  const qEffOrd = calQuarterOrdinal(qEff);

  const mgmtFee: Money[] = new Array(n).fill(0);
  const expenses: Money[] = new Array(n).fill(0);
  const establishment: Money[] = new Array(n).fill(0);
  const pr: Ratio[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const q = quarters[i];
    const ord = calQuarterOrdinal(q);
    const prQ = fundLifeProRata(q, effectiveDate, effLiq);
    pr[i] = prQ;

    const inIP = ord <= qIPEnd;
    const mgmtBasis = inIP ? fees.mgmtBasisIP : fees.mgmtBasisPostIP;
    const mgmtRate = inIP ? fees.mgmtRateIP : fees.mgmtRatePostIP;
    const expBasis = inIP ? fees.expenseBasisIP : fees.expenseBasisPostIP;
    const expRate = inIP ? fees.expenseRateIP : fees.expenseRatePostIP;

    const mgmtStock = feeBasisStock(mgmtBasis, C, costBasis[i], NAV[i], P[i], prQ);
    const expStock = feeBasisStock(expBasis, C, costBasis[i], NAV[i], P[i], prQ);

    mgmtFee[i] = mgmtStock * (mgmtRate / 4);
    expenses[i] = expStock * (expRate / 4);

    // §10.6 establishment: one-shot at the effective-date quarter, on commitment.
    if (ord === qEffOrd) {
      establishment[i] = C * fees.establishmentRate;
    }
  }

  return { mgmtFee, expenses, establishment, pr };
}
