import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from './components/AdminShell';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ClientsPage } from './pages/ClientsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { LogsPage } from './pages/LogsPages';
import { MessagesPage } from './pages/MessagesPage';

export function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AdminShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AdminAuthProvider>
  );
}

export default App;
