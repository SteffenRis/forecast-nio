import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'
import { parseCsv, type ParsedCsv } from '@/lib/csv/parseCsv'
import {
  autoDetectColumns,
  isColumnMappingComplete,
  type CanonicalField,
  type ColumnMapping,
} from '@/lib/csv/columnMapping'
import { autoMatchFund, type FundMatch } from '@/lib/csv/matchFunds'
import { buildImportPreview, mergeActualsByQuarter } from '@/lib/csv/buildActuals'
import { applyRowEdits, type EditableField, type RowEdits } from '@/lib/csv/applyEdits'
import { FUND_SKIP, type FundNameMapping, type FundTarget } from '@/lib/csv/types'
import { Stepper } from './Stepper'
import { StepUpload } from './StepUpload'
import { StepMap } from './StepMap'
import { StepEdit } from './StepEdit'
import { StepConfirm } from './StepConfirm'

const EMPTY_MAPPING: ColumnMapping = {
  fundName: null,
  date: null,
  contributions: null,
  distributions: null,
  recallable: null,
  nav: null,
}

const PARSE_ERROR: Record<string, string> = {
  empty: 'That file has no rows.',
  'header-only': 'That file has a header row but no data rows.',
}

/** Three-step wizard: upload a CSV → map columns + fund names → confirm and write.
 *  All wizard state is local (ephemeral UI), and the only store mutation is the final
 *  per-fund setFundActuals on confirm — keeping with "the store holds raw inputs". */
