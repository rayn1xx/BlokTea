import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppLayout } from './components/AppLayout/AppLayout';
import { RequireAuth } from './components/RequireAuth/RequireAuth';
import { LoginPage } from './pages/LoginPage/LoginPage';
import { MainPage } from './pages/MainPage/MainPage';
import { routes } from './routes';

export const router = createBrowserRouter([
  { path: routes.login, element: <LoginPage /> },
  {
    // все страницы после входа: без токена — на вход, без роли — «Нет доступа»
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [{ path: routes.main, element: <MainPage /> }],
  },
  // неизвестные адреса ведут на главную, а без токена RequireAuth отправит на вход
  { path: '*', element: <Navigate to={routes.main} replace /> },
]);
