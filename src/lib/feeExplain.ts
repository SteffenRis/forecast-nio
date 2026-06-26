// Turns a clicked fee/carry number into a step-by-step explanation the drawer renders.
// Pure: takes the engine's fee trace (the authoritative intermediates) + a CellRef
// (which number was clicked) and returns a headline, formula, ordered steps (some of
// which drill into a child number), and trust-checks. No engine/React/store imports —
// only the trace TYPE plus the shared formatters — so it stays trivially unit-testable.

import type { FeeTraceQuarter, FundFeeTraceScenario } from '@/engine'
import type {
  Explanation as GenericExplanation,
  ExplainStep as GenericStep,
  ExplainCheck,
} from './explain'
import { formatMoney } from './format'
import { feeBasisLabel } from './feeBasis'
import { quarterLabel } from './quarter'

/** A fee figure on a year/quarter row. */
export type FeeMetric = 'mgmtFee' | 'expenses' | 'establishment' | 'carry' | 'total'
/** A figure on a summary card (lifetime). */
export type LifetimeMetric =
  | 'mgmtFee'
  | 'expenses'
  | 'establishment'
  | 'carry'
  | 'fundCosts'
  | 'totalToLp'

/** Identifies which number was clicked, so the drawer can trace exactly it. */
export type CellRef =
  | { kind: 'quarter'; metric: FeeMetric; year: number; q: number }
  | { kind: 'year'; metric: FeeMetric; year: number }
  | { kind: 'lifetime'; metric: LifetimeMetric }

/** This screen's explanation/step types, specialised to its CellRef. */
export type Explanation = GenericExplanation<CellRef>
export type ExplainStep = GenericStep<CellRef>
export type { ExplainCheck }

const METRIC_LABEL: Record<FeeMetric, string> = {
  mgmtFee: 'Management fee',
  expenses: 'Fund expenses',
  establishment: 'Establishment',
  carry: 'Carried interest',
  total: 'Total fees & carry',
}

const LIFETIME_LABEL: Record<LifetimeMetric, string> = {
  mgmtFee: 'Management fees',
  expenses: 'Fund expenses',
  establishment: 'Establishment',
  carry: 'Carried interest',
  fundCosts: 'Fund costs',
  totalToLp: 'Total cost to LP',
}

/** quarterLabel for the engine's CalendarQuarter (whose `q` is the wider `number`). */
function qlabel(q: { year: number; q: number }): string {
  return quarterLabel({ year: q.year, q: q.q as 1 | 2 | 3 | 4 })
}

/** Percent with up to 4 decimals, trailing zeros trimmed: 0.02 → "2%". */
function pct(frac: number): string {
  const s = (frac * 100).toFixed(4).replace(/\.?0+$/, '')
  return `${s}%`
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-6)
}

function qMetric(t: FeeTraceQuarter, m: FeeMetric): number {
  switch (m) {
    case 'mgmtFee':
      return t.mgmtFee
    case 'expenses':
      return t.expenses
    case 'establishment':
      return t.establishment
    case 'carry':
      return t.carry
    case 'total':
      return t.mgmtFee + t.expenses + t.establishment + t.carry
  }
}

function findQuarter(
  sc: FundFeeTraceScenario,
  year: number,
  q: number,
): FeeTraceQuarter | undefined {
  return sc.quarters.find((t) => t.quarter.year === year && t.quarter.q === q)
}

function uniqueYears(sc: FundFeeTraceScenario): number[] {
  const ys = new Set<number>()
  for (const t of sc.quarters) ys.add(t.quarter.year)
  return [...ys].sort((a, b) => a - b)
}

/** Build the full explanation for the clicked number. */
export function explainCell(
  sc: FundFeeTraceScenario,
  ref: CellRef,
  currency: string,
): Explanation {
  const money = (n: number) => formatMoney(n, currency)
  if (ref.kind === 'quarter') return explainQuarter(sc, ref, money, currency)
  if (ref.kind === 'year') return explainYear(sc, ref, money)
  return explainLifetime(sc, ref, money)
}

// ---- quarter ---------------------------------------------------------------

