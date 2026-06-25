// Pure PE/VC performance multiples derived from a fund's cumulative actuals. These
// mirror the engine's §7 implied ratios but operate on the draft amounts being edited —
// the same editing-aid pattern the Actuals grid uses to preview Unfunded inline (no store
// or engine round-trip; nothing here is persisted).

export interface FundMultiples {
  /** Paid-in / commitment (PIC). null only when commitment is 0. */
  pic: number | null
  /** Distributed / paid-in (DPI). null when paid-in is 0 → shown as "n.a." */
  dpi: number | null
  /** NAV / paid-in (RVPI). null when paid-in is 0 → shown as "n.a." */
  rvpi: number | null
  /** (Distributed + NAV) / paid-in (TVPI = DPI + RVPI). null when paid-in is 0. */
  tvpi: number | null
}

/** Compute PIC/DPI/RVPI/TVPI from one quarter's cumulative amounts. */
export function fundMultiples(input: {
  commitment: number
  paidIn: number
  distributed: number
  nav: number
}): FundMultiples {
  const { commitment, paidIn, distributed, nav } = input
  const perPaidIn = (n: number) => (paidIn > 0 ? n / paidIn : null)
  return {
    pic: commitment > 0 ? paidIn / commitment : null,
    dpi: perPaidIn(distributed),
    rvpi: perPaidIn(nav),
    tvpi: perPaidIn(distributed + nav),
  }
}

/** Display a multiple: 1.45 → "1.45×", null → "n.a." */
export function formatMultiple(v: number | null): string {
  return v === null ? 'n.a.' : `${v.toFixed(2)}×`
}
