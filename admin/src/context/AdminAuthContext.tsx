import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';
import type { AdminUser } from '../types';

export type LoginFlowStage = 'unauthenticated' | 'pin_required' | 'mfa_required' | 'authenticated';

interface AdminAuthContextValue {
  admin: AdminUser | null;
  stage: LoginFlowStage;
  loading: boolean;
  refreshSession: () => Promise<void>;
  loginWithPin: (pin: string) => Promise<LoginFlowStage>;
  loginPassword: (email: string, password: string) => Promise<LoginFlowStage>;
  verifyPin: (pin: string) => Promise<LoginFlowStage>;
  verifyMfa: (code: string) => Promise<LoginFlowStage>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [stage, setStage] = useState<LoginFlowStage>('unauthenticated');
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest<{ stage: LoginFlowStage; admin: AdminUser }>('/api/admin/auth/me');
      setAdmin(data.admin);
      setStage(data.stage);
    } catch {
      setAdmin(null);
      setStage('unauthenticated');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const loginWithPin = useCallback(async (pin: string) => {
    const res = await apiRequest<{ stage: LoginFlowStage; admin: AdminUser }>('/api/admin/auth/pin-login', {
      method: 'POST',
      body: { pin },
    });
    setAdmin(res.admin);
    setStage(res.stage);
    return res.stage;
  }, []);

  const loginPassword = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ stage: LoginFlowStage; admin: AdminUser }>('/api/admin/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setAdmin(res.admin);
    setStage(res.stage);
    return res.stage;
  }, []);

  const verifyPin = useCallback(async (pin: string) => {
    const res = await apiRequest<{ stage: LoginFlowStage; admin: AdminUser }>('/api/admin/auth/verify-pin', {
      method: 'POST',
      body: { pin },
    });
    setAdmin(res.admin);
    setStage(res.stage);
    return res.stage;
  }, []);

  const verifyMfa = useCallback(async (code: string) => {
    const res = await apiRequest<{ stage: LoginFlowStage; admin: AdminUser }>('/api/admin/auth/verify-mfa', {
      method: 'POST',
      body: { code },
    });
    setAdmin(res.admin);
    setStage(res.stage);
    return res.stage;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // Clear local auth state even if session already expired
    }
    setAdmin(null);
    setStage('unauthenticated');
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ admin, stage, loading, refreshSession, loginWithPin, loginPassword, verifyPin, verifyMfa, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
