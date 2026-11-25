import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  localAuthService,
  localCustomerPrefsService,
  localRepository,
} from '../services/localRepository';
import type { InquiryStatusCounts, StoreSnapshot } from '../services/repository';
import type {
  AdminCreateDraft,
  AdminLoginDraft,
  AdminSession,
  ChatDraftPayload,
  ClientDraft,
  Customer,
  CustomerSession,
  Inquiry,
  InquiryDraft,
  InquiryFilters,
  InquiryResponse,
  InquiryStatus,
  ProfileUpdateDraft,
  ServiceItem,
} from '../types/domain';

interface AppStoreContextValue {
  services: readonly ServiceItem[];
  customers: Customer[];
  inquiries: Inquiry[];
  publicInquiryCount: number;
  statusCounts: InquiryStatusCounts;
  session: AdminSession | null;
  customerSession: CustomerSession | null;
  isAuthenticated: boolean;
  signInPromptOpen: boolean;
  openSignInPrompt: () => void;
  closeSignInPrompt: () => void;
  favoriteServiceIds: string[];
  favoriteQuantities: Record<string, number>;
  toggleFavoriteService: (serviceId: string) => void;
  setFavoriteQuantity: (serviceId: string, quantity: number) => void;
  isChatOpen: boolean;
  chatServiceId: string;
  activeChatInquiryId: string | null;
  pendingChatDraft: ChatDraftPayload | null;
  setActiveChatInquiryId: (id: string | null) => void;
  openInquiryChat: (serviceId?: string, draft?: ChatDraftPayload) => void;
  clearPendingChatDraft: () => void;
  closeInquiryChat: () => void;
  listInquiries: (filters?: InquiryFilters) => Inquiry[];
  getInquiryById: (id: string) => Inquiry | undefined;
  createInquiry: (draft: InquiryDraft) => Inquiry;
  updateInquiry: (id: string, draft: InquiryDraft) => Inquiry;
  updateInquiryStatus: (id: string, status: InquiryStatus) => Inquiry;
  addInquiryReply: (
    inquiryId: string,
    responseText: string,
    nextStatus?: InquiryStatus,
    imageDataUrl?: string,
  ) => { inquiry: Inquiry; response: InquiryResponse };
  addCustomerMessage: (
    inquiryId: string,
    messageText: string,
    senderName?: string,
    imageDataUrl?: string,
    reservationOpts?: {
      wantsReservation?: boolean;
      reservationFee?: number | null;
      serviceId?: string;
      serviceNames?: string[];
      quantity?: number;
    },
  ) => { inquiry: Inquiry; response: InquiryResponse };
  syncActiveInquiryFromBackend: (referenceCode: string) => Promise<void>;
  listClients: (search?: string) => Customer[];
  getClientById: (id: string) => Customer | undefined;
  getClientInquiries: (clientId: string) => Inquiry[];
  createClient: (draft: ClientDraft) => Customer;
  updateClient: (id: string, draft: ClientDraft) => Customer;
  deleteClient: (id: string) => { deletedClientId: string; archivedInquiryCount: number };
  resetDemoData: () => void;
  signIn: (credentials: AdminLoginDraft) => AdminSession;
  registerAdmin: (draft: AdminCreateDraft) => AdminSession;
  signOut: () => void;
  signInCustomerWithGoogle: (fullName?: string, email?: string, avatarDataUrl?: string) => CustomerSession;
  updateProfile: (patch: ProfileUpdateDraft) => void;
  signOutCustomer: () => void;
}

