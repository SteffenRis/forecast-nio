import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './AppShell'
import { TemplatesPage } from '@/routes/templates/TemplatesPage'
import { PortfoliosPage } from '@/routes/portfolios/PortfoliosPage'
import { FundsPage } from '@/routes/funds/FundsPage'
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
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
