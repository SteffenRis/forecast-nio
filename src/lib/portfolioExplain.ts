// Turns a clicked AGGREGATE roll-up number into a per-underlying-fund breakdown: a table
// of Fund · LCY (local currency) · Portfolio currency that sums to the clicked number.
// Pure: takes the aggregate QuarterComparison[] + each fund's pro-rata contribution (in its
// own currency and in the reporting currency) and a PerfCellRef. Multiples (PIC/DPI/RVPI/
// TVPI) don't decompose additively, so they fall back to the standard ratio trace.

import type { Explanation, ExplainBreakdown } from './explain'
import type { QuarterAmounts, QuarterComparison } from './comparison'
import { formatMoney } from './format'
import {
  explainPerfCell,
  type PerfAmountCol,
  type PerfCellRef,
  type PerfColumn,
  type PerfRowKind,
} from './perfExplain'
import { quarterLabel } from './quarter'

/** One underlying fund's contribution, both in its own currency and the reporting currency. */
export interface FundDecomp {
  name: string
  currency: string
  /** Pro-rata contribution in the fund's local currency. */
  lcyData: QuarterComparison[]
  /** Pro-rata × FX contribution in the reporting currency. */
  data: QuarterComparison[]
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
  irr: 'IRR',
}
const ROW_LABEL: Record<PerfRowKind, string> = { plan: 'Plan', actual: 'Actual', deviation: 'Δ' }
const isMultiple = (c: PerfColumn): boolean =>
  c === 'pic' || c === 'dpi' || c === 'rvpi' || c === 'tvpi'
const ql = (year: number, q: number) => quarterLabel({ year, q: q as 1 | 2 | 3 | 4 })

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

/** The amount for one fund's series at (year, q, row, col); deviation = actual − plan. */
function valueAt(
  series: QuarterComparison[],
  year: number,
  q: number,
  row: PerfRowKind,
  col: PerfAmountCol,
): number | null {
  const entry = series.find((c) => c.quarter.year === year && c.quarter.q === q)
  if (!entry) return null
  if (row === 'deviation') {
    const a = entry.actual ? amountOf(entry.actual, col) : null
    const f = entry.forecast ? amountOf(entry.forecast, col) : null
    return a === null || f === null ? null : a - f
  }
  const side = row === 'plan' ? entry.forecast : entry.actual
  return side ? amountOf(side, col) : null
}

const signed = (n: number, fmt: (x: number) => string) =>
  `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`

export function explainPortfolioCell(
  aggregate: QuarterComparison[],
  ref: PerfCellRef,
  totalCommitment: number,
  reportingCurrency: string,
  funds: FundDecomp[],
): Explanation<PerfCellRef> {
  // Multiples are ratios and IRR is a money-weighted solve — neither sums across funds;
  // keep the standard (aggregate-level) trace rather than a per-fund decomposition.
  if (isMultiple(ref.col) || ref.col === 'irr') {
    return explainPerfCell(aggregate, ref, totalCommitment, reportingCurrency)
  }

  const col = ref.col as PerfAmountCol
  const isDev = ref.row === 'deviation'
  const title = `${COL_LABEL[col]} — ${ROW_LABEL[ref.row]} · ${ql(ref.year, ref.q)}`
  const rep = (n: number) => formatMoney(n, reportingCurrency)
  const fmtRep = (n: number | null) => (n === null ? '—' : isDev ? signed(n, rep) : rep(n))

  const aggVal = valueAt(aggregate, ref.year, ref.q, ref.row, col)
  const needsConversion = funds.some((f) => f.currency !== reportingCurrency)

  const rows: ExplainBreakdown['rows'] = []
  let portTotal = 0
  let any = false
  for (const f of funds) {
    const lcy = valueAt(f.lcyData, ref.year, ref.q, ref.row, col)
    const port = valueAt(f.data, ref.year, ref.q, ref.row, col)
    if (lcy === null && port === null) continue
    any = true
    if (port !== null) portTotal += port
    const fmtLcy = (n: number | null) =>
      n === null ? '—' : isDev ? signed(n, (x) => formatMoney(x, f.currency)) : formatMoney(n, f.currency)
    rows.push({
      cells: needsConversion ? [f.name, fmtLcy(lcy), fmtRep(port)] : [f.name, fmtRep(port)],
    })
  }
  rows.push({
    cells: needsConversion ? ['Total', '', fmtRep(portTotal)] : ['Total', fmtRep(portTotal)],
    emphasis: true,
  })

  const columns = needsConversion ? ['Fund', 'LCY', reportingCurrency] : ['Fund', reportingCurrency]

  return {
    title,
    value: fmtRep(aggVal),
    subtitle: needsConversion
      ? 'By underlying fund — the portfolio’s pro-rata share, in local and reporting currency'
      : 'By underlying fund — the portfolio’s pro-rata share',
    ...(isDev ? { formula: 'Δ = Actual − Plan, per fund' } : {}),
    steps: [],
    checks: [],
    breakdown: any ? { columns, rows } : undefined,
  }
}
