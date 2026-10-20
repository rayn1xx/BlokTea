import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import '@alfalab/core-components-vars/bundle/corp.css';
import '@alfalab/core-components-themes/corp.css';
import './styles/fonts.css';
import './styles/global.css';

import { router } from './router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