function explainQuarter(
  sc: FundFeeTraceScenario,
  ref: Extract<CellRef, { kind: 'quarter' }>,
  money: (n: number) => string,
  currency: string,
): Explanation {
  const t = findQuarter(sc, ref.year, ref.q)
  const ql = quarterLabel({ year: ref.year, q: ref.q as 1 | 2 | 3 | 4 })
  if (!t) {
    return { title: `${METRIC_LABEL[ref.metric]} — ${ql}`, value: money(0), steps: [], checks: [] }
  }

  if (ref.metric === 'total') {
    const parts: FeeMetric[] = ['mgmtFee', 'expenses', 'establishment', 'carry']
    const total = qMetric(t, 'total')
    const steps: ExplainStep[] = parts.map((m) => ({
      label: METRIC_LABEL[m],
      value: money(qMetric(t, m)),
      ref: { kind: 'quarter', metric: m, year: ref.year, q: ref.q },
    }))
    steps.push({ label: 'Total this quarter', value: money(total), emphasis: true })
    return {
      title: `Total fees & carry — ${ql}`,
      value: money(total),
      formula: 'total = management fee + expenses + establishment + carry',
      steps,
      checks: [
        {
          label: 'Components sum to the total',
          pass: near(t.mgmtFee + t.expenses + t.establishment + t.carry, total),
          detail: 'The four line items add up to the row total.',
        },
      ],
    }
  }

  if (ref.metric === 'mgmtFee' || ref.metric === 'expenses') {
    const isMgmt = ref.metric === 'mgmtFee'
    const basis = isMgmt ? t.mgmtBasis : t.expenseBasis
    const rate = isMgmt ? t.mgmtRate : t.expenseRate
    const stock = isMgmt ? t.mgmtStock : t.expenseStock
    const fee = isMgmt ? t.mgmtFee : t.expenses
    const configured = isMgmt
      ? t.inIP
        ? sc.mgmtRateIP
        : sc.mgmtRatePostIP
      : t.inIP
        ? sc.expenseRateIP
        : sc.expenseRatePostIP
    // Where the basis "stock" comes from this quarter.
    const source =
      basis === 'commitment'
        ? `Commitment ${money(sc.commitment)}`
        : basis === 'cost_basis'
          ? `Cost basis this quarter ${money(t.costBasis)}`
          : basis === 'nav'
            ? `NAV this quarter ${money(t.nav)}`
            : `Paid-in to date ${money(t.paidIn)}`
    return {
      title: `${isMgmt ? 'Management fee' : 'Fund expenses'} — ${ql}`,
      value: money(fee),
      subtitle: `${currency} · ${t.inIP ? 'Investment period' : 'Post-investment period'}`,
      formula: `${isMgmt ? 'fee' : 'expense'} = basis × (annual rate ÷ 4)`,
      steps: [
        {
          label: 'Period',
          value: t.inIP ? 'Investment period' : 'Post-investment period',
          note: t.inIP ? 'Higher IP rate applies' : 'Reduced post-IP rate applies',
        },
        { label: 'Fee basis', value: feeBasisLabel(basis), note: source },
        { label: 'Basis amount', value: money(stock) },
        { label: 'Annual rate', value: pct(rate) },
        { label: 'Quarterly fraction', value: `${pct(rate)} ÷ 4 = ${pct(rate / 4)}` },
        { label: `${isMgmt ? 'Management fee' : 'Expenses'} this quarter`, value: money(fee), emphasis: true },
      ],
      checks: [
        {
          label: 'Rate matches the configured terms',
          pass: near(rate, configured),
          detail: `${t.inIP ? 'IP' : 'Post-IP'} rate ${pct(configured)} from the fund's terms.`,
        },
        {
          label: 'Fee = basis × (rate ÷ 4)',
          pass: near(fee, stock * (rate / 4)),
          detail: `${money(stock)} × ${pct(rate / 4)} = ${money(stock * (rate / 4))}.`,
        },
      ],
    }
  }

  if (ref.metric === 'establishment') {
    const est = t.establishment
    const isInception = t.index === 0
    return {
      title: `Establishment fee — ${ql}`,
      value: money(est),
      formula: 'establishment = commitment × rate (one-time, at inception)',
      steps: [
        { label: 'Commitment', value: money(sc.commitment) },
        { label: 'Establishment rate', value: pct(sc.establishmentRate) },
        { label: 'Inception quarter?', value: isInception ? 'Yes — first quarter' : 'No' },
        { label: 'Establishment fee', value: money(est), emphasis: true },
      ],
      checks: [
        {
          label: 'Charged once, at inception',
          pass: isInception === est > 0,
          detail: isInception
            ? 'This is the first quarter, so the one-time fee lands here.'
            : 'Not the inception quarter, so €0.',
        },
        {
          label: 'Equals commitment × rate',
          pass: near(est, isInception ? sc.commitment * sc.establishmentRate : 0),
          detail: isInception
            ? `${money(sc.commitment)} × ${pct(sc.establishmentRate)} = ${money(sc.commitment * sc.establishmentRate)}.`
            : 'Zero outside the inception quarter.',
        },
      ],
    }
  }

  // carry — the waterfall.
  return explainCarry(sc, t, ql, money)
}

