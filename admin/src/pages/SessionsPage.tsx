import { useCallback, useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { apiRequest, formatDateTime } from '../lib/api';
import type { ActiveSessionItem } from '../types';

export function SessionsPage() {
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);

  const load = useCallback(async () => {
    const res = await apiRequest<{ sessions: ActiveSessionItem[] }>('/api/admin/sessions');
    setSessions(res.sessions);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeOne(id: string) {
    await apiRequest(`/api/admin/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }

  async function revokeOthers() {
    await apiRequest('/api/admin/sessions/others', { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#151515]">Active Sessions</h1>
        <button type="button" onClick={() => void revokeOthers()} className="btn-admin-green">
          <ShieldOff className="h-4 w-4" aria-hidden="true" />
          Revoke All Other Sessions
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#EAEAEA] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#EAEAEA] bg-[#FAFAFA] font-semibold text-[#676767]">
            <tr>
              <th className="px-4 py-3">Session ID</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">Last Active (15m Idle)</th>
              <th className="px-4 py-3">Expires (8h Max)</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEAEA]">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono-code text-[#151515]">
                  {s.id.slice(0, 8)}...
                  {s.isCurrent && (
                    <span className="ml-2 rounded-full border-2 border-[#8FE515] bg-[#F4FCE6] px-2 py-0.5 text-[10px] font-semibold">
                      Current
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono-code text-[#676767]">{s.ipAddress}</td>
                <td className="px-4 py-3 tabular-nums">{formatDateTime(s.lastActiveAt)}</td>
                <td className="px-4 py-3 tabular-nums">{formatDateTime(s.expiresAt)}</td>
                <td className="px-4 py-3 text-right">
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => void revokeOne(s.id)}
                      className="rounded-lg border border-[#C8004B] px-2.5 py-1 text-xs font-semibold text-[#C8004B] hover:bg-[#FFF5F8] cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
