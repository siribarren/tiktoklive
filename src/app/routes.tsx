import { createBrowserRouter } from 'react-router';

import { AuthGate, AdminGate } from './auth/auth';
import { DashboardLayout } from './components/DashboardLayout';

const hydrateFallbackElement = <div className="min-h-screen bg-slate-950" />;

export const router = createBrowserRouter([
  {
    path: '/login',
    hydrateFallbackElement,
    lazy: async () => ({
      Component: (await import('./components/LoginPage')).LoginPage,
    }),
  },
  {
    path: '/',
    Component: AuthGate,
    hydrateFallbackElement,
    children: [
      {
        Component: DashboardLayout,
        hydrateFallbackElement,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('./components/Dashboard')).Dashboard,
            }),
          },
          {
            path: 'live-sessions',
            lazy: async () => ({
              Component: (await import('./components/LiveSessions')).LiveSessions,
            }),
          },
          {
            path: 'live-sessions/:id',
            lazy: async () => ({
              Component: (await import('./components/SessionReport')).SessionReport,
            }),
          },
          {
            path: 'finished-sessions',
            lazy: async () => ({
              Component: (await import('./components/FinishedSessions')).FinishedSessions,
            }),
          },
          {
            path: 'messages',
            lazy: async () => ({
              Component: (await import('./components/LiveMessages')).LiveMessages,
            }),
          },
          {
            path: 'leads',
            lazy: async () => ({
              Component: (await import('./components/LeadInbox')).LeadInbox,
            }),
          },
          {
            path: 'leads/:id',
            lazy: async () => ({
              Component: (await import('./components/LeadDetail')).LeadDetail,
            }),
          },
          {
            path: 'accounts',
            lazy: async () => ({
              Component: (await import('./components/Accounts')).Accounts,
            }),
          },
          {
            path: 'accounts/:accountId/report',
            lazy: async () => ({
              Component: (await import('./components/AccountReport')).AccountReport,
            }),
          },
          {
            path: 'rules',
            Component: AdminGate,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('./components/Rules')).Rules,
                }),
              },
            ],
          },
          {
            path: 'settings',
            Component: AdminGate,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('./components/Settings')).Settings,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
]);
