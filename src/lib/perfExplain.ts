// Turns a clicked plan-vs-actual number into a step-by-step explanation the drawer
// renders. Pure: takes the QuarterComparison[] the grid already shows + a PerfCellRef
// (which cell was clicked) and returns an Explanation with traceable steps (some
// drilling into a child number) and trust-checks. No engine/React/store imports —
// only types + the shared formatters — so it stays trivially unit-testable.

import type { Explanation, ExplainCheck, ExplainStep } from './explain'
import {
  quarterDeviation,
  type QuarterAmounts,
  type QuarterComparison,
} from './comparison'
import { formatMoney } from './format'
import { formatMultiple } from './metrics'
import { quarterLabel } from './quarter'

export type PerfRowKind = 'plan' | 'actual' | 'deviation'
export type PerfAmountCol = 'contributed' | 'distributed' | 'recallable' | 'nav'
export type PerfMultipleCol = 'pic' | 'dpi' | 'rvpi' | 'tvpi'
export type PerfColumn = PerfAmountCol | PerfMultipleCol

/** Identifies which plan-vs-actual number was clicked. */
export interface PerfCellRef {
  year: number
  q: number
  row: PerfRowKind
  col: PerfColumn
}

const COL_LABEL: Record<PerfColumn, string> = {
  contributed: 'Contributed',
  distributed: 'Distributed',
  recallable: 'Recallable',
  nav: 'NAV',
  pic: 'PIC',
  dpi: 'DPI',
  rvpi: 'RVPI',
  tvpi: 'TVPI',
}
const ROW_LABEL: Record<PerfRowKind, string> = { plan: 'Plan', actual: 'Actual', deviation: 'Δ' }

const isMultiple = (c: PerfColumn): c is PerfMultipleCol =>
  c === 'pic' || c === 'dpi' || c === 'rvpi' || c === 'tvpi'

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
}

/** The cumulative amount for an amount column (recallable may be null). */
function amountOf(side: QuarterAmounts, col: PerfAmountCol): number | null {
  switch (col) {
    case 'contributed':
      return side.contributed
    case 'distributed':
      return side.distributed
    case 'nav':
      return side.nav
    case 'recallable':
      return side.recallable
  }
}

/** Value of any cell on one side (plan/actual): amount or multiple. */
function cellOf(side: QuarterAmounts, col: PerfColumn): number | null {
  return isMultiple(col) ? side.multiples[col] : amountOf(side, col)
}

const ql = (year: number, q: number) => quarterLabel({ year, q: q as 1 | 2 | 3 | 4 })

export function explainPerfCell(
  data: QuarterComparison[],
  ref: PerfCellRef,
  commitment: number,
  currency: string,
): Explanation<PerfCellRef> {
  const money = (n: number) => formatMoney(n, currency)
  const colL = COL_LABEL[ref.col]
  const idx = data.findIndex((c) => c.quarter.year === ref.year && c.quarter.q === ref.q)
  const entry = idx >= 0 ? data[idx] : undefined
  if (!entry) return { title: `${colL} — ${ql(ref.year, ref.q)}`, value: '—', steps: [], checks: [] }

  if (ref.row === 'deviation') return explainDeviation(entry, ref, money)

  const side = ref.row === 'plan' ? entry.forecast : entry.actual
  if (!side) {
    return {
      title: `${colL} — ${ROW_LABEL[ref.row]} · ${ql(ref.year, ref.q)}`,
      value: '—',
      steps: [],
      checks: [],
    }
  }

  if (isMultiple(ref.col)) return explainMultiple(side, ref, commitment, money)
  return explainAmount(data, idx, side, ref, commitment, money)
}

// ---- amount cells (recurrence: cumulative = previous + this quarter) --------