const ACTIVE_CHAT_INQUIRY_KEY = 'rjhub_active_chat_inquiry_v1';
const FAVORITE_QTY_KEY = 'rjhub_favorite_quantities_v1';
const PUBLIC_INQUIRY_COUNT_KEY = 'rjhub_public_inquiry_count_v1';
const IS_JSDOM_ENV = typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom');

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot>(() => localRepository.getSnapshot());
  const [session, setSession] = useState<AdminSession | null>(() => localAuthService.getSession());
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(() =>
    localCustomerPrefsService.getCustomerSession(),
  );
  const [favoriteServiceIds, setFavoriteServiceIds] = useState<string[]>(() =>
    localCustomerPrefsService.getFavorites(),
  );
  const [favoriteQuantities, setFavoriteQuantities] = useState<Record<string, number>>(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_QTY_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
          clean[k] = Math.min(999, Math.round(v));
        }
      }
      return clean;
    } catch {
      return {};
    }
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);
  const [chatServiceId, setChatServiceId] = useState(() => customerSession?.defaultServiceId ?? '');
  const [pendingChatDraft, setPendingChatDraft] = useState<ChatDraftPayload | null>(null);
  const [activeChatInquiryId, setActiveChatInquiryIdState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_CHAT_INQUIRY_KEY);
    } catch {
      return null;
    }
  });
  const [publicInquiryCount, setPublicInquiryCount] = useState<number>(() => {
    try {
      const saved = Number(window.localStorage.getItem(PUBLIC_INQUIRY_COUNT_KEY) ?? '0');
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {
      // ignore
    }
    return snapshot.inquiries.reduce((sum, i) => sum + 1 + i.responses.filter((r) => r.senderRole === 'customer').length, 0);
  });

  useEffect(() => {
    if (IS_JSDOM_ENV || typeof fetch !== 'function') return;
    fetch('/api/health', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { totalInquiries?: number } | null) => {
        if (d && typeof d.totalInquiries === 'number') {
          setPublicInquiryCount(d.totalInquiries);
          try {
            window.localStorage.setItem(PUBLIC_INQUIRY_COUNT_KEY, String(d.totalInquiries));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!customerSession) return;
    const emailNorm = customerSession.email.trim().toLowerCase();
    const nameNorm = customerSession.fullName.trim().toLowerCase();
    const localMatch = localRepository.listInquiries().find((i) => {
      if (emailNorm && i.customerContactSnapshot.toLowerCase().includes(emailNorm)) return true;
      return Boolean(nameNorm && i.customerNameSnapshot.trim().toLowerCase() === nameNorm);
    });
    if (localMatch && !activeChatInquiryId) {
      setActiveChatInquiryIdState(localMatch.id);
    }
    if (IS_JSDOM_ENV || typeof fetch !== 'function') return;
    const qs = new URLSearchParams({
      ...(customerSession.email ? { email: customerSession.email } : {}),
      ...(customerSession.fullName ? { name: customerSession.fullName } : {}),
    });
    fetch(`/api/inquiries/by-customer?${qs.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { inquiry?: Parameters<typeof localRepository.upsertRemoteInquiry>[0] | null } | null) => {
        if (data?.inquiry) {
          const synced = localRepository.upsertRemoteInquiry(data.inquiry);
          setSnapshot(localRepository.getSnapshot());
          setActiveChatInquiryIdState(synced.id);
          try {
            window.localStorage.setItem(ACTIVE_CHAT_INQUIRY_KEY, synced.id);
          } catch {
            // ignore
          }
        } else if (data && data.inquiry === null && localMatch) {
          const ageMs = Date.now() - new Date(localMatch.submittedAt).getTime();
          if (ageMs > 10_000 && localRepository.removeInquiryByRef(localMatch.referenceCode)) {
            setSnapshot(localRepository.getSnapshot());
            setActiveChatInquiryIdState(null);
            try {
              window.localStorage.removeItem(ACTIVE_CHAT_INQUIRY_KEY);
            } catch {
              // ignore
            }
          }
        }
      })
      .catch(() => undefined);
  }, [customerSession, activeChatInquiryId]);

  const setActiveChatInquiryId = useCallback((id: string | null) => {
    setActiveChatInquiryIdState(id);
    try {
      if (id) {
        window.localStorage.setItem(ACTIVE_CHAT_INQUIRY_KEY, id);
      } else {
        window.localStorage.removeItem(ACTIVE_CHAT_INQUIRY_KEY);
      }
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, []);

  const isAuthenticated = Boolean(customerSession || session);

  const openSignInPrompt = useCallback(() => {
    setSignInPromptOpen(true);
  }, []);

  const closeSignInPrompt = useCallback(() => {
    setSignInPromptOpen(false);
  }, []);

  const openInquiryChat = useCallback(
    (serviceId = '', draft?: ChatDraftPayload) => {
      if (!customerSession && !session) {
        setSignInPromptOpen(true);
        return;
      }
      const target = serviceId || customerSession?.defaultServiceId || '';
      if (target) {
        setChatServiceId(target);
      }
      if (draft) {
        setPendingChatDraft(draft);
      }
      setIsChatOpen(true);
    },
    [customerSession, session],
  );

  const clearPendingChatDraft = useCallback(() => {
    setPendingChatDraft(null);
  }, []);

  const closeInquiryChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const toggleFavoriteService = useCallback(
    (serviceId: string) => {
      if (!customerSession && !session) {
        setSignInPromptOpen(true);
        return;
      }
      const nextIds = localCustomerPrefsService.toggleFavorite(serviceId);
      setFavoriteServiceIds(nextIds);
      setFavoriteQuantities((prev) => {
        const next = { ...prev };
        if (nextIds.includes(serviceId)) {
          next[serviceId] = prev[serviceId] ?? 1;
        } else {
          delete next[serviceId];
        }
        try {
          window.localStorage.setItem(FAVORITE_QTY_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    },
    [customerSession, session],
  );

  const setFavoriteQuantity = useCallback((serviceId: string, quantity: number) => {
    const clamped = Math.min(999, Math.max(1, Math.round(Number(quantity) || 1)));
    setFavoriteQuantities((prev) => {
      const next = { ...prev, [serviceId]: clamped };
      try {
        window.localStorage.setItem(FAVORITE_QTY_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const refreshSnapshot = useCallback(() => {
    setSnapshot(localRepository.getSnapshot());
  }, []);

  const services = useMemo(() => localRepository.getServices(), []);

  const statusCounts = useMemo<InquiryStatusCounts>(() => {
    let pending = 0;
    let answered = 0;
    let completed = 0;
    for (const inquiry of snapshot.inquiries) {
      if (inquiry.status === 'Pending') pending += 1;
      else if (inquiry.status === 'Answered') answered += 1;
      else if (inquiry.status === 'Completed') completed += 1;
    }
    return {
      total: snapshot.inquiries.length,
      pending,
      answered,
      completed,
    };
  }, [snapshot.inquiries]);

  const listInquiries = useCallback(
    (filters?: InquiryFilters) => localRepository.listInquiries(filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot],
  );

  const getInquiryById = useCallback(
    (id: string) => snapshot.inquiries.find((inquiry) => inquiry.id === id),
    [snapshot.inquiries],
  );

  const createInquiry = useCallback(
    (draft: InquiryDraft) => {
      const created = localRepository.createInquiry(draft);
      refreshSnapshot();
      setPublicInquiryCount((prev) => {
        const next = prev + 1;
        try {
          window.localStorage.setItem(PUBLIC_INQUIRY_COUNT_KEY, String(next));
        } catch {
          // ignore
        }
        return next;
      });
      if (
        typeof fetch === 'function' &&
        (typeof navigator === 'undefined' || !navigator.userAgent?.includes('jsdom'))
      ) {
        void (async () => {
          try {
            const res = await fetch('/api/inquiries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                customerName: draft.customerName,
                contactInfo: draft.contactInfo,
                email: draft.email,
                serviceId: draft.serviceId,
                message: draft.message,
                quantity: draft.quantity ?? 1,
                wantsReservation: draft.wantsReservation ?? false,
                reservationFee: draft.reservationFee ?? null,
                imageDataUrl: draft.imageDataUrl ?? undefined,
                referenceCode: created.referenceCode,
                avatarUrl: customerSession?.avatarDataUrl ?? undefined,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as {
                inquiry?: Parameters<typeof localRepository.upsertRemoteInquiry>[0];
              };
              if (data.inquiry) {
                const synced = localRepository.upsertRemoteInquiry(data.inquiry);
                refreshSnapshot();
                setActiveChatInquiryId(synced.id);
              }
            }
          } catch {
            // Keep local optimistic inquiry when offline
          }
        })();
      }
      return created;
    },
    [customerSession?.avatarDataUrl, refreshSnapshot, setActiveChatInquiryId],
  );

  const updateInquiry = useCallback(
    (id: string, draft: InquiryDraft) => {
      const updated = localRepository.updateInquiry(id, draft);
      refreshSnapshot();
      return updated;
    },
    [refreshSnapshot],
  );

  const updateInquiryStatus = useCallback(
    (id: string, status: InquiryStatus) => {
      const updated = localRepository.updateInquiryStatus(id, status);
      refreshSnapshot();
      return updated;
    },
    [refreshSnapshot],
  );

  const addInquiryReply = useCallback(
    (inquiryId: string, responseText: string, nextStatus?: InquiryStatus, imageDataUrl?: string) => {
      const result = localRepository.addInquiryReply(
        inquiryId,
        responseText,
        nextStatus,
        imageDataUrl,
      );
      refreshSnapshot();
      return result;
    },
    [refreshSnapshot],
  );

  const addCustomerMessage = useCallback(
    (
      inquiryId: string,
      messageText: string,
      senderName?: string,
      imageDataUrl?: string,
      reservationOpts?: {
        wantsReservation?: boolean;
        reservationFee?: number | null;
        serviceId?: string;
        serviceNames?: string[];
        quantity?: number;
      },
    ) => {
      const result = localRepository.addCustomerMessage(
        inquiryId,
        messageText,
        senderName,
        imageDataUrl,
        reservationOpts,
      );
      refreshSnapshot();
      if (
        typeof fetch === 'function' &&
        (typeof navigator === 'undefined' || !navigator.userAgent?.includes('jsdom'))
      ) {
        void (async () => {
          try {
            const res = await fetch(
              `/api/inquiries/by-ref/${encodeURIComponent(result.inquiry.referenceCode)}/messages`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  messageText,
                  senderName,
                  imageDataUrl,
                  wantsReservation: reservationOpts?.wantsReservation,
                  reservationFee: reservationOpts?.reservationFee,
                  serviceId: reservationOpts?.serviceId,
                  serviceNames: reservationOpts?.serviceNames,
                  quantity: reservationOpts?.quantity,
                }),
              },
            );
            if (res.status === 404) {
              const phonePart = /0\d{9,10}/.exec(
                result.inquiry.customerContactSnapshot.replace(/[\s()-]/g, ''),
              )?.[0];
              const emailPart =
                customerSession?.email ||
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(
                  result.inquiry.customerContactSnapshot,
                )?.[0];
              const trimmedMsg = messageText.trim();
              const safeMsg =
                trimmedMsg.length >= 10
                  ? trimmedMsg
                  : result.inquiry.message.length >= 10
                    ? `${result.inquiry.message}${trimmedMsg ? `\nFollow-up: ${trimmedMsg}` : ''}`
                    : `Customer inquiry: ${trimmedMsg || 'Attached image'}`;
              const createRes = await fetch('/api/inquiries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  customerName:
                    customerSession?.fullName || senderName || result.inquiry.customerNameSnapshot,
                  contactInfo: phonePart || emailPart || '09170000000',
                  email: emailPart || undefined,
                  serviceId: reservationOpts?.serviceId || result.inquiry.serviceId || 'General Inquiry',
                  message: safeMsg,
                  quantity: reservationOpts?.quantity ?? result.inquiry.quantity ?? 1,
                  wantsReservation: reservationOpts?.wantsReservation ?? false,
                  reservationFee:
                    reservationOpts?.reservationFee ?? result.inquiry.reservationFee ?? null,
                  imageDataUrl: imageDataUrl ?? undefined,
                  referenceCode: result.inquiry.referenceCode,
                  avatarUrl: customerSession?.avatarDataUrl ?? undefined,
                }),
              });
              if (createRes.ok) {
                const createdData = (await createRes.json()) as {
                  inquiry?: Parameters<typeof localRepository.upsertRemoteInquiry>[0];
                };
                if (createdData.inquiry) {
                  const synced = localRepository.upsertRemoteInquiry(createdData.inquiry);
                  refreshSnapshot();
                  setActiveChatInquiryId(synced.id);
                }
                setPublicInquiryCount((prev) => prev + 1);
              }
            }
          } catch {
            // Keep local optimistic message if offline
          }
        })();
      }
      return result;
    },
    [customerSession?.avatarDataUrl, customerSession?.email, customerSession?.fullName, refreshSnapshot, setActiveChatInquiryId],
  );

  const syncActiveInquiryFromBackend = useCallback(
    async (referenceCode: string) => {
      if (
        !referenceCode ||
        typeof fetch !== 'function' ||
        (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
      ) {
        return;
      }
      try {
        const res = await fetch(`/api/inquiries/by-ref/${encodeURIComponent(referenceCode)}`, {
          credentials: 'include',
        });
        if (res.status === 404) {
          const localInq = localRepository
            .listInquiries()
            .find((i) => i.referenceCode === referenceCode);
          const ageMs = localInq ? Date.now() - new Date(localInq.submittedAt).getTime() : Infinity;
          if (ageMs > 10_000 && localRepository.removeInquiryByRef(referenceCode)) {
            refreshSnapshot();
            setActiveChatInquiryId(null);
          }
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          inquiry?: {
            status: InquiryStatus;
            orderItem?: string;
            adminSeenAt?: string | null;
            reservationFee?: number | null;
            updatedAt: string;
            responses: Array<{
              id: string;
              adminId: string | null;
              adminDisplayName: string;
              senderRole: 'admin' | 'customer';
              responseText: string;
              imageDataUrl?: string;
              respondedAt: string;
            }>;
          };
        };
        if (data.inquiry && localRepository.syncInquiryFromBackend(referenceCode, data.inquiry)) {
          refreshSnapshot();
        }
      } catch {
        // Ignore transient network errors during background poll
      }
    },
    [refreshSnapshot, setActiveChatInquiryId],
  );

  const listClients = useCallback(
    (search = '') => localRepository.listClients(search),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot],
  );

  const getClientById = useCallback(
    (id: string) => snapshot.customers.find((customer) => customer.id === id),
    [snapshot.customers],
  );

  const getClientInquiries = useCallback(
    (clientId: string) =>
      snapshot.inquiries
        .filter((inquiry) => inquiry.customerId === clientId)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [snapshot.inquiries],
  );

  const createClient = useCallback(
    (draft: ClientDraft) => {
      const created = localRepository.createClient(draft);
      refreshSnapshot();
      return created;
    },
    [refreshSnapshot],
  );

  const updateClient = useCallback(
    (id: string, draft: ClientDraft) => {
      const updated = localRepository.updateClient(id, draft);
      refreshSnapshot();
      return updated;
    },
    [refreshSnapshot],
  );

  const deleteClient = useCallback(
    (id: string) => {
      const result = localRepository.deleteClient(id);
      refreshSnapshot();
      return result;
    },
    [refreshSnapshot],
  );

  const resetDemoData = useCallback(() => {
    setSnapshot(localRepository.resetDemoData());
    setActiveChatInquiryId(null);
  }, [setActiveChatInquiryId]);

  const signIn = useCallback((credentials: AdminLoginDraft) => {
    const nextSession = localAuthService.signIn(credentials);
    setSession(nextSession);
    setSignInPromptOpen(false);
    return nextSession;
  }, []);

  const registerAdmin = useCallback((draft: AdminCreateDraft) => {
    const nextSession = localAuthService.registerAdmin(draft);
    setSession(nextSession);
    setSignInPromptOpen(false);
    return nextSession;
  }, []);

  const signOut = useCallback(() => {
    localAuthService.signOut();
    setSession(null);
    if (!customerSession) {
      setActiveChatInquiryId(null);
      setIsChatOpen(false);
      setPendingChatDraft(null);
    }
  }, [customerSession, setActiveChatInquiryId]);

  const signInCustomerWithGoogle = useCallback(
    (fullName?: string, email?: string, avatarDataUrl?: string) => {
      const nextSession = localCustomerPrefsService.signInWithGoogle(fullName, email, avatarDataUrl);
      if (customerSession && customerSession.email.toLowerCase() !== nextSession.email.toLowerCase()) {
        setActiveChatInquiryId(null);
      }
      setCustomerSession(nextSession);
      setSignInPromptOpen(false);
      return nextSession;
    },
    [customerSession, setActiveChatInquiryId],
  );

  const updateProfile = useCallback(
    (patch: ProfileUpdateDraft) => {
      if (session && !customerSession) {
        const nextAdmin = localAuthService.updateAdminProfile(patch);
        if (nextAdmin) setSession(nextAdmin);
        return;
      }
      const nextCustomer = localCustomerPrefsService.updateCustomerProfile(patch);
      setCustomerSession(nextCustomer);
      if (
        nextCustomer &&
        typeof fetch === 'function' &&
        (typeof navigator === 'undefined' || !navigator.userAgent?.includes('jsdom'))
      ) {
        void fetch('/api/auth/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: nextCustomer.email,
            fullName: nextCustomer.fullName,
            avatarUrl: nextCustomer.avatarDataUrl ?? null,
          }),
        }).catch(() => undefined);
      }
      if (session) {
        const nextAdmin = localAuthService.updateAdminProfile(patch);
        if (nextAdmin) setSession(nextAdmin);
      }
    },
    [customerSession, session],
  );

  const signOutCustomer = useCallback(() => {
    localCustomerPrefsService.signOutCustomer();
    setCustomerSession(null);
    if (!session) {
      setActiveChatInquiryId(null);
      setIsChatOpen(false);
      setPendingChatDraft(null);
    }
  }, [session, setActiveChatInquiryId]);

  const value = useMemo<AppStoreContextValue>(
    () => ({
      services,
      customers: snapshot.customers,
      inquiries: snapshot.inquiries,
      publicInquiryCount,
      statusCounts,
      session,
      customerSession,
      isAuthenticated,
      signInPromptOpen,
      openSignInPrompt,
      closeSignInPrompt,
      favoriteServiceIds,
      favoriteQuantities,
      toggleFavoriteService,
      setFavoriteQuantity,
      isChatOpen,
      chatServiceId,
      activeChatInquiryId,
      pendingChatDraft,
      setActiveChatInquiryId,
      openInquiryChat,
      clearPendingChatDraft,
      closeInquiryChat,
      listInquiries,
      getInquiryById,
      createInquiry,
      updateInquiry,
      updateInquiryStatus,
      addInquiryReply,
      addCustomerMessage,
      syncActiveInquiryFromBackend,
      listClients,
      getClientById,
      getClientInquiries,
      createClient,
      updateClient,
      deleteClient,
      resetDemoData,
      signIn,
      registerAdmin,
      signOut,
      signInCustomerWithGoogle,
      updateProfile,
      signOutCustomer,
    }),
    [
      services,
      snapshot.customers,
      snapshot.inquiries,
      publicInquiryCount,
      statusCounts,
      session,
      customerSession,
      isAuthenticated,
      signInPromptOpen,
      openSignInPrompt,
      closeSignInPrompt,
      favoriteServiceIds,
      favoriteQuantities,
      toggleFavoriteService,
      setFavoriteQuantity,
      isChatOpen,
      chatServiceId,
      activeChatInquiryId,
      pendingChatDraft,
      setActiveChatInquiryId,
      openInquiryChat,
      clearPendingChatDraft,
      closeInquiryChat,
      listInquiries,
      getInquiryById,
      createInquiry,
      updateInquiry,
      updateInquiryStatus,
      addInquiryReply,
      addCustomerMessage,
      syncActiveInquiryFromBackend,
      listClients,
      getClientById,
      getClientInquiries,
      createClient,
      updateClient,
      deleteClient,
      resetDemoData,
      signIn,
      registerAdmin,
      signOut,
      signInCustomerWithGoogle,
      updateProfile,
      signOutCustomer,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreContextValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error('useAppStore must be used inside AppStoreProvider');
  }
  return ctx;
}
