import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AppStoreProvider } from './context/AppStoreContext';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStoreProvider>
        <AppRoutes />
      </AppStoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
