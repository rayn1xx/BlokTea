import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

import { ApplicationEditScreen } from '@/features/applications/screens/ApplicationEditScreen';
import { ApplicationScreen } from '@/features/applications/screens/ApplicationScreen';
import { ApplicationsListScreen } from '@/features/applications/screens/ApplicationsListScreen';
import { JoinScreen } from '@/features/auth/screens/JoinScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { StartScreen } from '@/features/auth/screens/StartScreen';
import { BankApplicationScreen } from '@/features/bank/screens/BankApplicationScreen';
import { BankDashboardScreen } from '@/features/bank/screens/BankDashboardScreen';
import { BankDecisionScreen } from '@/features/bank/screens/BankDecisionScreen';
import { BankQueueScreen } from '@/features/bank/screens/BankQueueScreen';
import { BankSettingsScreen } from '@/features/bank/screens/BankSettingsScreen';
import { ReadinessScreen } from '@/features/company/screens/ReadinessScreen';
import { ApplicationDocumentsScreen } from '@/features/documents/screens/ApplicationDocumentsScreen';
import { DocumentsScreen } from '@/features/documents/screens/DocumentsScreen';
import { FeedScreen } from '@/features/feed/screens/FeedScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { InfoRequestScreen } from '@/features/info-requests/screens/InfoRequestScreen';
import { LoanScreen, ScheduleScreen } from '@/features/loans/screens/LoanScreen';
import { MatchingScreen } from '@/features/matching/screens/MatchingScreen';
import { ProductsScreen } from '@/features/products/screens/ProductsScreen';
import { BankShell, ClientShell } from '@/features/profile/components/AppShell/AppShell';
import { DemoPanel } from '@/features/profile/components/DemoPanel/DemoPanel';
import { RequireAccess } from '@/features/profile/components/RequireAccess';
import { SigningScreen } from '@/features/signing/screens/SigningScreen';
import { TeamScreen } from '@/features/team/screens/TeamScreen';
import { getToken } from '@/shared/api/token';

function Root() {
  return (
    <>
      <Outlet />
      <DemoPanel />
    </>
  );
}

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to='/login' replace />;
}

function GuestOnly() {
  return getToken() ? <Navigate to='/home' replace /> : <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/', element: <StartScreen /> },
          { path: '/join', element: <JoinScreen /> },
        ],
      },
      { path: '/login', element: <LoginScreen /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <ClientShell />,
            children: [
              { path: '/home', element: <HomeScreen /> },
              { path: '/onboarding/company', element: <HomeScreen /> },
              { path: '/notifications', element: <HomeScreen /> },
              { path: '/feed', element: <FeedScreen /> },
              { path: '/team', element: <TeamScreen /> },
              { path: '/team/company', element: <TeamScreen /> },
              { path: '/team/signing', element: <TeamScreen /> },
              { element: <RequireAccess capability='manage_team' />, children: [{ path: '/team/invite', element: <TeamScreen /> }] },
              {
                element: <RequireAccess capability='apply' />,
                children: [
                  { path: '/match/:sessionId/step/:step', element: <MatchingScreen /> },
                  { path: '/products', element: <ProductsScreen /> },
                  { path: '/products/:code', element: <ProductsScreen /> },
                ],
              },
              { path: '/readiness', element: <ReadinessScreen /> },
              { path: '/applications', element: <ApplicationsListScreen /> },
              { path: '/applications/:id', element: <ApplicationScreen /> },
              { path: '/applications/:id/edit', element: <ApplicationEditScreen /> },
              { path: '/applications/:id/documents', element: <ApplicationDocumentsScreen /> },
              { path: '/applications/:id/info-requests/:rid', element: <InfoRequestScreen /> },
              { path: '/applications/:id/signing', element: <SigningScreen /> },
              { path: '/loans/:id', element: <LoanScreen /> },
              { path: '/loans/:id/schedule', element: <ScheduleScreen /> },
              { path: '/documents', element: <DocumentsScreen /> },
              { path: '/main', element: <Navigate to='/home' replace /> },
            ],
          },
          {
            element: <BankShell />,
            children: [
              { path: '/bank/queue', element: <BankQueueScreen /> },
              { path: '/bank/applications/:id', element: <BankApplicationScreen /> },
              { path: '/bank/applications/:id/decision', element: <BankDecisionScreen /> },
              { path: '/bank/dashboard', element: <BankDashboardScreen /> },
              { path: '/bank/settings', element: <BankSettingsScreen /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to='/' replace /> },
    ],
  },
]);
