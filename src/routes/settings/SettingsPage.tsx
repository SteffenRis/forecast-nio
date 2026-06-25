import { useState } from 'react'
import { clearAllData, exportData, importData, resetToSeed, useStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-default bg-white p-4 shadow-xs">
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted">{label}</div>
    </div>
  )
}

function Action({
  label,
  desc,
  onClick,
  danger,
}: {
  label: string
  desc: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border-default bg-white px-4 py-3 text-left hover:bg-slate-50"
    >
      <span>
        <span className={`block text-[13px] font-semibold ${danger ? 'text-negative' : ''}`}>
          {label}
        </span>
        <span className="block text-[12px] text-muted">{desc}</span>
      </span>
    </button>
  )
}

export function SettingsPage() {
  const counts = useStore(
    useShallow((s) => ({
      templates: s.templateOrder.length,
      funds: s.fundOrder.length,
      portfolios: s.portfolioOrder.length,
    })),
  )
  const [msg, setMsg] = useState<string | null>(null)

  async function onImport() {
    if (!window.confirm('Import will replace the current dataset. Continue?')) return
    const res = await importData()
    setMsg(res.ok ? 'Dataset imported.' : `Import failed: ${res.error ?? 'unknown error'}`)
  }

  return (
    <RoutePlaceholder navId="settings">
      <h2 className="text-xl font-bold tracking-[-0.02em]">Settings</h2>
      <p className="mt-1 text-[13px] text-muted">
        Workspace data lives entirely in your browser (zustand + localStorage). Use export/import
        to move or share a dataset as a single JSON file.
      </p>

      <h3 className="mt-7 text-[11px] font-bold uppercase tracking-wide text-slate-500">Dataset</h3>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Templates" value={counts.templates} />
        <Stat label="Funds" value={counts.funds} />
        <Stat label="Portfolios" value={counts.portfolios} />
      </div>

      <h3 className="mt-7 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Data document
      </h3>
      <div className="mt-3 space-y-2">
        <Action
          label="Export dataset"
          desc="Download everything as a JSON file."
          onClick={exportData}
        />
        <Action
          label="Import dataset"
          desc="Replace the current data from a JSON file."
          onClick={onImport}
        />
        <Action
          label="Reset to demo data"
          desc="Restore the Acme VII / Nordic FoF reference example."
          onClick={() => {
            resetToSeed()
            setMsg('Reset to demo data.')
          }}
        />
        <Action
          label="Clear all data"
          desc="Remove every template, fund and portfolio."
          danger
          onClick={() => {
            if (window.confirm('Delete all data? This cannot be undone (export first).')) {
              clearAllData()
              setMsg('All data cleared.')
            }
          }}
        />
      </div>

      {msg && <p className="mt-4 text-[12px] font-medium text-positive">{msg}</p>}
    </RoutePlaceholder>
  )
}
