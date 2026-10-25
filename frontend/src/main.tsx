import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { router } from '@/app/router';
import { setSessionExpiredHandler } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query';

import '@alfalab/core-components-vars/bundle/corp.css';
import '@alfalab/core-components-themes/corp.css';
import './styles/index.css';

setSessionExpiredHandler(() => {
  queryClient.clear();
  void router.navigate('/login', { replace: true });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
