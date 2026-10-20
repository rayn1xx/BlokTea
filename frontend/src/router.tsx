import { createBrowserRouter, Navigate } from 'react-router-dom';

import { LoginPage } from './pages/LoginPage/LoginPage';

export const routes = {
  login: '/login',
} as const;

export const router = createBrowserRouter([
  { path: routes.login, element: <LoginPage /> },
  { path: '*', element: <Navigate to={routes.login} replace /> },
]);
