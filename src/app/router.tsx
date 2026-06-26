import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { TemplatesPage } from '@/routes/templates/TemplatesPage'
import { PortfoliosPage } from '@/routes/portfolios/PortfoliosPage'
import { FundsPage } from '@/routes/funds/FundsPage'
import { ActualsPage } from '@/routes/actuals/ActualsPage'
import { ImportActualsPage } from '@/routes/actuals/import/ImportActualsPage'
import { PerformancePage } from '@/routes/performance/PerformancePage'
import { SettingsPage } from '@/routes/settings/SettingsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/templates" replace /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'portfolios', element: <PortfoliosPage /> },
      { path: 'funds', element: <FundsPage /> },
      { path: 'actuals', element: <ActualsPage /> },
      { path: 'actuals/import', element: <ImportActualsPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
