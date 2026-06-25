import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Download, Settings as SettingsIcon, Upload } from 'lucide-react'
import { exportData, importData } from '@/store'
import { activeNav } from './nav'

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md border border-border-default bg-white text-slate-500 hover:bg-slate-50"
    >
      {children}
    </button>
  )
}

export function Topbar() {
  const location = useLocation()
  const nav = activeNav(location.pathname)
  const [busy, setBusy] = useState(false)

  async function onImport() {
    if (busy) return
    if (!window.confirm('Import will replace the current dataset. Continue?')) return
    setBusy(true)
    try {
      const res = await importData()
      if (!res.ok && res.error) window.alert(`Import failed: ${res.error}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="flex h-13 flex-shrink-0 items-center justify-between border-b border-border-default bg-white px-6">
      <div className="text-[13px] font-semibold">{nav.label}</div>
      <div className="flex items-center gap-[10px]">
        <IconButton title="Export dataset (JSON)" onClick={exportData}>
          <Download className="size-[15px]" strokeWidth={2} />
        </IconButton>
        <IconButton title="Import dataset (JSON)" onClick={onImport}>
          <Upload className="size-[15px]" strokeWidth={2} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-border-default" />
        <IconButton title="Notifications">
          <Bell className="size-[15px]" strokeWidth={2} />
        </IconButton>
        <IconButton title="Settings">
          <SettingsIcon className="size-[15px]" strokeWidth={2} />
        </IconButton>
      </div>
    </header>
  )
}