function explainAmount(
  data: QuarterComparison[],
  idx: number,
  side: QuarterAmounts,
  ref: PerfCellRef,
  commitment: number,
  money: (n: number) => string,
): Explanation<PerfCellRef> {
  const col = ref.col as PerfAmountCol
  const title = `${COL_LABEL[col]} — ${ROW_LABEL[ref.row]} · ${ql(ref.year, ref.q)}`
  const row = ref.row as 'plan' | 'actual'

  // Recallable is a reported figure (never on the plan), not a recurrence.
  if (col === 'recallable') {
    const v = side.recallable ?? 0
    return {
      title,
      value: money(v),
      subtitle: 'Reported on the Actuals screen',
      steps: [{ label: 'Reported recallable distributions', value: money(v), emphasis: true }],
      checks: [],
    }
  }

  const amount = amountOf(side, col) as number

  // Previous quarter that has this side — the recurrence's prior cumulative + drill.
  let prev: QuarterComparison | undefined
  for (let i = idx - 1; i >= 0; i--) {
    const s = row === 'plan' ? data[i].forecast : data[i].actual
    if (s) {
      prev = data[i]
      break
    }
  }
  const prevSide = prev ? (row === 'plan' ? prev.forecast : prev.actual) : undefined
  const prevVal = prevSide ? (amountOf(prevSide, col) as number) : 0
  const change = amount - prevVal

  const changeLabel =
    col === 'contributed'
      ? 'Capital called this quarter'
      : col === 'distributed'
        ? 'Distributions this quarter'
        : 'Change in NAV this quarter'

  const steps: ExplainStep<PerfCellRef>[] = []
  if (prev) {
    steps.push({
      label: `Cumulative at ${ql(prev.quarter.year, prev.quarter.q)}`,
      value: money(prevVal),
      ref: { year: prev.quarter.year, q: prev.quarter.q, row, col },
    })
  } else {
    steps.push({ label: 'Starting balance', value: money(0) })
  }
  steps.push({
    label: changeLabel,
    value: `${change >= 0 ? '+' : '−'} ${money(Math.abs(change))}`,
  })
  steps.push({ label: `Cumulative ${COL_LABEL[col]}`, value: money(amount), emphasis: true })

  const checks: ExplainCheck[] = []
  if (col === 'contributed' && commitment > 0) {
    checks.push({
      label: 'PIC = Contributed ÷ Commitment',
      pass: true,
      detail: `${money(amount)} ÷ ${money(commitment)} = ${(amount / commitment).toFixed(2)}×.`,
    })
  }

  return {
    title,
    value: money(amount),
    subtitle:
      row === 'plan'
        ? 'Plan — the underwriting curve (prefix-sum of quarterly forecast flows)'
        : 'Actual — reported on the Actuals screen (cumulative-to-date)',
    formula: 'cumulative = previous cumulative + this quarter’s change',
    steps,
    checks,
  }
}

// ---- multiple cells (the ratio with its inputs as drill links) -------------

