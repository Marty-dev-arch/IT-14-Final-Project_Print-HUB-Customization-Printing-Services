import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Search, Trash2 } from 'lucide-react';
import { ApiError, apiRequest, formatDateTime } from '../lib/api';
import type { ClientItem } from '../types';

type LogsSort = 'date_desc' | 'date_asc' | 'time_asc' | 'time_desc';

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function LogsPage() {
  const [items, setItems] = useState<ClientItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [timeQuery, setTimeQuery] = useState('');
  const [sortBy, setSortBy] = useState<LogsSort>('date_desc');

  const [deleteTarget, setDeleteTarget] = useState<ClientItem | 'all' | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [reauthPin, setReauthPin] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLogs = useCallback(async () => {
    const qs = new URLSearchParams({
      scope: 'logs',
      sort: sortBy,
      page: String(page),
      pageSize: '20',
      ...(timeQuery.trim() ? { timeQuery: timeQuery.trim() } : {}),
    });
    const data = await apiRequest<{ clients: ClientItem[]; total: number }>(
      `/api/admin/clients?${qs.toString()}`,
    );
    setItems(data.clients);
    setTotal(data.total);
  }, [page, sortBy, timeQuery]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  async function handleDownloadCsv() {
    const qs = new URLSearchParams({
      scope: 'logs',
      sort: sortBy,
      page: '1',
      pageSize: '100',
      ...(timeQuery.trim() ? { timeQuery: timeQuery.trim() } : {}),
    });
    const data = await apiRequest<{ clients: ClientItem[]; total: number }>(
      `/api/admin/clients?${qs.toString()}`,
    );

    const header = [
      'Name',
      'Contact',
      'Inquiry Item',
      'Quantity',
      'Total Price',
      'Reservation Fee',
      'Inquiry Date',
      'Logged Date & Time',
      'Status',
    ];
    const rows = data.clients.map((c) => [
      c.fullName,
      c.contactInfo,
      c.orderItem || '',
      c.quantity ?? 1,
      c.totalPrice ?? 0,
      typeof c.reservationFee === 'number' && c.reservationFee > 0 ? c.reservationFee : 'No',
      c.orderDate ?? c.createdAt.slice(0, 10),
      formatDateTime(c.statusUpdatedAt ?? c.updatedAt),
      c.orderStatus ?? 'Done',
    ]);

    const csv = [header, ...rows]
      .map((line) => line.map(escapeCsvCell).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rj-print-hub-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleConfirmDelete(e: FormEvent) {
    e.preventDefault();
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const endpoint =
      deleteTarget === 'all'
        ? '/api/admin/clients/logs/all'
        : `/api/admin/clients/${encodeURIComponent(deleteTarget.id)}`;
    try {
      try {
        await apiRequest(endpoint, { method: 'DELETE' });
      } catch (err) {
        if (err instanceof ApiError && err.data.requireReauth) {
          if (reauthPin.length !== 6) {
            setNeedsPin(true);
            setDeleteError('Enter your 6-digit security PIN to confirm.');
            setDeleting(false);
            return;
          }
          await apiRequest('/api/admin/auth/reauth', {
            method: 'POST',
            body: { pin: reauthPin },
          });
          await apiRequest(endpoint, { method: 'DELETE' });
        } else {
          throw err;
        }
      }
      setDeleteTarget(null);
      setNeedsPin(false);
      setReauthPin('');
      await loadLogs();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete log record.');
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Logs</h1>
          <p className="mt-1 text-sm text-[#64748B]">Here are your logs today</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              setDeleteTarget('all');
              setNeedsPin(false);
              setReauthPin('');
              setDeleteError(null);
            }}
            className={`btn-admin-danger ${deleteTarget === 'all' ? 'is-active' : ''}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete All
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadCsv()}
            className="btn-admin-green"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Borderless Search & Sort-by Bar (No Outer Card Background) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            value={timeQuery}
            onChange={(e) => {
              setTimeQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search time and date..."
            aria-label="Search time and date"
            className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-4 text-sm text-[#0F172A]"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <label htmlFor="logs-sort-select" className="text-sm font-medium text-[#64748B]">
            Sort by:
          </label>
          <select
            id="logs-sort-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as LogsSort);
              setPage(1);
            }}
            className="h-10 rounded-full border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#0F172A] cursor-pointer"
          >
            <option value="date_desc">Date &amp; Time (Newest)</option>
            <option value="date_asc">Date &amp; Time (Oldest)</option>
            <option value="time_asc">Time (Earliest – Latest)</option>
            <option value="time_desc">Time (Latest – Earliest)</option>
          </select>
        </div>
      </div>

      {/* Done & Cancelled Order Logs Table */}
      <div className="w-full overflow-x-auto rounded-2xl border border-[#EAE6DF] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#F1F5F9] text-xs font-semibold text-[#64748B]">
            <tr>
              <th className="px-4 py-3.5">Date &amp; Time</th>
              <th className="px-4 py-3.5">Name</th>
              <th className="px-4 py-3.5">Inquiry Item</th>
              <th className="px-4 py-3.5">Quantity</th>
              <th className="px-4 py-3.5">Total Price</th>
              <th className="px-4 py-3.5">Reservation Fee</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center text-base text-[#64748B]">
                  No completed or cancelled client logs yet.
                </td>
              </tr>
            ) : (
              items.map((client) => {
                const isDone = client.orderStatus === 'Done';
                return (
                  <tr key={client.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3.5 text-xs text-[#64748B] tabular-nums">
                      {formatDateTime(client.statusUpdatedAt ?? client.updatedAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#0F172A]">{client.fullName}</p>
                      {client.contactInfo && (
                        <p className="text-xs text-[#64748B] tabular-nums">
                          {client.contactInfo.replace(/\s*·\s*/g, '  ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#0F172A]">
                      {client.orderItem || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#0F172A] tabular-nums">
                      {client.quantity ?? 1}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[#0F172A] tabular-nums">
                      {typeof client.totalPrice === 'number' && client.totalPrice > 0
                        ? `₱${client.totalPrice.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#0F172A] tabular-nums">
                      {typeof client.reservationFee === 'number' && client.reservationFee > 0
                        ? `₱${client.reservationFee.toLocaleString()}`
                        : 'No'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          isDone
                            ? 'bg-[#F0FDF4] text-[#15803D]'
                            : 'bg-[#FEF2F2] text-[#DC2626]'
                        }`}
                      >
                        {client.orderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(client);
                          setNeedsPin(false);
                          setReauthPin('');
                          setDeleteError(null);
                        }}
                        aria-label={`Delete log for ${client.fullName}`}
                        className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {total > 20 && (
          <div className="flex items-center justify-between border-t border-[#F1F5F9] px-5 py-3 text-xs text-[#64748B]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-admin-green py-1 px-2.5 text-xs"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-admin-green py-1 px-2.5 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Single Log / Delete All Logs Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteTarget(null)}
        >
          <form
            onSubmit={handleConfirmDelete}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0F172A]">
              {deleteTarget === 'all' ? 'Delete All Logs?' : 'Delete Log Record?'}
            </h2>
            <p className="text-sm leading-relaxed text-[#64748B]">
              {deleteTarget === 'all'
                ? 'This deletes all Done and Cancelled records in Logs. Pending Client Records and Message Management threads stay untouched.'
                : `This removes the log entry for ${deleteTarget.fullName} while preserving message history.`}
            </p>
            {deleteError && <p className="text-xs font-medium text-[#DC2626]">{deleteError}</p>}
            {needsPin && (
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={reauthPin}
                onChange={(e) => setReauthPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit Security PIN"
                className="h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm tabular-nums"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting}
                className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Deleting...' : deleteTarget === 'all' ? 'Delete All' : 'Delete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
