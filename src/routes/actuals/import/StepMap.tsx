import type { CanonicalField, ColumnMapping } from '@/lib/csv/columnMapping'
import type { FundMatch } from '@/lib/csv/matchFunds'
import type { FundTarget } from '@/lib/csv/types'
import { ColumnMapTable } from './ColumnMapTable'
import { FundMapTable, type FundOption } from './FundMapTable'
import { btnPrimary, btnSecondary, card } from './styles'

interface Props {
  header: string[]
  mapping: ColumnMapping
  onColumnChange: (field: CanonicalField, colIndex: number | null) => void
  names: { name: string; count: number }[]
  funds: FundOption[]
  target: (name: string) => FundTarget
  autoKind: (name: string) => FundMatch['kind']
  onFundChange: (name: string, target: FundTarget) => void
  canContinue: boolean
  onBack: () => void
  onContinue: () => void
}

/** Step 2: the mapping step — column mapping above, fund-name mapping below. */
export function StepMap({
  header,
  mapping,
  onColumnChange,
  names,
  funds,
  target,
  autoKind,
  onFundChange,
  canContinue,
  onBack,
  onContinue,
}: Props) {
  return (
    <div className="mt-5 space-y-4">
      <div className={card}>
        <ColumnMapTable header={header} mapping={mapping} onChange={onColumnChange} />
      </div>
      <div className={card}>
        <FundMapTable names={names} funds={funds} target={target} autoKind={autoKind} onChange={onFundChange} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnSecondary} onClick={onBack}>
          Back
        </button>
        <div className="flex items-center gap-3">
          {!canContinue && (
            <span className="text-[12px] text-negative">Map all required columns to continue.</span>
          )}
          <button type="button" className={btnPrimary} disabled={!canContinue} onClick={onContinue}>
            Review numbers
          </button>
        </div>
      </div>
    </div>
  )
}
