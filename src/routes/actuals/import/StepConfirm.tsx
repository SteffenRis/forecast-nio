import { AlertTriangle } from 'lucide-react'
import { quarterLabel, quarterOrdinal } from '@/lib/quarter'
import type { ImportPreview } from '@/lib/csv/types'
import { btnPrimary, btnSecondary, card } from './styles'

interface Props {
  preview: ImportPreview
  onBack: () => void
  onConfirm: () => void
}

const num = (n: number) => Math.round(n).toLocaleString('en-US')

/** Step 3: show exactly what will be written per fund, plus everything that won't be
 *  (skipped names, errored rows). The Import button is disabled when nothing applies. */
export function StepConfirm({ preview, onBack, onConfirm }: Props) {
  const { plans, rows, skippedFundNames } = preview
  const erroredRows = rows.filter((r) => r.status === 'error')
  const warnedRows = rows.filter((r) => r.status === 'ok' && r.warnings.length > 0)
  const totalIncoming = plans.reduce((n, p) => n + p.incoming.length, 0)
  const canImport = plans.length > 0

  return (
    <div className="mt-5 space-y-4">
      <div className={card}>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
        <p className="mt-1 text-[13px] text-body">
          {canImport ? (
            <>
              <span className="font-semibold">{totalIncoming}</span> quarter
              {totalIncoming === 1 ? '' : 's'} across{' '}
              <span className="font-semibold">{plans.length}</span> fund
              {plans.length === 1 ? '' : 's'} will be saved.
            </>
          ) : (
            'Nothing to import — no rows resolved to a system fund. Go back and map fund names.'
          )}
          {preview.skippedRowCount > 0 && `  ·  ${preview.skippedRowCount} row(s) skipped.`}
          {preview.errorRowCount > 0 && `  ·  ${preview.errorRowCount} row(s) with errors.`}
        </p>
      </div>

      {plans.map((plan) => {
        const overwritten = new Set(plan.overwrittenQuarters.map(quarterOrdinal))
        return (
          <div key={plan.fundId} className={card}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-body">{plan.fundName}</span>
              <span className="text-[12px] text-muted">
                {plan.addedQuarters.length} new · {plan.overwrittenQuarters.length} overwritten
              </span>
              {plan.duplicateInCsv.length > 0 && (
                <span className="text-[12px] text-amber-700">
                  · {plan.duplicateInCsv.map(quarterLabel).join(', ')} appeared more than once (last value used)
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 text-left font-semibold">Quarter</th>
                    <th className="px-1.5 pb-2 text-right font-semibold">Contributed</th>
                    <th className="px-1.5 pb-2 text-right font-semibold">Distributed</th>
                    <th className="px-1.5 pb-2 text-right font-semibold">Recallable</th>
                    <th className="px-1.5 pb-2 text-right font-semibold">NAV</th>
                    <th className="pb-2 pl-3 text-left font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.incoming.map((r) => (
                    <tr key={quarterOrdinal(r.quarter)} className="tabular-nums">
                      <td className="py-1.5 pr-3 text-left font-medium text-body">{quarterLabel(r.quarter)}</td>
                      <td className="px-1.5 py-1.5 text-right text-body">{num(r.cumulativePaidIn)}</td>
                      <td className="px-1.5 py-1.5 text-right text-body">{num(r.cumulativeDistributions)}</td>
                      <td className="px-1.5 py-1.5 text-right text-muted">
                        {r.recallableDistributions === undefined ? '—' : num(r.recallableDistributions)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-body">{num(r.nav)}</td>
                      <td className="py-1.5 pl-3 text-left">
                        {overwritten.has(quarterOrdinal(r.quarter)) ? (
                          <span className="text-[12px] font-medium text-amber-700">Overwrite</span>
                        ) : (
                          <span className="text-[12px] font-medium text-positive">New</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {(skippedFundNames.length > 0 || erroredRows.length > 0 || warnedRows.length > 0) && (
        <div className={card}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" strokeWidth={2} />
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Not imported
            </h3>
          </div>
          {skippedFundNames.length > 0 && (
            <p className="text-[13px] text-body">
              <span className="font-medium">Skipped funds:</span> {skippedFundNames.join(', ')}
            </p>
          )}
          {erroredRows.length > 0 && (
            <div className="mt-2">
              <p className="text-[13px] font-medium text-body">Rows with errors:</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
                {erroredRows.map((r) => (
                  <li key={r.rowIndex}>
                    Row {r.rowIndex + 2}
                    {r.csvFundName ? ` (${r.csvFundName})` : ''}: {r.errors.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warnedRows.length > 0 && (
            <div className="mt-2">
              <p className="text-[13px] font-medium text-body">Warnings:</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
                {warnedRows.map((r) => (
                  <li key={r.rowIndex}>
                    Row {r.rowIndex + 2} ({r.csvFundName}): {r.warnings.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnSecondary} onClick={onBack}>
          Back
        </button>
        <button type="button" className={btnPrimary} disabled={!canImport} onClick={onConfirm}>
          Import {totalIncoming > 0 ? `${totalIncoming} quarter${totalIncoming === 1 ? '' : 's'}` : ''}
        </button>
      </div>
    </div>
  )
}
