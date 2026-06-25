/** The navy "F" brand mark (swap for icon.png in production). */
export function BrandMark() {
  return (
    <span className="grid size-[26px] flex-shrink-0 place-items-center rounded-md bg-brand-navy text-[13px] font-bold tracking-tight text-white">
      F
    </span>
  )
}

/** Brand mark + two-line product / parent-brand lockup. */
export function BrandLockup() {
  return (
    <div className="flex min-w-0 items-center gap-[9px]">
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold tracking-[-0.01em]">Forecasting</span>
        <span className="truncate text-[10px] font-medium text-muted">FundFrame</span>
      </span>
    </div>
  )
}