export function ImportActualsPage() {
  const navigate = useNavigate()
  const fundsRec = useStore((s) => s.funds)
  const fundOrder = useStore((s) => s.fundOrder)
  const setFundActuals = useStore((s) => s.setFundActuals)
  const select = useStore((s) => s.select)

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(EMPTY_MAPPING)
  const [fundOverrides, setFundOverrides] = useState<Record<string, FundTarget>>({})
  // Per-row, per-field value corrections made on the Edit step (keyed by CSV row index).
  const [edits, setEdits] = useState<RowEdits>({})

  const systemFunds = useMemo(
    () =>
      fundOrder
        .map((id) => fundsRec[id])
        .filter(Boolean)
        .map((f) => ({ id: f.id, name: f.name, gpName: f.gpName })),
    [fundsRec, fundOrder],
  )

  const fundNameById = useMemo(
    () => Object.fromEntries(systemFunds.map((f) => [f.id, f.name])),
    [systemFunds],
  )

  const existingActualsByFundId = useMemo(
    () => Object.fromEntries(fundOrder.map((id) => [id, fundsRec[id]?.actuals ?? []])),
    [fundsRec, fundOrder],
  )

  // Distinct fund names from the mapped fund-name column, with row counts.
  const distinctNames = useMemo(() => {
    const col = columnMapping.fundName
    if (!parsed || col === null) return [] as { name: string; count: number }[]
    const seen = new Map<string, number>()
    for (const row of parsed.rows) {
      const raw = (row[col] ?? '').trim()
      if (raw === '') continue
      seen.set(raw, (seen.get(raw) ?? 0) + 1)
    }
    return [...seen.entries()].map(([name, count]) => ({ name, count }))
  }, [parsed, columnMapping.fundName])

  const autoMatchByName = useMemo(() => {
    const m = new Map<string, FundMatch>()
    for (const { name } of distinctNames) m.set(name, autoMatchFund(name, systemFunds))
    return m
  }, [distinctNames, systemFunds])

  const targetFor = (name: string): FundTarget => {
    if (name in fundOverrides) return fundOverrides[name]
    const m = autoMatchByName.get(name)
    return m && m.kind !== 'none' ? m.fundId : FUND_SKIP
  }
  const autoKindFor = (name: string): FundMatch['kind'] => autoMatchByName.get(name)?.kind ?? 'none'

  const fundNameMapping = useMemo<FundNameMapping>(() => {
    const out: FundNameMapping = {}
    for (const { name } of distinctNames) {
      const override = fundOverrides[name]
      if (override !== undefined) {
        out[name] = override
        continue
      }
      const m = autoMatchByName.get(name)
      out[name] = m && m.kind !== 'none' ? m.fundId : FUND_SKIP
    }
    return out
  }, [distinctNames, fundOverrides, autoMatchByName])

  // The Edit step's corrections re-written into the parsed cells. buildImportPreview then
  // re-parses from this, so the Edit and Confirm screens share one recomputed preview.
  const effectiveParsed = useMemo(
    () => (parsed ? applyRowEdits(parsed, edits, columnMapping) : null),
    [parsed, edits, columnMapping],
  )

  const preview = useMemo(() => {
    if (!effectiveParsed) return null
    return buildImportPreview({
      parsed: effectiveParsed,
      columnMapping,
      fundNameMapping,
      funds: systemFunds,
      existingActualsByFundId,
    })
  }, [effectiveParsed, columnMapping, fundNameMapping, systemFunds, existingActualsByFundId])

  const columnsComplete = isColumnMappingComplete(columnMapping)

  function onText(name: string, text: string) {
    setFileName(name)
    setFundOverrides({})
    setEdits({}) // row-indexed edits are tied to this file's rows; a new file invalidates them.
    if (text === '') {
      setParsed(null)
      setParseError('Could not read the file.')
      return
    }
    const res = parseCsv(text)
    if (!res.ok || !res.data) {
      setParsed(null)
      setParseError(PARSE_ERROR[res.error ?? ''] ?? 'That file could not be read as CSV.')
      return
    }
    setParsed(res.data)
    setParseError(null)
    setColumnMapping(autoDetectColumns(res.data.header))
  }

  function onColumnChange(field: CanonicalField, idx: number | null) {
    setColumnMapping((prev) => {
      const next = { ...prev }
      if (idx !== null) {
        // A column maps to at most one field — release it from any other field first.
        for (const k of Object.keys(next) as CanonicalField[]) if (next[k] === idx) next[k] = null
      }
      next[field] = idx
      return next
    })
  }

  function onFundChange(name: string, target: FundTarget) {
    setFundOverrides((prev) => ({ ...prev, [name]: target }))
  }

  function onEditCell(rowIndex: number, field: EditableField, value: string) {
    setEdits((prev) => ({ ...prev, [rowIndex]: { ...prev[rowIndex], [field]: value } }))
  }

  function onConfirm() {
    if (!preview) return
    const st = useStore.getState()
    for (const plan of preview.plans) {
      const existing = st.funds[plan.fundId]?.actuals ?? []
      const { merged } = mergeActualsByQuarter(existing, plan.incoming)
      setFundActuals(plan.fundId, merged)
    }
    const first = preview.plans[0]
    if (first) {
      select({ selectedFundId: first.fundId })
      navigate('/performance')
    } else {
      navigate('/actuals')
    }
  }

  return (
    <RoutePlaceholder navId="actuals">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Import actuals from CSV</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Upload a spreadsheet of realized data, map its columns and fund names to the system,
            then confirm. Existing quarters are updated; quarters you don't include are kept.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border-default bg-white px-3 py-2 text-[13px] font-medium text-body hover:bg-slate-50"
          onClick={() => navigate('/actuals')}
        >
          Cancel
        </button>
      </div>

      <Stepper current={step} />

      {step === 1 && (
        <StepUpload
          fileName={fileName}
          parsed={parsed}
          error={parseError}
          onText={onText}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && parsed && (
        <StepMap
          header={parsed.header}
          mapping={columnMapping}
          onColumnChange={onColumnChange}
          names={distinctNames}
          funds={systemFunds}
          target={targetFor}
          autoKind={autoKindFor}
          onFundChange={onFundChange}
          canContinue={columnsComplete}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && effectiveParsed && preview && (
        <StepEdit
          rows={effectiveParsed.rows}
          mapping={columnMapping}
          outcomes={preview.rows}
          recallableMapped={columnMapping.recallable !== null}
          fundNameById={fundNameById}
          onEditCell={onEditCell}
          onBack={() => setStep(2)}
          onContinue={() => setStep(4)}
        />
      )}

      {step === 4 && preview && (
        <StepConfirm preview={preview} onBack={() => setStep(3)} onConfirm={onConfirm} />
      )}
    </RoutePlaceholder>
  )
}