function explainCarry(
  sc: FundFeeTraceScenario,
  t: FeeTraceQuarter,
  ql: string,
  money: (n: number) => string,
): Explanation {
  const rq = sc.quarterlyHurdleRate
  const owedRaw = t.owedBeforeDist - t.dNet // pre-floor balance
  const steps: ExplainStep[] = [
    { label: 'Outstanding balance B(q−1)', value: money(t.bPrev) },
    { label: `Hurdle accrual (${pct(rq)} this quarter)`, value: `+ ${money(t.bPrev * rq)}` },
    { label: 'Paid-in this quarter p(q)', value: `+ ${money(t.pNet)}` },
    { label: 'Distributions this quarter d(q)', value: `− ${money(t.dNet)}` },
    {
      label: 'Outstanding balance B(q)',
      value: money(t.b),
      emphasis: true,
      note:
        owedRaw < -1
          ? 'Floored at €0 — distributions cleared the balance'
          : t.b > 1
            ? 'Still owed to the LP → hurdle not cleared'
            : 'Cleared',
    },
  ]

  const checks: ExplainCheck[] = [
    {
      label: 'GP carry share',
      pass: sc.carryRate > 0,
      detail: `${pct(sc.carryRate)} of profit above the hurdle.`,
    },
  ]

  if (!t.aboveHurdle) {
    steps.push({ label: 'Carried interest this quarter', value: money(0), emphasis: true })
    checks.unshift({
      label: 'Above the hurdle?',
      pass: false,
      detail: `Outstanding balance ${money(t.b)} > €0 — no carry yet.`,
    })
    return {
      title: `Carried interest — ${ql}`,
      value: money(0),
      formula: 'B(q) = max(0, B(q−1)·(1+rq) + p(q) − d(q));  carry = 0 until B clears',
      steps,
      checks,
    }
  }

  // Above the hurdle: the carry_cum formula (catch-up vs hurdle-adjusted).
  const base = sc.catchUp ? t.paidIn : sc.thresholdN
  const baseLabel = sc.catchUp ? 'Cumulative paid-in P(q)' : 'Hurdle threshold N*'
  const profit = t.distributionsCum - base
  const factor = sc.carryRate / (1 - sc.carryRate)
  const clearQ =
    sc.qClearIndex >= 0 && sc.qClearIndex < sc.quarters.length
      ? sc.quarters[sc.qClearIndex].quarter
      : undefined
  steps.push(
    { label: 'Cumulative distributions D(q)', value: money(t.distributionsCum) },
    { label: `Less ${baseLabel}`, value: `− ${money(base)}` },
    { label: 'Profit above the hurdle', value: money(profit) },
    {
      label: `× carry ÷ (1 − carry) = ${pct(sc.carryRate)} ÷ ${pct(1 - sc.carryRate)}`,
      value: `× ${factor.toFixed(4)}`,
    },
    { label: 'Carried interest to date (cumulative)', value: money(t.carryCum) },
    { label: 'Less carry recognised before this quarter', value: `− ${money(t.carryCum - t.carry)}` },
    { label: 'Carried interest this quarter', value: money(t.carry), emphasis: true },
  )
  checks.unshift({
    label: 'Above the hurdle?',
    pass: true,
    detail: clearQ
      ? `Hurdle cleared at ${qlabel(clearQ)} — balance is €0 from there.`
      : 'Balance has cleared.',
  })
  checks.push({
    label: 'carry_cum = carry ÷ (1 − carry) × profit',
    pass: near(t.carryCum, Math.max(0, sc.carryRate * profit) / (1 - sc.carryRate)),
    detail: `${pct(sc.carryRate)} ÷ ${pct(1 - sc.carryRate)} × ${money(profit)} = ${money(
      (sc.carryRate * profit) / (1 - sc.carryRate),
    )}.`,
  })
  return {
    title: `Carried interest — ${ql}`,
    value: money(t.carry),
    formula: sc.catchUp
      ? 'carry_cum = carry% × (D − P) ÷ (1 − carry%)'
      : 'carry_cum = carry% × (D − N*) ÷ (1 − carry%)',
    steps,
    checks,
  }
}

// ---- year ------------------------------------------------------------------

function explainYear(
  sc: FundFeeTraceScenario,
  ref: Extract<CellRef, { kind: 'year' }>,
  money: (n: number) => string,
): Explanation {
  const qtrs = sc.quarters
    .filter((t) => t.quarter.year === ref.year)
    .sort((a, b) => a.quarter.q - b.quarter.q)
  const total = qtrs.reduce((a, t) => a + qMetric(t, ref.metric), 0)
  const steps: ExplainStep[] = qtrs.map((t) => ({
    label: qlabel(t.quarter),
    value: money(qMetric(t, ref.metric)),
    ref: { kind: 'quarter', metric: ref.metric, year: ref.year, q: t.quarter.q },
  }))
  steps.push({ label: `${ref.year} total`, value: money(total), emphasis: true })
  return {
    title: `${METRIC_LABEL[ref.metric]} — ${ref.year}`,
    value: money(total),
    subtitle: 'Click a quarter to trace its calculation',
    formula: `${ref.year} = ${qtrs.map((t) => `Q${t.quarter.q}`).join(' + ')}`,
    steps,
    checks: [
      {
        label: 'Quarters sum to the year',
        pass: near(
          qtrs.reduce((a, t) => a + qMetric(t, ref.metric), 0),
          total,
        ),
        detail: `${qtrs.length} quarters → ${money(total)}.`,
      },
    ],
  }
}

