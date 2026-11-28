import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { TablePaginationFooter } from '../components/TableChrome';
import { ApiError, apiRequest, SERVICE_NAMES } from '../lib/api';
import type { ClientItem, ClientOrderStatus, InquiryItem } from '../types';

const isBlankOrNA = (val: string) => {
  const upper = val.trim().toUpperCase();
  return upper === '' || upper === 'N/A';
};

const ORDER_STATUS_STYLE: Record<ClientOrderStatus, string> = {
  Pending: 'bg-[#FFF7ED] text-[#C2410C]',
  Done: 'bg-[#F0FDF4] text-[#15803D]',
  Cancelled: 'bg-[#FEF2F2] text-[#DC2626]',
};

export function ClientsPage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [selectedDetail, setSelectedDetail] = useState<{
    client: ClientItem;
    inquiries: InquiryItem[];
  } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientItem | null>(null);
  const [fullName, setFullName] = useState('');
  const [orderItem, setOrderItem] = useState('N/A');
  const [quantity, setQuantity] = useState('N/A');
  const [totalPrice, setTotalPrice] = useState('N/A');
  const [reservationFee, setReservationFee] = useState('N/A');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderStatus, setOrderStatus] = useState<ClientOrderStatus>('Pending');
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ClientItem | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [reauthPin, setReauthPin] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadClients = useCallback(async () => {
    const qs = new URLSearchParams({
      scope: 'pending',
      search: search.trim(),
      sort: 'newest',
      page: String(page),
      pageSize: '15',
    });
    const data = await apiRequest<{ clients: ClientItem[]; total: number }>(
      `/api/admin/clients?${qs.toString()}`,
    );
    setClients(data.clients);
    setTotal(data.total);
  }, [search, page]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  async function inspectClient(id: string) {
    const data = await apiRequest<{ client: ClientItem; inquiries: InquiryItem[] }>(
      `/api/admin/clients/${encodeURIComponent(id)}`,
    );
    setSelectedDetail(data);
  }

  function openForm(client?: ClientItem) {
    setEditing(client ?? null);
    setFullName(client?.fullName ?? '');
    setOrderItem(client?.orderItem?.trim() ? client.orderItem : 'N/A');
    setQuantity(client ? String(client.quantity ?? 1) : 'N/A');
    setTotalPrice(
      typeof client?.totalPrice === 'number' && client.totalPrice > 0
        ? String(client.totalPrice)
        : 'N/A',
    );
    setReservationFee(
      typeof client?.reservationFee === 'number' && client.reservationFee > 0
        ? String(client.reservationFee)
        : 'N/A',
    );
    setOrderDate(
      client?.orderDate ?? (client?.createdAt.slice(0, 10) || new Date().toISOString().slice(0, 10)),
    );
    setOrderStatus(client?.orderStatus ?? 'Pending');
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSaveClient(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (fullName.trim().length < 2) {
      setFormError('Enter a valid customer name.');
      return;
    }

    const qtyNum = isBlankOrNA(quantity) ? 1 : Math.max(1, Math.round(Number(quantity) || 1));
    const priceNum = isBlankOrNA(totalPrice) ? 0 : Math.max(0, Number(totalPrice) || 0);
    const parsedRes = isBlankOrNA(reservationFee) ? 0 : Number(reservationFee);
    const resFeeVal =
      Number.isFinite(parsedRes) && parsedRes > 0 ? Math.max(0, parsedRes) : null;

    try {
      const payload = {
        fullName: fullName.trim(),
        contactInfo: editing?.contactInfo ?? '',
        notes: editing?.notes ?? '',
        orderItem: isBlankOrNA(orderItem) ? '' : orderItem.trim(),
        quantity: qtyNum,
        totalPrice: priceNum,
        reservationFee: resFeeVal,
        orderDate,
        orderStatus,
      };
      if (editing) {
        await apiRequest(`/api/admin/clients/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          body: payload,
        });
      } else {
        await apiRequest('/api/admin/clients', {
          method: 'POST',
          body: payload,
        });
      }
      setFormOpen(false);
      await loadClients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save client record.');
    }
  }

  async function handleConfirmDeleteClient(e: FormEvent) {
    e.preventDefault();
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const endpoint = `/api/admin/clients/${encodeURIComponent(deleteTarget.id)}`;
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
      await loadClients();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete client record.');
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Client Records</h1>
          <p className="mt-1 text-sm text-[#64748B]">View all client records and orders in one place</p>
        </div>
        <button type="button" onClick={() => openForm()} className="btn-admin-green">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Client
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search client, inquiry number, or item..."
          aria-label="Search client records"
          className="h-10 w-full rounded-xl border border-[#EAE6DF] bg-white pl-10 pr-4 text-sm text-[#0F172A]"
        />
      </div>

      {/* Client Records Table Card */}
      <div className="w-full overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-[#0F172A]">All Client</h2>
            <span className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#475569] tabular-nums">
              {total} {total === 1 ? 'client' : 'clients'}
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#F1F5F9] text-xs font-semibold text-[#64748B]">
              <tr>
                <th className="px-5 py-3.5 whitespace-nowrap">Inquiry number</th>
                <th className="px-4 py-3.5">Name</th>
                <th className="px-4 py-3.5">Inquiry Item</th>
                <th className="px-4 py-3.5">Quantity</th>
                <th className="px-4 py-3.5">Total Price</th>
                <th className="px-4 py-3.5">Reservation Fee</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Inquiry Date</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-base text-[#64748B]">
                    No pending client records right now.
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const st: ClientOrderStatus = client.orderStatus ?? 'Pending';
                  return (
                    <tr
                      key={client.id}
                      onClick={() => void inspectClient(client.id)}
                      className="hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      <td className="px-5 py-3.5 text-xs font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                        {client.referenceCode || `CL-${client.id.slice(0, 6).toUpperCase()}`}
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
                        {client.orderItem?.trim() || 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#0F172A] tabular-nums">
                        {client.quantity ?? 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-[#0F172A] tabular-nums">
                        {typeof client.totalPrice === 'number' && client.totalPrice > 0
                          ? `₱${client.totalPrice.toLocaleString()}`
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#0F172A] tabular-nums">
                        {typeof client.reservationFee === 'number' && client.reservationFee > 0
                          ? `₱${client.reservationFee.toLocaleString()}`
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                        {client.orderDate ?? client.createdAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ORDER_STATUS_STYLE[st]}`}
                        >
                          {st === 'Done' ? 'Completed' : st}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openForm(client)}
                            aria-label={`Edit ${client.fullName}`}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:bg-[#E0F2FE] active:text-[#0284C7] cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(client);
                              setNeedsPin(false);
                              setReauthPin('');
                              setDeleteError(null);
                            }}
                            aria-label={`Delete ${client.fullName}`}
                            className="rounded-lg p-2 text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationFooter
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>

      {/* Client History Detail Modal */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[#EAE6DF] bg-white p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-[#F1F5F9] pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">{selectedDetail.client.fullName}</h2>
                <p className="text-sm text-[#64748B]">{selectedDetail.client.contactInfo}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                aria-label="Close client history"
                className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                Inquiries ({selectedDetail.inquiries.length})
              </p>
              {selectedDetail.inquiries.length === 0 ? (
                <p className="mt-2 text-sm text-[#64748B]">No inquiries yet.</p>
              ) : (
                <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                  {selectedDetail.inquiries.map((inq) => (
                    <li key={inq.id} className="rounded-xl border border-[#EAE6DF] p-3 text-sm">
                      <div className="flex justify-between font-semibold text-[#0F172A]">
                        <span className="text-xs">
                          {inq.orderItem || SERVICE_NAMES[inq.serviceId] || inq.serviceId}
                        </span>
                        <span className="text-xs text-[#0369A1]">{inq.status}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-[#0F172A]">{inq.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right Slide-Over Add/Edit Client Drawer */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setFormOpen(false)}
        >
          <form
            onSubmit={handleSaveClient}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-l border-[#EAE6DF] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#F1F5F9] px-6 py-5">
              <h2 className="text-xl font-bold tracking-tight text-[#0F172A]">
                {editing ? 'Update Client' : 'Add Client'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close client drawer"
                className="rounded-xl p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {formError && (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#DC2626]">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="client-name" className="block text-xs font-semibold text-[#0F172A]">
                  Name
                </label>
                <input
                  id="client-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter customer full name"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="client-order-item" className="block text-xs font-semibold text-[#0F172A]">
                  Inquiry Item
                </label>
                <input
                  id="client-order-item"
                  value={orderItem}
                  onFocus={() => {
                    if (isBlankOrNA(orderItem)) setOrderItem('');
                  }}
                  onBlur={() => {
                    if (!orderItem.trim()) setOrderItem('N/A');
                  }}
                  onChange={(e) => setOrderItem(e.target.value)}
                  placeholder="N/A"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-qty" className="block text-xs font-semibold text-[#0F172A]">
                    Quantity
                  </label>
                  <input
                    id="client-qty"
                    type="text"
                    inputMode="numeric"
                    value={quantity}
                    onFocus={() => {
                      if (isBlankOrNA(quantity)) setQuantity('');
                    }}
                    onBlur={() => {
                      if (!quantity.trim()) setQuantity('N/A');
                    }}
                    onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                    placeholder="N/A"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="client-price" className="block text-xs font-semibold text-[#0F172A]">
                    Total Price (₱)
                  </label>
                  <input
                    id="client-price"
                    type="text"
                    inputMode="decimal"
                    value={totalPrice}
                    onFocus={() => {
                      if (isBlankOrNA(totalPrice)) setTotalPrice('');
                    }}
                    onBlur={() => {
                      if (!totalPrice.trim()) setTotalPrice('N/A');
                    }}
                    onChange={(e) => setTotalPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="N/A"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-reservation" className="block text-xs font-semibold text-[#0F172A]">
                  Reservation Fee (₱)
                </label>
                <input
                  id="client-reservation"
                  type="text"
                  inputMode="decimal"
                  value={reservationFee}
                  onFocus={() => {
                    if (isBlankOrNA(reservationFee)) setReservationFee('');
                  }}
                  onBlur={() => {
                    if (!reservationFee.trim()) setReservationFee('N/A');
                  }}
                  onChange={(e) => setReservationFee(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="N/A"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-order-date" className="block text-xs font-semibold text-[#0F172A]">
                    Inquiry Date
                  </label>
                  <input
                    id="client-order-date"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="client-order-status" className="block text-xs font-semibold text-[#0F172A]">
                    Status
                  </label>
                  <select
                    id="client-order-status"
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value as ClientOrderStatus)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Done">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-[#F1F5F9] px-6 py-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] cursor-pointer"
              >
                Cancel
              </button>
              <button type="submit" className="btn-admin-submit">
                Save Record
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteTarget(null)}
        >
          <form
            onSubmit={handleConfirmDeleteClient}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0F172A]">Delete Client Record?</h2>
            <p className="text-sm leading-relaxed text-[#64748B]">
              This permanently removes {deleteTarget.fullName} from Client Records while preserving
              message threads in Message Management.
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
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
