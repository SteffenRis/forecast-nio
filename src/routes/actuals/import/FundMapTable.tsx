import { cn } from '@/lib/cn'
import type { FundMatch } from '@/lib/csv/matchFunds'
import { FUND_SKIP, type FundTarget } from '@/lib/csv/types'
import { selectCls } from './styles'

export interface FundOption {
  id: string
  name: string
  gpName?: string
}

interface Props {
  names: { name: string; count: number }[]
  funds: FundOption[]
  target: (name: string) => FundTarget
  autoKind: (name: string) => FundMatch['kind']
  onChange: (name: string, target: FundTarget) => void
}

function Badge({ target, kind }: { target: FundTarget; kind: FundMatch['kind'] }) {
  if (target === FUND_SKIP) {
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">Will skip</span>
  }
  if (kind === 'exact') {
    return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-positive">Auto-matched</span>
  }
  if (kind === 'heuristic') {
    return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Likely · review</span>
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Manual</span>
}

/** Step 2b: map each distinct fund name from the sheet onto a system fund (or skip).
 *  Auto-matches are pre-selected; ambiguous names default to skip until chosen. */
export function FundMapTable({ names, funds, target, autoKind, onChange }: Props) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Funds</h3>
      <p className="mt-0.5 text-[12px] text-muted">
        Match each fund name in the sheet to a fund in the system. Unmatched names are skipped.
      </p>
      {names.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">No fund names found — check the column mapping above.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 text-left font-semibold">In the sheet</th>
                <th className="pb-2 pr-3 text-left font-semibold">Rows</th>
                <th className="pb-2 pr-3 text-left font-semibold">Maps to</th>
                <th className="pb-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {names.map(({ name, count }) => {
                const t = target(name)
                return (
                  <tr key={name} className="align-middle">
                    <td className="py-1.5 pr-3 font-medium text-body">{name}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted">{count}</td>
                    <td className="py-1.5 pr-3">
                      <select
                        className={cn(selectCls, 'min-w-[200px]')}
                        value={t === FUND_SKIP ? '' : t}
                        onChange={(e) => onChange(name, e.target.value === '' ? FUND_SKIP : e.target.value)}
                        aria-label={`Map ${name}`}
                      >
                        <option value="">— Don't import / skip —</option>
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                            {f.gpName ? ` · ${f.gpName}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <Badge target={t} kind={autoKind(name)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