// ---- lifetime --------------------------------------------------------------

function lifeSum(sc: FundFeeTraceScenario, m: 'mgmtFee' | 'expenses' | 'establishment' | 'carry'): number {
  return sc.quarters.reduce((a, t) => a + t[m], 0)
}

function explainLifetime(
  sc: FundFeeTraceScenario,
  ref: Extract<CellRef, { kind: 'lifetime' }>,
  money: (n: number) => string,
): Explanation {
  const m = ref.metric

  if (m === 'fundCosts' || m === 'totalToLp') {
    const mgmt = lifeSum(sc, 'mgmtFee')
    const exp = lifeSum(sc, 'expenses')
    const est = lifeSum(sc, 'establishment')
    const carry = lifeSum(sc, 'carry')
    const fundCosts = mgmt + exp + est
    const total = fundCosts + carry
    if (m === 'fundCosts') {
      return {
        title: 'Fund costs (lifetime)',
        value: money(fundCosts),
        subtitle: 'Management fee + expenses + establishment (excludes carry)',
        formula: 'fund costs = management fees + expenses + establishment',
        steps: [
          { label: 'Management fees', value: money(mgmt), ref: { kind: 'lifetime', metric: 'mgmtFee' } },
          { label: 'Fund expenses', value: money(exp), ref: { kind: 'lifetime', metric: 'expenses' } },
          { label: 'Establishment', value: money(est), ref: { kind: 'lifetime', metric: 'establishment' } },
          { label: 'Fund costs', value: money(fundCosts), emphasis: true },
        ],
        checks: [
          {
            label: 'Fee load',
            pass: sc.commitment > 0,
            detail:
              sc.commitment > 0
                ? `${pct(fundCosts / sc.commitment)} of the ${money(sc.commitment)} commitment.`
                : 'Set a commitment to see the fee load.',
          },
        ],
      }
    }
    return {
      title: 'Total cost to LP (lifetime)',
      value: money(total),
      subtitle: 'Fund costs + carried interest',
      formula: 'total cost = fund costs + carried interest',
      steps: [
        { label: 'Fund costs', value: money(fundCosts), ref: { kind: 'lifetime', metric: 'fundCosts' } },
        { label: 'Carried interest', value: money(carry), ref: { kind: 'lifetime', metric: 'carry' } },
        { label: 'Total cost to LP', value: money(total), emphasis: true },
      ],
      checks: [
        {
          label: 'Fee load (ex-carry)',
          pass: sc.commitment > 0,
          detail:
            sc.commitment > 0
              ? `Fund costs are ${pct(fundCosts / sc.commitment)} of the ${money(sc.commitment)} commitment.`
              : 'Set a commitment to see the fee load.',
        },
      ],
    }
  }

  // mgmtFee / expenses / establishment / carry — sum of yearly subtotals.
  const years = uniqueYears(sc)
  const total = lifeSum(sc, m)
  const steps: ExplainStep[] = years.map((y) => {
    const sub = sc.quarters
      .filter((t) => t.quarter.year === y)
      .reduce((a, t) => a + t[m], 0)
    return { label: String(y), value: money(sub), ref: { kind: 'year', metric: m, year: y } }
  })
  steps.push({ label: 'Lifetime total', value: money(total), emphasis: true })

  const checks: ExplainCheck[] = [
    {
      label: 'Years sum to the lifetime total',
      pass: near(
        years.reduce(
          (a, y) => a + sc.quarters.filter((t) => t.quarter.year === y).reduce((s, t) => s + t[m], 0),
          0,
        ),
        total,
      ),
      detail: `${years.length} years → ${money(total)}.`,
    },
  ]
  if (m === 'carry') {
    // §16 invariant I5/I6: Σ carry = carry% × (gross profit above the hurdle).
    const identity = sc.carryRate * (sc.gcumTerminal - sc.pTerminal)
    checks.push({
      label: 'Σ carry = carry% × (gross profit above hurdle)',
      pass: near(total, identity),
      detail: `${pct(sc.carryRate)} × (${money(sc.gcumTerminal)} − ${money(sc.pTerminal)}) = ${money(identity)}.`,
    })
  }

  return {
    title: `${LIFETIME_LABEL[m]} (lifetime)`,
    value: money(total),
    subtitle: 'Click a year to break it into quarters',
    formula: `lifetime = ${years.map(String).join(' + ')}`,
    steps,
    checks,
  }
}
