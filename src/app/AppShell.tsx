import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'

/** Persistent chrome (sidebar + topbar) wrapping every route. */
export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-7 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
