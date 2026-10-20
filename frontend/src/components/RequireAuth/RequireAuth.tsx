import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { getToken } from '../../api/token';
import { routes } from '../../routes';

export function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to={routes.login} replace />;
  }

  return children;
}