function explainMultiple(
  side: QuarterAmounts,
  ref: PerfCellRef,
  commitment: number,
  money: (n: number) => string,
): Explanation<PerfCellRef> {
  const col = ref.col as PerfMultipleCol
  const m = side.multiples
  const v = m[col]
  const title = `${COL_LABEL[col]} — ${ROW_LABEL[ref.row]} · ${ql(ref.year, ref.q)}`
  const value = formatMultiple(v)
  const row = ref.row as 'plan' | 'actual'
  const amtRef = (c: PerfAmountCol): PerfCellRef => ({ year: ref.year, q: ref.q, row, col: c })

  if (v === null) {
    return {
      title,
      value,
      steps: [
        {
          label: 'No paid-in capital yet',
          note: 'Multiples are undefined until the fund has called capital.',
        },
      ],
      checks: [],
    }
  }

  if (col === 'pic') {
    return {
      title,
      value,
      formula: 'PIC = Contributed ÷ Commitment',
      steps: [
        { label: 'Contributed', value: money(side.contributed), ref: amtRef('contributed') },
        { label: 'Commitment', value: money(commitment) },
        { label: 'PIC', value, emphasis: true },
      ],
      checks: [
        {
          label: 'PIC = Contributed ÷ Commitment',
          pass: commitment > 0 && near(v, side.contributed / commitment),
          detail: `${money(side.contributed)} ÷ ${money(commitment)} = ${value}.`,
        },
      ],
    }
  }
  if (col === 'dpi') {
    return {
      title,
      value,
      formula: 'DPI = Distributed ÷ Contributed',
      steps: [
        { label: 'Distributed', value: money(side.distributed), ref: amtRef('distributed') },
        { label: 'Contributed', value: money(side.contributed), ref: amtRef('contributed') },
        { label: 'DPI', value, emphasis: true },
      ],
      checks: [
        {
          label: 'DPI = Distributed ÷ Contributed',
          pass: side.contributed > 0 && near(v, side.distributed / side.contributed),
          detail: `${money(side.distributed)} ÷ ${money(side.contributed)} = ${value}.`,
        },
      ],
    }
  }
  if (col === 'rvpi') {
    return {
      title,
      value,
      formula: 'RVPI = NAV ÷ Contributed',
      steps: [
        { label: 'NAV', value: money(side.nav), ref: amtRef('nav') },
        { label: 'Contributed', value: money(side.contributed), ref: amtRef('contributed') },
        { label: 'RVPI', value, emphasis: true },
      ],
      checks: [
        {
          label: 'RVPI = NAV ÷ Contributed',
          pass: side.contributed > 0 && near(v, side.nav / side.contributed),
          detail: `${money(side.nav)} ÷ ${money(side.contributed)} = ${value}.`,
        },
      ],
    }
  }
  // tvpi
  return {
    title,
    value,
    formula: 'TVPI = (Distributed + NAV) ÷ Contributed',
    steps: [
      { label: 'Distributed', value: money(side.distributed), ref: amtRef('distributed') },
      { label: 'NAV', value: money(side.nav), ref: amtRef('nav') },
      { label: 'Contributed', value: money(side.contributed), ref: amtRef('contributed') },
      { label: 'TVPI', value, emphasis: true },
    ],
    checks: [
      {
        label: 'TVPI = (Distributed + NAV) ÷ Contributed',
        pass: side.contributed > 0 && near(v, (side.distributed + side.nav) / side.contributed),
        detail: `(${money(side.distributed)} + ${money(side.nav)}) ÷ ${money(side.contributed)} = ${value}.`,
      },
      {
        label: 'TVPI = DPI + RVPI',
        pass: m.dpi !== null && m.rvpi !== null && near(v, m.dpi + m.rvpi),
        detail:
          m.dpi !== null && m.rvpi !== null
            ? `${m.dpi.toFixed(2)}× + ${m.rvpi.toFixed(2)}× = ${value}.`
            : 'A side is n.a.',
      },
    ],
  }
}

// ---- deviation cells (Actual − Plan) ---------------------------------------

function explainDeviation(
  entry: QuarterComparison,
  ref: PerfCellRef,
  money: (n: number) => string,
): Explanation<PerfCellRef> {
  const col = ref.col
  const mult = isMultiple(col)
  const dev = quarterDeviation(entry.actual, entry.forecast)
  const dval = col === 'recallable' ? null : (dev[col] as number | null)

  const aVal = entry.actual ? cellOf(entry.actual, col) : null
  const fVal = entry.forecast ? cellOf(entry.forecast, col) : null

  const fmt = (x: number | null) => (x === null ? 'n.a.' : mult ? formatMultiple(x) : money(x))
  const signed = (x: number | null) =>
    x === null ? 'n.a.' : `${x >= 0 ? '+' : '−'}${mult ? `${Math.abs(x).toFixed(2)}×` : money(Math.abs(x))}`

  const steps: ExplainStep<PerfCellRef>[] = [
    {
      label: 'Actual',
      value: fmt(aVal),
      ref: entry.actual ? { year: ref.year, q: ref.q, row: 'actual', col } : undefined,
    },
    {
      label: 'Plan',
      value: fmt(fVal),
      ref: entry.forecast ? { year: ref.year, q: ref.q, row: 'plan', col } : undefined,
    },
    { label: 'Deviation (Actual − Plan)', value: signed(dval), emphasis: true },
  ]

  return {
    title: `${COL_LABEL[col]} deviation — ${ql(ref.year, ref.q)}`,
    value: signed(dval),
    subtitle: 'Tracking against the underwriting plan',
    formula: 'Δ = Actual − Plan',
    steps,
    checks: [],
  }
}
