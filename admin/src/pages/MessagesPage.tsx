import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Check,
  ImagePlus,
  Inbox,
  MoreVertical,
  Palette,
  Phone,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, apiRequest, formatDateTime, SERVICE_NAMES } from '../lib/api';
import type { ClientItem, InquiryItem } from '../types';

type InboxTab = 'all' | 'requests' | 'archive' | 'history';

const INBOX_TABS: ReadonlyArray<{ id: InboxTab; label: string; folder: string }> = [
  { id: 'all', label: 'All Messages', folder: 'active' },
  { id: 'requests', label: 'Message Requests', folder: 'requests' },
  { id: 'archive', label: 'Archive', folder: 'archive' },
  { id: 'history', label: 'Message History', folder: 'history' },
];

const BUBBLE_THEMES = [
  { id: 'sky', label: 'Sky Blue', bubbleBg: '#E0F2FE', bubbleText: '#0C4A6E', btnBg: '#0EA5E9' },
  { id: 'ocean', label: 'Ocean', bubbleBg: '#BAE6FD', bubbleText: '#075985', btnBg: '#0284C7' },
  { id: 'teal', label: 'Teal', bubbleBg: '#CCFBF1', bubbleText: '#115E59', btnBg: '#0D9488' },
  { id: 'indigo', label: 'Indigo', bubbleBg: '#E0E7FF', bubbleText: '#312E81', btnBg: '#4F46E5' },
  { id: 'slate', label: 'Charcoal', bubbleBg: '#E2E8F0', bubbleText: '#0F172A', btnBg: '#334155' },
] as const;

const ADMIN_EMOJIS = [0x1f44d, 0x1f60a, 0x1f64f, 0x2705, 0x1f4e6, 0x2728].map((cp) =>
  String.fromCodePoint(cp),
);

const THEME_STORAGE_KEY = 'rjhub_admin_chat_theme_v1';

function countUnreadCustomerMessages(inq: InquiryItem): number {
  const lastAdminReply = [...inq.responses].reverse().find((r) => r.senderRole === 'admin');
  const cutoffMs = Math.max(
    lastAdminReply ? new Date(lastAdminReply.respondedAt).getTime() : 0,
    inq.adminSeenAt ? new Date(inq.adminSeenAt).getTime() : 0,
  );
  const initialCount = new Date(inq.submittedAt).getTime() > cutoffMs ? 1 : 0;
  const followUpCount = inq.responses.filter(
    (r) => r.senderRole === 'customer' && new Date(r.respondedAt).getTime() > cutoffMs,
  ).length;
  return initialCount + followUpCount;
}

function isUnreadForAdmin(inq: InquiryItem): boolean {
  return countUnreadCustomerMessages(inq) > 0;
}

function splitContactParts(
  inquiry: InquiryItem,
  clientContact?: string,
): { email: string; phone: string } {
  const customerMsgTexts = inquiry.responses
    .filter((r) => r.senderRole === 'customer')
    .map((r) => r.responseText)
    .join(' ');
  const contactSource = [
    clientContact ?? '',
    inquiry.customerContactSnapshot,
    inquiry.customerEmail ?? '',
  ].join(' · ');
  const fullPhoneSource = `${contactSource} · ${inquiry.message} · ${customerMsgTexts}`
    .replace(/[\s()-]/g, '')
    .replace(/(?:\+?63)(9\d{9})/g, '0$1');

  const normalizedEmailSource = contactSource.replace(
    /google\.customer@gmail\.com/gi,
    'googlecustomer@gmail.com',
  );
  const emailMatch = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(normalizedEmailSource);
  const phoneMatch = /0\d{9,10}/.exec(fullPhoneSource);
  return {
    email: emailMatch?.[0]?.toLowerCase() ?? '',
    phone: phoneMatch?.[0] ?? '',
  };
}

function CustomerAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-full border border-[#E2E8F0] bg-white object-cover"
      />
    );
  }
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-xs font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id') || '';

  const [tab, setTab] = useState<InboxTab>('all');
  const [search, setSearch] = useState('');
  const [inquiries, setInquiries] = useState<InquiryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [detail, setDetail] = useState<{
    inquiry: InquiryItem;
    client: ClientItem | null;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyImageDataUrl, setReplyImageDataUrl] = useState<string | undefined>(undefined);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) || 'sky';
    } catch {
      return 'sky';
    }
  });
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteConfirmMode, setDeleteConfirmMode] = useState<'history_all' | 'single' | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [reauthPin, setReauthPin] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const activeTheme = BUBBLE_THEMES.find((t) => t.id === themeId) ?? BUBBLE_THEMES[0];

  useEffect(() => {
    if (!settingsMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsMenuOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsMenuOpen]);

  const loadList = useCallback(async () => {
    const folder = INBOX_TABS.find((t) => t.id === tab)?.folder ?? 'active';
    const qs = new URLSearchParams();
    qs.set('folder', folder);
    if (search.trim()) qs.set('search', search.trim());
    const data = await apiRequest<{ inquiries: InquiryItem[] }>(`/api/admin/inquiries?${qs.toString()}`);
    setInquiries(data.inquiries);
    setSelectedId((prev) => {
      if (prev && data.inquiries.some((i) => i.id === prev)) return prev;
      return data.inquiries[0]?.id ?? '';
    });
  }, [tab, search]);

  const markSeen = useCallback(async (id: string) => {
    try {
      await apiRequest(`/api/admin/inquiries/${encodeURIComponent(id)}/seen`, {
        method: 'POST',
      });
      setInquiries((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, adminSeenAt: new Date().toISOString() } : item,
        ),
      );
    } catch {
      // Non-blocking seen marker
    }
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) {
        setDetail(null);
        return;
      }
      try {
        const data = await apiRequest<{
          inquiry: InquiryItem;
          client: ClientItem | null;
        }>(`/api/admin/inquiries/${encodeURIComponent(id)}`);
        setDetail(data);
        if (isUnreadForAdmin(data.inquiry)) {
          void markSeen(data.inquiry.id);
        }
      } catch {
        setDetail(null);
      }
    },
    [markSeen],
  );

  useEffect(() => {
    void loadList();
    const interval = window.setInterval(() => {
      void loadList();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    void loadDetail(selectedId);
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      void loadDetail(selectedId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedId, loadDetail]);

  function selectTheme(id: string) {
    setThemeId(id);
    setSettingsMenuOpen(false);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Ignore storage errors
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Please choose a photo under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReplyImageDataUrl(reader.result);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAcceptInquiry() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setError(null);
    setSettingsMenuOpen(false);
    try {
      await apiRequest(`/api/admin/inquiries/${encodeURIComponent(detail.inquiry.id)}/accept`, {
        method: 'POST',
      });
      await Promise.all([loadDetail(detail.inquiry.id), loadList()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept message.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleArchive() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setError(null);
    setSettingsMenuOpen(false);
    const nextArchived = !detail.inquiry.isArchived;
    try {
      await apiRequest(`/api/admin/inquiries/${encodeURIComponent(detail.inquiry.id)}/archive`, {
        method: 'POST',
        body: { archived: nextArchived },
      });
      if (nextArchived && tab !== 'archive') {
        setSelectedId('');
        setDetail(null);
      } else {
        await loadDetail(detail.inquiry.id);
      }
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update archive status.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleBlock() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    setError(null);
    setSettingsMenuOpen(false);
    const nextBlocked = !detail.inquiry.isBlocked;
    try {
      await apiRequest(`/api/admin/inquiries/${encodeURIComponent(detail.inquiry.id)}/block`, {
        method: 'POST',
        body: { blocked: nextBlocked },
      });
      if (nextBlocked && tab !== 'history') {
        setSelectedId('');
        setDetail(null);
      } else {
        await loadDetail(detail.inquiry.id);
      }
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update block status.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!detail || sending || (!replyText.trim() && !replyImageDataUrl)) return;
    setSending(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/inquiries/${encodeURIComponent(detail.inquiry.id)}/responses`, {
        method: 'POST',
        body: {
          responseText: replyText.trim(),
          imageDataUrl: replyImageDataUrl,
          nextStatus: 'Answered',
        },
      });
      setReplyText('');
      setReplyImageDataUrl(undefined);
      setEmojiOpen(false);
      await Promise.all([loadDetail(detail.inquiry.id), loadList()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  }

  async function handleConfirmDeleteMessages(e: FormEvent) {
    e.preventDefault();
    if (clearingHistory || !deleteConfirmMode) return;
    setClearingHistory(true);
    setClearError(null);
    const endpoint =
      deleteConfirmMode === 'single' && detail
        ? `/api/admin/inquiries/${encodeURIComponent(detail.inquiry.id)}`
        : '/api/admin/inquiries/history/all';
    try {
      try {
        await apiRequest(endpoint, { method: 'DELETE' });
      } catch (err) {
        if (err instanceof ApiError && err.data.requireReauth) {
          if (reauthPin.length !== 6) {
            setNeedsPin(true);
            setClearError('Enter your 6-digit security PIN to confirm.');
            setClearingHistory(false);
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
      setDeleteConfirmMode(null);
      setNeedsPin(false);
      setReauthPin('');
      setSelectedId('');
      setDetail(null);
      await loadList();
    } catch (err) {
      setClearError(
        err instanceof Error
          ? err.message
          : deleteConfirmMode === 'single'
            ? 'Unable to delete message.'
            : 'Unable to delete message history.',
      );
    } finally {
      setClearingHistory(false);
    }
  }

  const headerContact = detail
    ? splitContactParts(detail.inquiry, detail.client?.contactInfo)
    : { email: '', phone: '' };

  return (
    <div className="flex flex-1 flex-col w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Message Management</h1>
          <p className="mt-1 text-sm text-[#64748B]">Here are your customer messages</p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Message views">
          {INBOX_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'all') {
                    searchParams.delete('status');
                    setSearchParams(searchParams, { replace: true });
                  }
                }}
                className={`rounded-xl border px-4 py-2 text-xs transition-colors cursor-pointer ${
                  active
                    ? 'border-[#38BDF8] bg-[#38BDF8] font-semibold text-[#0F172A]'
                    : 'border-[#E2E8F0] bg-white font-medium text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:border-[#38BDF8] active:bg-[#E0F2FE] active:text-[#0284C7]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {tab === 'history' && (
            <button
              type="button"
              disabled={inquiries.length === 0}
              onClick={() => {
                setDeleteConfirmMode('history_all');
                setNeedsPin(false);
                setReauthPin('');
                setClearError(null);
              }}
              className={`btn-admin-danger py-2 px-3.5 text-xs ${deleteConfirmMode === 'history_all' ? 'is-active' : ''}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete All
            </button>
          )}
        </div>
      </div>

      {/* Spanned Full-Viewport 2-Column Inbox */}
      <div className="grid flex-1 min-h-[calc(100vh-11.5rem)] w-full overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white lg:grid-cols-12">
        <div className="flex flex-col border-b border-[#EAE6DF] lg:col-span-4 lg:border-b-0 lg:border-r">
          <div className="border-b border-[#F1F5F9] p-3.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer or message..."
                aria-label="Search messages"
                className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#FAF8F5] pl-9 pr-3 text-sm text-[#0F172A]"
              />
            </div>
          </div>

          <div className="flex-1 divide-y divide-[#F1F5F9] overflow-y-auto">
            {inquiries.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Inbox className="h-6 w-6 text-[#94A3B8]" strokeWidth={1.5} />
                <p className="mt-2 text-sm font-medium text-[#0F172A]">
                  {tab === 'history'
                    ? 'No archived message history yet'
                    : tab === 'archive'
                      ? 'No archived conversations yet'
                      : tab === 'requests'
                        ? 'No pending message requests'
                        : 'No active customer messages'}
                </p>
              </div>
            ) : (
              inquiries.map((inq) => {
                const active = inq.id === selectedId;
                const unreadCount = countUnreadCustomerMessages(inq);
                const unread = unreadCount > 0;
                const lastResp = inq.responses[inq.responses.length - 1];
                const rawPreview = lastResp
                  ? lastResp.responseText || 'Sent a photo'
                  : inq.message;
                const previewText =
                  lastResp?.senderRole === 'admin' ? `You: ${rawPreview}` : rawPreview;

                return (
                  <button
                    key={inq.id}
                    type="button"
                    onClick={() => setSelectedId(inq.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#E0F2FE]/65'
                        : 'hover:bg-[#F1F5F9] active:bg-[#E0F2FE]/65'
                    }`}
                  >
                    <CustomerAvatar
                      name={inq.customerNameSnapshot}
                      avatarUrl={inq.customerAvatarUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-sm ${
                            unread
                              ? 'font-bold text-[#0A0A0A]'
                              : 'font-medium text-[#334155]'
                          }`}
                        >
                          {inq.customerNameSnapshot}
                        </p>
                        <span className="shrink-0 text-[11px] text-[#94A3B8] tabular-nums">
                          {formatDateTime(inq.updatedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-xs ${
                            unread ? 'font-bold text-[#0A0A0A]' : 'font-normal text-[#64748B]'
                          }`}
                        >
                          {previewText}
                        </p>
                        {unreadCount >= 2 && (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-[#0A0A0A] px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                            {unreadCount} new messages
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col lg:col-span-8">
          {!detail ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <p className="text-base font-medium text-[#0F172A]">Select a customer conversation</p>
              <p className="mt-1 text-sm text-[#64748B]">
                Messages, photos, customer contact details, and reply controls appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] px-6 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <CustomerAvatar
                    name={detail.inquiry.customerNameSnapshot}
                    avatarUrl={detail.inquiry.customerAvatarUrl}
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-[#0F172A]">
                      {detail.inquiry.customerNameSnapshot}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 truncate text-xs text-[#64748B]">
                      <span>
                        {detail.inquiry.orderItem ||
                          SERVICE_NAMES[detail.inquiry.serviceId] ||
                          detail.inquiry.serviceId}
                      </span>
                      {headerContact.email && <span>{headerContact.email}</span>}
                    </p>
                    {headerContact.phone && (
                      <a
                        href={`tel:${headerContact.phone}`}
                        title={`Call ${headerContact.phone}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#334155] tabular-nums transition-colors hover:text-[#0284C7] hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" aria-hidden="true" />
                        <span>({headerContact.phone})</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Status Badge + 3-Dot Conversation Settings (Message Request + Theme Color) */}
                <div ref={menuContainerRef} className="relative flex items-center gap-2">
                  {detail.inquiry.isBlocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] px-2.5 py-1 text-xs font-semibold text-[#DC2626]">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      Blocked
                    </span>
                  )}
                  {detail.inquiry.isArchived && !detail.inquiry.isBlocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#475569]">
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archived
                    </span>
                  )}
                  {detail.inquiry.acceptedAt && !detail.inquiry.isBlocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] px-2.5 py-1 text-xs font-semibold text-[#15803D]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Accepted
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setSettingsMenuOpen((prev) => !prev)}
                    aria-label="Conversation settings"
                    aria-expanded={settingsMenuOpen}
                    aria-haspopup="menu"
                    title="Message settings"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                      settingsMenuOpen
                        ? 'border-[#38BDF8] bg-[#E0F2FE] text-[#0284C7]'
                        : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {settingsMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Conversation settings menu"
                      className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white p-1.5 shadow-xl"
                    >
                      <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                        Message Request
                      </p>

                      {!detail.inquiry.acceptedAt && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={actionBusy}
                          onClick={() => void handleAcceptInquiry()}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#15803D] hover:bg-[#F0FDF4] disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                          Accept
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitem"
                        disabled={actionBusy}
                        onClick={() => void handleToggleArchive()}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A] disabled:opacity-50 cursor-pointer"
                      >
                        {detail.inquiry.isArchived ? (
                          <ArchiveRestore className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        {detail.inquiry.isArchived ? 'Unarchive' : 'Archive'}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        disabled={actionBusy}
                        onClick={() => void handleToggleBlock()}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#B45309] hover:bg-[#FFFBEB] disabled:opacity-50 cursor-pointer"
                      >
                        <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {detail.inquiry.isBlocked ? 'Unblock Customer' : 'Block Customer'}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        disabled={actionBusy}
                        onClick={() => {
                          setSettingsMenuOpen(false);
                          setDeleteConfirmMode('single');
                          setNeedsPin(false);
                          setReauthPin('');
                          setClearError(null);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Delete
                      </button>

                      <div className="my-1.5 border-t border-[#F1F5F9]" />

                      <div className="px-3 py-1.5">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                          <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                          Theme Color
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          {BUBBLE_THEMES.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={themeId === t.id}
                              onClick={() => selectTheme(t.id)}
                              aria-label={`Select ${t.label} theme`}
                              title={t.label}
                              style={{ backgroundColor: t.btnBg }}
                              className={`h-6 w-6 rounded-full cursor-pointer transition-transform hover:scale-110 ${
                                themeId === t.id ? 'ring-2 ring-offset-2 ring-[#0F172A]' : ''
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-[#FAF8F5]/60 p-6">
                <div className="flex flex-col items-start gap-1">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-[#EAE6DF] bg-white px-4 py-3 text-sm text-[#0F172A]">
                    <p className="whitespace-pre-wrap">{detail.inquiry.message}</p>
                  </div>
                  <span className="px-1 text-[11px] text-[#94A3B8] tabular-nums">
                    {detail.inquiry.customerNameSnapshot} · {formatDateTime(detail.inquiry.submittedAt)}
                  </span>
                </div>

                {detail.inquiry.responses.map((resp) => {
                  const isAdmin = resp.senderRole === 'admin';
                  return (
                    <div
                      key={resp.id}
                      className={`flex flex-col gap-1 ${isAdmin ? 'items-end' : 'items-start'}`}
                    >
                      {resp.imageDataUrl && (
                        <img
                          src={resp.imageDataUrl}
                          alt="Message attachment"
                          className="max-h-56 rounded-xl border border-[#EAE6DF] bg-white object-contain"
                        />
                      )}
                      {resp.responseText && (
                        <div
                          style={
                            isAdmin
                              ? { backgroundColor: activeTheme.bubbleBg, color: activeTheme.bubbleText }
                              : undefined
                          }
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                            isAdmin
                              ? 'rounded-tr-sm'
                              : 'rounded-tl-sm border border-[#EAE6DF] bg-white text-[#0F172A]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{resp.responseText}</p>
                        </div>
                      )}
                      <span className="px-1 text-[11px] text-[#94A3B8] tabular-nums">
                        {isAdmin ? 'You' : resp.adminDisplayName} · {formatDateTime(resp.respondedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSendReply} className="border-t border-[#F1F5F9] bg-white p-4 space-y-2.5">
                {error && <p className="text-xs font-medium text-[#DC2626]">{error}</p>}

                {replyImageDataUrl && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#FAF8F5] p-1.5">
                    <img
                      src={replyImageDataUrl}
                      alt="Pending attachment"
                      className="h-11 w-11 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setReplyImageDataUrl(undefined)}
                      aria-label="Remove attachment"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[#64748B] hover:bg-[#E2E8F0] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {emojiOpen && (
                  <div className="inline-flex items-center gap-1 rounded-xl border border-[#EAE6DF] bg-[#FAF8F5] px-2.5 py-1.5">
                    {ADMIN_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setReplyText((prev) => `${prev}${em}`)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-white cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write an administrator response..."
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#FAF8F5] px-4 py-2.5 text-sm text-[#0F172A]"
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                  tabIndex={-1}
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Upload photo"
                      title="Upload photo"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:border-[#38BDF8] active:bg-[#E0F2FE] active:text-[#0284C7] cursor-pointer"
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmojiOpen((prev) => !prev)}
                      aria-label="Add emoji"
                      aria-expanded={emojiOpen}
                      title="Add emoji"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:border-[#38BDF8] active:bg-[#E0F2FE] active:text-[#0284C7] cursor-pointer"
                    >
                      <Smile className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={sending || (!replyText.trim() && !replyImageDataUrl)}
                    style={{ backgroundColor: activeTheme.btnBg, borderColor: activeTheme.btnBg }}
                    className="btn-admin-submit"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {sending ? 'Sending...' : 'Send Response'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {deleteConfirmMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteConfirmMode(null)}
        >
          <form
            onSubmit={handleConfirmDeleteMessages}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0F172A]">
              {deleteConfirmMode === 'single'
                ? 'Delete Customer Conversation?'
                : 'Delete All Message History?'}
            </h2>
            <p className="text-sm leading-relaxed text-[#64748B]">
              {deleteConfirmMode === 'single'
                ? `This permanently deletes the message conversation with ${detail?.inquiry.customerNameSnapshot ?? 'this customer'}.`
                : 'This permanently clears all archived and replied inquiry conversations from Message History.'}
            </p>
            {clearError && <p className="text-xs font-medium text-[#DC2626]">{clearError}</p>}
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
                onClick={() => setDeleteConfirmMode(null)}
                className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={clearingHistory}
                className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
              >
                {clearingHistory
                  ? 'Deleting...'
                  : deleteConfirmMode === 'single'
                    ? 'Delete'
                    : 'Delete All'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
