import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  SlidersHorizontal,
  Smile,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';
import { SERVICE_BY_ID } from '../data/services';
import { formatDateTime } from '../lib/format';
import { isValidEmail, isValidPhPhone, sanitizePhPhone, validateReplyText } from '../lib/validation';
import type { Inquiry, ServiceItem } from '../types/domain';
import { StatusBadge } from './StatusBadge';

type IntakePrompt = 'service' | 'name' | 'phone' | 'details' | null;
type ChatViewMode = 'home' | 'chat';

interface IntakeMessage {
  id: string;
  sender: 'studio' | 'customer';
  text: string;
  imageDataUrl?: string;
  isBot?: boolean;
}

const CHAT_PREFS_KEY = 'rjhub_chat_prefs_v1';
const CHAT_SEEN_COUNT_KEY = 'rjhub_chat_seen_count_v1';
const IS_JSDOM = typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom');
const SEND_DELAY_MS = IS_JSDOM ? 35 : 360;
const BOT_TYPING_DELAY_MS = IS_JSDOM ? 45 : 520;

const DETAILS_QUICK_REPLIES = [
  'Quote & turnaround time for this item.',
  'Bulk pricing and Mawab pickup details.',
] as const;

const FOLLOW_UP_QUICK_REPLIES = [
  "What's my current status in my service?",
  'Service interested',
  'Prices & reservation fees',
  'Add reservation fee',
  'What is the turnaround time?',
  'Can I pick up in Mawab?',
  'Can I send my layout file?',
] as const;

function parseReservationAmount(feeText?: string): number {
  if (!feeText) return 100;
  const match = /₱\s*(\d+)/.exec(feeText);
  return match?.[1] ? Number(match[1]) : 100;
}

const FAQ_CATEGORIES = [
  {
    id: 'account',
    label: 'Account',
    icon: User,
    answer: 'Sign in with your Google customer account to customize 3D products, save favorites, and chat.',
  },
  {
    id: 'billing',
    label: 'Pricing & Reservation',
    icon: Wallet,
    answer: 'Each service lists per-unit PHP rates and a fixed reservation fee before printing begins.',
  },
  {
    id: 'operation',
    label: 'Customization & Files',
    icon: SlidersHorizontal,
    answer: 'Use the 3D Customization Studio to preview Front & Back layouts, remove backgrounds, or attach PNG/JPG files.',
  },
  {
    id: 'pickup',
    label: 'Turnaround & Pickup',
    icon: MapPin,
    answer: 'Standard turnaround is 1–3 business days with walk-in pickup at Purok 4, Andili, Mawab, Davao de Oro.',
  },
] as const;

const CHAT_EMOJIS = [0x1f44d, 0x1f60a, 0x1f64f, 0x2728, 0x1f3a8, 0x1f4e6].map((cp) =>
  String.fromCodePoint(cp),
);

function readChatPrefs(): { muted: boolean; blocked: boolean } {
  try {
    const raw = window.localStorage.getItem(CHAT_PREFS_KEY);
    if (!raw) return { muted: false, blocked: false };
    const parsed = JSON.parse(raw) as Partial<{ muted: boolean; blocked: boolean }>;
    return { muted: Boolean(parsed.muted), blocked: Boolean(parsed.blocked) };
  } catch {
    return { muted: false, blocked: false };
  }
}

function saveChatPrefs(prefs: { muted: boolean; blocked: boolean }) {
  try {
    window.localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function buildInitialGreeting(service?: ServiceItem, hasSignedInName = false): {
  prompt: IntakePrompt;
  selectedId: string | null;
  messages: IntakeMessage[];
} {
  if (service) {
    return {
      prompt: hasSignedInName ? 'phone' : 'name',
      selectedId: service.id,
      messages: [
        {
          id: `studio-hi-${service.id}`,
          sender: 'studio',
          isBot: true,
          text: 'Hello! Welcome to RJ Print HUB. What can we help you with today?',
        },
        {
          id: `studio-rate-${service.id}`,
          sender: 'studio',
          isBot: true,
          text: `${service.serviceName} is ${service.pricePhp} (${service.reservationFeePhp}). Pick a quick reply below to add your name, PH number, or order details.`,
        },
      ],
    };
  }

  return {
    prompt: null,
    selectedId: null,
    messages: [
      {
        id: 'studio-hi-default',
        sender: 'studio',
        isBot: true,
        text: 'Hello! Welcome to RJ Print HUB. What can we help you with today?',
      },
      {
        id: 'studio-ask-default',
        sender: 'studio',
        isBot: true,
        text: 'What would you like to know or share? Pick a quick reply below for items, prices, reservation, your name, or PH number.',
      },
    ],
  };
}

function buildQuickAutoReply(
  prompt: string,
  inquiry: Inquiry,
  services: readonly ServiceItem[],
): string {
  const service = SERVICE_BY_ID[inquiry.serviceId];
  const serviceName = inquiry.orderItem || service?.serviceName || inquiry.serviceId;
  switch (prompt) {
    case "What's my current status in my service?":
      return `Your ${serviceName} inquiry is currently ${inquiry.status}.`;
    case 'Service interested':
      return service
        ? `You're inquiring about ${service.serviceName} (${service.pricePhp} · ${service.reservationFeePhp}).`
        : `You're inquiring about ${serviceName}.`;
    case 'Prices & reservation fees':
      return services
        .map((item) => `• ${item.serviceName}: ${item.pricePhp} (${item.reservationFeePhp})`)
        .join('\n');
    case 'Add reservation fee': {
      const fee = service ? parseReservationAmount(service.reservationFeePhp) : 100;
      return `Reservation fee (₱${fee}) has been noted for your ${serviceName} record.`;
    }
    case 'What is the turnaround time?':
      return 'Standard turnaround is 1–3 business days depending on quantity and finish. Rush requests can be confirmed here with our owner.';
    case 'Can I pick up in Mawab?':
      return 'Yes! Walk-in pickup is available at Purok 4, Andili, Mawab, Davao de Oro once your order is confirmed ready.';
    case 'Can I send my layout file?':
      return 'Yes — tap the paperclip icon below to upload your reference image or layout (up to 2 MB) right in this chat.';
    default:
      return '';
  }
}

function matchServiceFromText(text: string, services: readonly ServiceItem[]): ServiceItem | undefined {
  const normalized = text.toLowerCase();
  return services.find((item) => {
    const tokens = item.serviceName.toLowerCase().split(/\s+/);
    return (
      normalized.includes(item.serviceName.toLowerCase()) ||
      tokens.some((token) => token.length >= 4 && normalized.includes(token))
    );
  });
}

function extractPhoneCandidate(raw: string): string {
  const match = raw.match(/(?<!\d)0[\s-]*9(?:[\s-]*\d){9}(?!\d)/);
  return match ? sanitizePhPhone(match[0]) : '';
}

function extractEmailCandidate(raw: string): string | undefined {
  const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] && isValidEmail(match[0]) ? match[0] : undefined;
}

function StudioAvatar() {
  return (
    <img
      src="/rj-logo-mark.jpg"
      alt="RJ Print HUB"
      className="h-7 w-7 shrink-0 rounded-full border border-[#EAEAEA] bg-white object-contain p-0.5"
    />
  );
}

function DeliveryReceipt({ seen, sending }: { seen: boolean; sending?: boolean }) {
  if (sending) {
    return (
      <span className="inline-flex items-center gap-1 text-[#5B5B5B]">
        <Loader2 className="h-3 w-3 animate-spin text-[#151515]" aria-hidden="true" />
        <span>Sending...</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[#5B5B5B]">
      {seen ? (
        <CheckCheck className="h-3.5 w-3.5 text-[#0284C7]" />
      ) : (
        <Check className="h-3.5 w-3.5 text-[#6B6B6B]" />
      )}
      <span>{seen ? 'Seen' : 'Delivered'}</span>
    </span>
  );
}

function AttachmentImageFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="max-w-[82%] overflow-hidden rounded-[16px] border border-[#EAEAEA] bg-white shadow-[0_2px_10px_rgba(21,21,21,0.08)]">
      <img src={src} alt={alt} className="max-h-52 w-full object-cover" />
    </div>
  );
}

export function InquiryChatWidget() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    services,
    customerSession,
    isAuthenticated,
    isChatOpen,
    chatServiceId,
    activeChatInquiryId,
    pendingChatDraft,
    setActiveChatInquiryId,
    openInquiryChat,
    clearPendingChatDraft,
    closeInquiryChat,
    getInquiryById,
    createInquiry,
    addCustomerMessage,
    syncActiveInquiryFromBackend,
  } = useAppStore();

  const initialService = useMemo(
    () => (chatServiceId ? services.find((item) => item.id === chatServiceId) : undefined),
    [chatServiceId, services],
  );

  const [viewMode, setViewMode] = useState<ChatViewMode>('home');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  const [showFaqSearch, setShowFaqSearch] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    () => initialService?.id ?? null,
  );
  const [customerName, setCustomerName] = useState(() => customerSession?.fullName ?? '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState(() => customerSession?.email ?? '');
  const [orderDetails, setOrderDetails] = useState('');
  const [pendingQuantity, setPendingQuantity] = useState(1);
  const [wantsReservation, setWantsReservation] = useState(false);
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState<string | undefined>(undefined);
  const [adminOnline, setAdminOnline] = useState(false);
  const [activePrompt, setActivePrompt] = useState<IntakePrompt>(() =>
    buildInitialGreeting(initialService, Boolean(customerSession?.fullName)).prompt,
  );
  const [showServiceOptions, setShowServiceOptions] = useState(false);
  const [showAddAnotherService, setShowAddAnotherService] = useState(false);
  const [pendingDraftServices, setPendingDraftServices] = useState<string[] | undefined>(undefined);
  const [pendingDraftQuantity, setPendingDraftQuantity] = useState<number | undefined>(undefined);
  const [hasViewedPrices, setHasViewedPrices] = useState(false);
  const [intakeMessages, setIntakeMessages] = useState<IntakeMessage[]>(
    () => buildInitialGreeting(initialService, Boolean(customerSession?.fullName)).messages,
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDetailsCard, setShowDetailsCard] = useState(false);
  const [isMuted, setIsMuted] = useState(() => readChatPrefs().muted);
  const [isBlocked, setIsBlocked] = useState(() => readChatPrefs().blocked);
  const [botRepliesByResponseId, setBotRepliesByResponseId] = useState<Record<string, string>>({});
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});
  const [showStartPrompt, setShowStartPrompt] = useState(true);
  const [seenMessageCount, setSeenMessageCount] = useState<number>(() => {
    try {
      const n = Number(window.localStorage.getItem(CHAT_SEEN_COUNT_KEY) ?? '0');
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  });

  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>(undefined);
  const [composerError, setComposerError] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const msgCounterRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const preselectedServiceId = searchParams.get('service') ?? undefined;
  const hideCollapsedButton = !isChatOpen && location.pathname.startsWith('/settings');

  useEffect(() => {
    if (
      (location.pathname.startsWith('/inquiry') || preselectedServiceId) &&
      isAuthenticated
    ) {
      openInquiryChat(preselectedServiceId);
      setViewMode('chat');
    }
  }, [location.pathname, preselectedServiceId, isAuthenticated, openInquiryChat]);

  useEffect(() => {
    if (IS_JSDOM || typeof fetch !== 'function') return;
    let active = true;
    const pollHealth = async () => {
      try {
        const res = await fetch('/api/health', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { adminOnline?: boolean };
        if (active && typeof data.adminOnline === 'boolean') {
          setAdminOnline(data.adminOnline);
        }
      } catch {
        // Ignore transient offline health checks
      }
    };
    void pollHealth();
    const id = window.setInterval(() => {
      void pollHealth();
    }, 8000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const activeInquiry = activeChatInquiryId ? getInquiryById(activeChatInquiryId) : undefined;

  useEffect(() => {
    if (
      !isChatOpen ||
      !activeInquiry?.referenceCode ||
      (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
    ) {
      return;
    }
    const refCode = activeInquiry.referenceCode;
    void syncActiveInquiryFromBackend(refCode);
    const interval = window.setInterval(() => {
      void syncActiveInquiryFromBackend(refCode);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [isChatOpen, activeInquiry?.referenceCode, syncActiveInquiryFromBackend]);

  const resetIntakeState = useCallback(() => {
    const fresh = buildInitialGreeting(undefined, Boolean(customerSession?.fullName));
    setSelectedServiceId(null);
    setCustomerName(customerSession?.fullName ?? '');
    setCustomerPhone('');
    setOrderDetails('');
    setPendingImageDataUrl(undefined);
    setActivePrompt(fresh.prompt);
    setShowServiceOptions(false);
    setHasViewedPrices(false);
    setIntakeMessages(fresh.messages);
  }, [customerSession?.fullName]);

  // Reset conversation back to normal cleanly whenever signed out
  useEffect(() => {
    if (isAuthenticated) return;
    clearAllTimers();
    setActiveChatInquiryId(null);
    setBotRepliesByResponseId({});
    setSendingIds({});
    setIsBotTyping(false);
    setMessageText('');
    setAttachmentDataUrl(undefined);
    setCustomerName('');
    setCustomerEmail('');
    setSeenMessageCount(0);
    try {
      window.localStorage.removeItem(CHAT_SEEN_COUNT_KEY);
    } catch {
      // Ignore storage errors
    }
    setViewMode('home');
    resetIntakeState();
  }, [isAuthenticated, clearAllTimers, setActiveChatInquiryId, resetIntakeState]);

  useEffect(() => {
    if (activeInquiry || !chatServiceId) return;
    const matched = services.find((item) => item.id === chatServiceId);
    if (!matched) return;
    const seeded = buildInitialGreeting(matched, Boolean(customerSession?.fullName));
    setSelectedServiceId(seeded.selectedId);
    setActivePrompt(seeded.prompt);
    setShowServiceOptions(false);
    setIntakeMessages(seeded.messages);
  }, [chatServiceId, activeInquiry, services, customerSession?.fullName]);

  useEffect(() => {
    if (customerSession?.fullName) {
      setCustomerName(customerSession.fullName);
    }
    if (customerSession?.email) {
      setCustomerEmail(customerSession.email);
    }
  }, [customerSession?.fullName, customerSession?.email]);

  // Pre-fill draft from 3D Customization Studio / Favorites and enter conversation view
  useEffect(() => {
    if (!pendingChatDraft) return;
    setMessageText(pendingChatDraft.text);
    setPendingQuantity(pendingChatDraft.quantity ?? 1);
    setPendingDraftServices(pendingChatDraft.serviceNames);
    setPendingDraftQuantity(pendingChatDraft.quantity);
    if (pendingChatDraft.imageDataUrl) {
      setAttachmentDataUrl(pendingChatDraft.imageDataUrl);
    }
    if (!activeInquiry) {
      setActivePrompt('details');
      if (!selectedServiceId && chatServiceId) {
        setSelectedServiceId(chatServiceId);
      }
    }
    setViewMode('chat');
    clearPendingChatDraft();
  }, [pendingChatDraft, activeInquiry, selectedServiceId, chatServiceId, clearPendingChatDraft]);

  useEffect(() => {
    if (isChatOpen || typeof window === 'undefined') return;
    let lastY = window.scrollY ?? 0;
    let settleTimer: number | undefined;

    const onScroll = () => {
      const currentY = window.scrollY ?? 0;
      if (settleTimer) window.clearTimeout(settleTimer);

      if (currentY <= 12 || currentY < lastY) {
        setShowStartPrompt(true);
      } else if (currentY > lastY + 12) {
        setShowStartPrompt(false);
      }
      lastY = currentY;
      settleTimer = window.setTimeout(() => setShowStartPrompt(true), 900);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) {
      setIsSettingsOpen(false);
      setIsEmojiOpen(false);
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else {
          closeInquiryChat();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isChatOpen, isSettingsOpen, closeInquiryChat]);

  useEffect(() => {
    if (!isChatOpen || viewMode !== 'chat') return;
    threadEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [
    isChatOpen,
    viewMode,
    activeInquiry?.id,
    activeInquiry?.responses.length,
    intakeMessages.length,
    isBotTyping,
    showServiceOptions,
  ]);

  const nextId = useCallback((prefix: string) => {
    msgCounterRef.current += 1;
    return `${prefix}-${msgCounterRef.current}`;
  }, []);

  const markSendingBriefly = useCallback(
    (id: string) => {
      setSendingIds((prev) => ({ ...prev, [id]: true }));
      scheduleTimer(() => {
        setSendingIds((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, SEND_DELAY_MS);
    },
    [scheduleTimer],
  );

  const enqueueBotIntakeMessage = useCallback(
    (msg: IntakeMessage) => {
      setIsBotTyping(true);
      scheduleTimer(() => {
        setIsBotTyping(false);
        setIntakeMessages((prev) => [...prev, msg]);
      }, BOT_TYPING_DELAY_MS);
    },
    [scheduleTimer],
  );

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    saveChatPrefs({ muted: nextMuted, blocked: isBlocked });
    setIsSettingsOpen(false);
  };

  const handleToggleBlocked = () => {
    const nextBlocked = !isBlocked;
    setIsBlocked(nextBlocked);
    saveChatPrefs({ muted: isMuted, blocked: nextBlocked });
    setIsSettingsOpen(false);
    setIsEmojiOpen(false);
  };

  const commitIntakeField = useCallback(
    (
      patch: {
        serviceId?: string;
        name?: string;
        phone?: string;
        email?: string;
        details?: string;
        image?: string;
      },
      customerBubble: IntakeMessage,
      customAck?: string,
    ) => {
      const nextServiceId = patch.serviceId ?? selectedServiceId;
      const nextName = patch.name ?? customerName;
      const nextPhone = patch.phone ?? customerPhone;
      const nextEmail = patch.email ?? customerEmail;
      const nextDetails = patch.details ?? orderDetails;
      const nextImage = patch.image ?? pendingImageDataUrl;

      if (patch.serviceId !== undefined) setSelectedServiceId(patch.serviceId);
      if (patch.name !== undefined) setCustomerName(patch.name);
      if (patch.phone !== undefined) setCustomerPhone(patch.phone);
      if (patch.email !== undefined) setCustomerEmail(patch.email);
      if (patch.details !== undefined) setOrderDetails(patch.details);
      if (patch.image !== undefined) setPendingImageDataUrl(patch.image);

      const resolvedContact = nextPhone || nextEmail;
      if (nextServiceId && nextName && resolvedContact && nextDetails) {
        const svc = SERVICE_BY_ID[nextServiceId];
        const feeAmount = wantsReservation && svc ? parseReservationAmount(svc.reservationFeePhp) : null;
        const created = createInquiry({
          serviceId: nextServiceId,
          customerName: nextName,
          contactInfo: resolvedContact,
          email: nextEmail || undefined,
          message: nextDetails,
          quantity: pendingQuantity,
          wantsReservation,
          reservationFee: feeAmount,
          imageDataUrl: nextImage,
        });
        resetIntakeState();
        setViewMode('chat');
        setActiveChatInquiryId(created.id);
        markSendingBriefly(created.id);
        return;
      }

      let followUpText = customAck;
      let nextPrompt: IntakePrompt = null;

      if (!nextServiceId) {
        nextPrompt = 'service';
        followUpText =
          followUpText ??
          "Thanks! Tap 'Choose item, price & reservation' below to pick a service.";
      } else if (!nextName) {
        nextPrompt = 'name';
        followUpText =
          followUpText ?? "Thanks! Pick 'Add my name' below or type your full name.";
      } else if (!nextPhone) {
        nextPrompt = 'phone';
        followUpText =
          followUpText ??
          `Thanks, ${nextName}! Please enter your 11-digit PH mobile number (e.g. 09171234567).`;
      } else if (!nextDetails) {
        nextPrompt = 'details';
        followUpText =
          followUpText ??
          'Almost done! Share your quantity, customization notes, or pickup date (at least 10 characters).';
      }

      setActivePrompt(nextPrompt);
      setIntakeMessages((prev) => [...prev, customerBubble]);
      markSendingBriefly(customerBubble.id);
      enqueueBotIntakeMessage({
        id: nextId('studio-ack'),
        sender: 'studio',
        isBot: true,
        text: followUpText ?? 'Pick another quick reply below to continue.',
      });
    },
    [
      createInquiry,
      customerEmail,
      customerName,
      customerPhone,
      enqueueBotIntakeMessage,
      markSendingBriefly,
      nextId,
      orderDetails,
      pendingImageDataUrl,
      pendingQuantity,
      resetIntakeState,
      selectedServiceId,
      setActiveChatInquiryId,
      wantsReservation,
    ],
  );

  const handleSelectServiceOption = (service: ServiceItem | 'General Inquiry') => {
    setShowServiceOptions(false);
    const label = service === 'General Inquiry' ? 'General Inquiry' : service.serviceName;
    const serviceIdValue = service === 'General Inquiry' ? 'General Inquiry' : service.id;
    const ack =
      service === 'General Inquiry'
        ? 'General Inquiry selected. Pick a quick reply below to share your name, PH number, or order details.'
        : `${service.serviceName}: ${service.pricePhp} · ${service.reservationFeePhp}. What would you like to share next?`;

    commitIntakeField(
      { serviceId: serviceIdValue },
      { id: nextId('cust-service'), sender: 'customer', text: label },
      ack,
    );
  };

  const handleShowPricesOption = () => {
    setHasViewedPrices(true);
    setShowServiceOptions(false);
    const rateLines = services
      .map((item) => `• ${item.serviceName}: ${item.pricePhp} (${item.reservationFeePhp})`)
      .join('\n');

    const custId = nextId('cust-prices');
    setIntakeMessages((prev) => [
      ...prev,
      { id: custId, sender: 'customer', text: 'Prices & reservation fees' },
    ]);
    markSendingBriefly(custId);
    enqueueBotIntakeMessage({
      id: nextId('studio-prices'),
      sender: 'studio',
      isBot: true,
      text: `${rateLines}\nPick a quick reply below to continue your inquiry.`,
    });
  };

  const handlePromptQuickReply = (promptType: Exclude<IntakePrompt, null>) => {
    if (promptType === 'service') {
      setShowServiceOptions(true);
      setActivePrompt('service');
      const custId = nextId('cust-choose-item');
      setIntakeMessages((prev) => [
        ...prev,
        { id: custId, sender: 'customer', text: 'Choose item, price & reservation' },
      ]);
      markSendingBriefly(custId);
      enqueueBotIntakeMessage({
        id: nextId('studio-choose-item'),
        sender: 'studio',
        isBot: true,
        text: 'Select an item below to see its per-unit price and reservation fee:',
      });
      return;
    }

    setShowServiceOptions(false);
    const config: Record<'name' | 'phone' | 'details', { label: string; reply: string }> = {
      name: {
        label: 'Add my name',
        reply: 'What is your full name?',
      },
      phone: {
        label: 'Add my PH phone number',
        reply: 'Please enter your 11-digit Philippine mobile number (e.g. 09171234567).',
      },
      details: {
        label: 'Add order details',
        reply: 'Share your quantity, customization notes, or pickup date (at least 10 characters).',
      },
    };

    const custId = nextId(`cust-${promptType}`);
    setActivePrompt(promptType);
    setIntakeMessages((prev) => [
      ...prev,
      { id: custId, sender: 'customer', text: config[promptType].label },
    ]);
    markSendingBriefly(custId);
    enqueueBotIntakeMessage({
      id: nextId(`studio-${promptType}`),
      sender: 'studio',
      isBot: true,
      text: config[promptType].reply,
    });
  };

  const handleIntakeSend = (textToSend: string, imageToSend?: string) => {
    const trimmed = textToSend.trim();
    const err = validateReplyText(trimmed, Boolean(imageToSend));
    if (err) {
      setComposerError(err);
      return;
    }

    setMessageText('');
    setAttachmentDataUrl(undefined);
    setComposerError(undefined);
    setIsEmojiOpen(false);
    setShowServiceOptions(false);

    const customerBubble: IntakeMessage = {
      id: nextId('cust'),
      sender: 'customer',
      text: trimmed,
      imageDataUrl: imageToSend,
    };

    const emailCandidate = extractEmailCandidate(trimmed);
    const phoneCandidate = extractPhoneCandidate(trimmed);

    if (activePrompt === 'name') {
      if (trimmed.length < 2) {
        setIntakeMessages((prev) => [...prev, customerBubble]);
        markSendingBriefly(customerBubble.id);
        enqueueBotIntakeMessage({
          id: nextId('studio-name-err'),
          sender: 'studio',
          isBot: true,
          text: 'Please enter at least 2 characters for your name.',
        });
        return;
      }
      commitIntakeField({ name: trimmed, image: imageToSend }, customerBubble);
      return;
    }

    if (activePrompt === 'phone') {
      if (!isValidPhPhone(phoneCandidate)) {
        setIntakeMessages((prev) => [...prev, customerBubble]);
        markSendingBriefly(customerBubble.id);
        enqueueBotIntakeMessage({
          id: nextId('studio-phone-err'),
          sender: 'studio',
          isBot: true,
          text: 'Please enter a valid 11-digit Philippine mobile number starting with 09 (e.g. 09171234567).',
        });
        return;
      }
      commitIntakeField(
        { phone: phoneCandidate, email: emailCandidate, image: imageToSend },
        customerBubble,
      );
      return;
    }

    if (activePrompt === 'details') {
      const resolvedDetails =
        trimmed.length >= 10
          ? trimmed
          : imageToSend
            ? trimmed || 'Attached reference design photo for review.'
            : '';
      if (resolvedDetails.length < 10) {
        setIntakeMessages((prev) => [...prev, customerBubble]);
        markSendingBriefly(customerBubble.id);
        enqueueBotIntakeMessage({
          id: nextId('studio-details-err'),
          sender: 'studio',
          isBot: true,
          text: 'Please share at least 10 characters of order details (quantity, size, or pickup date).',
        });
        return;
      }
      commitIntakeField({ details: resolvedDetails, image: imageToSend }, customerBubble);
      return;
    }

    if (!customerPhone && isValidPhPhone(phoneCandidate)) {
      commitIntakeField(
        { phone: phoneCandidate, email: emailCandidate, image: imageToSend },
        customerBubble,
      );
      return;
    }

    if (!orderDetails && (trimmed.length >= 10 || imageToSend || (customerName && (customerPhone || customerEmail) && trimmed.length >= 2))) {
      const matched = !selectedServiceId ? matchServiceFromText(trimmed, services) : undefined;
      const resolvedMsg =
        trimmed.length >= 10
          ? trimmed
          : imageToSend
            ? trimmed || 'Attached reference design photo for review.'
            : `Customer message: ${trimmed}`;
      commitIntakeField(
        {
          serviceId: matched?.id ?? selectedServiceId ?? 'General Inquiry',
          details: resolvedMsg,
          image: imageToSend,
        },
        customerBubble,
      );
      return;
    }

    if (!customerName && trimmed.length >= 2) {
      commitIntakeField({ name: trimmed, image: imageToSend }, customerBubble);
      return;
    }

    commitIntakeField({ image: imageToSend }, customerBubble);
  };

  const handleToggleIntakeReservation = () => {
    setWantsReservation(true);
    const svc = selectedServiceId ? SERVICE_BY_ID[selectedServiceId] : undefined;
    const fee = parseReservationAmount(svc?.reservationFeePhp);
    const custId = nextId('cust-res');
    setIntakeMessages((prev) => [
      ...prev,
      { id: custId, sender: 'customer', text: `Add reservation fee (₱${fee})` },
    ]);
    markSendingBriefly(custId);
    enqueueBotIntakeMessage({
      id: nextId('studio-res-ack'),
      sender: 'studio',
      isBot: true,
      text: `Got it — reservation fee (₱${fee}) will be included in your inquiry record.`,
    });
  };

  const sendMessage = (
    textToSend: string,
    imageToSend?: string,
    extraItem?: { serviceId?: string; serviceNames?: string[]; quantity?: number },
  ) => {
    if (isBlocked || !isAuthenticated) return;
    if (!activeInquiry) {
      handleIntakeSend(textToSend, imageToSend);
      return;
    }

    const err = validateReplyText(textToSend, Boolean(imageToSend));
    if (err) {
      setComposerError(err);
      return;
    }
    const trimmedText = textToSend.trim();
    const wantsResNow = /add reservation fee|want.*reserv/i.test(trimmedText);
    const svc = SERVICE_BY_ID[activeInquiry.serviceId];
    const reservationFeeNow = wantsResNow ? parseReservationAmount(svc?.reservationFeePhp) : undefined;
    const senderName = customerSession?.fullName || activeInquiry.customerNameSnapshot;
    const resolvedServices = extraItem?.serviceNames ?? pendingDraftServices;
    const resolvedServiceId = extraItem?.serviceId;
    const resolvedQty = extraItem?.quantity ?? pendingDraftQuantity;
    const { response } = addCustomerMessage(
      activeInquiry.id,
      textToSend,
      senderName,
      imageToSend,
      wantsResNow || resolvedServices || resolvedServiceId
        ? {
            ...(wantsResNow ? { wantsReservation: true, reservationFee: reservationFeeNow } : {}),
            ...(resolvedServiceId ? { serviceId: resolvedServiceId } : {}),
            ...(resolvedServices ? { serviceNames: resolvedServices } : {}),
            ...(resolvedQty ? { quantity: resolvedQty } : {}),
          }
        : undefined,
    );
    markSendingBriefly(response.id);
    setPendingDraftServices(undefined);
    setPendingDraftQuantity(undefined);

    const autoReply = buildQuickAutoReply(trimmedText, activeInquiry, services);
    if (autoReply) {
      setIsBotTyping(true);
      scheduleTimer(() => {
        setIsBotTyping(false);
        setBotRepliesByResponseId((prev) => ({ ...prev, [response.id]: autoReply }));
      }, BOT_TYPING_DELAY_MS);
    }

    setMessageText('');
    setAttachmentDataUrl(undefined);
    setComposerError(undefined);
    setIsEmojiOpen(false);
  };

  const handleComposerSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage(messageText, attachmentDataUrl);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(messageText, attachmentDataUrl);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setComposerError('Please choose an image under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachmentDataUrl(reader.result);
        setComposerError(undefined);
      }
    };
    reader.readAsDataURL(file);
  };

  const chatMessageCount = activeInquiry
    ? 1 + activeInquiry.responses.length + Object.keys(botRepliesByResponseId).length
    : intakeMessages.length + (messageText.trim() || attachmentDataUrl ? 1 : 0);

  useEffect(() => {
    if (!isChatOpen) return;
    if (seenMessageCount !== chatMessageCount) {
      setSeenMessageCount(chatMessageCount);
      try {
        window.localStorage.setItem(CHAT_SEEN_COUNT_KEY, String(chatMessageCount));
      } catch {
        // Ignore storage errors
      }
    }
  }, [isChatOpen, chatMessageCount, seenMessageCount]);

  const unreadChatCount = Math.max(0, chatMessageCount - seenMessageCount);
  const activeServicesLabel = activeInquiry
    ? activeInquiry.orderItem ||
      SERVICE_BY_ID[activeInquiry.serviceId]?.serviceName ||
      activeInquiry.serviceId
    : '';

  if (hideCollapsedButton) {
    return null;
  }

  if (!isChatOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5">
        {showStartPrompt && (
          <button
            type="button"
            onClick={() => {
              setViewMode('home');
              openInquiryChat();
            }}
            className="hidden sm:inline-flex rounded-full border border-[#EAEAEA] bg-white px-4 py-2 text-xs font-semibold text-[#151515] shadow-[0_10px_24px_rgba(21,21,21,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BAE6FD] cursor-pointer"
          >
            Start chat with us
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setViewMode('home');
            openInquiryChat();
          }}
          aria-label="Open inquiry chat"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#38BDF8] text-[#151515] shadow-[0_14px_30px_rgba(21,21,21,0.18)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#7DD3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898EC] cursor-pointer"
        >
          <MessageSquare className="h-6 w-6 stroke-[2]" />
          {isAuthenticated && !isMuted && unreadChatCount > 0 && (
            <span
              aria-label={`${unreadChatCount} chat messages`}
              className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-white bg-[#38BDF8] px-1 text-[11px] font-bold leading-none text-black tabular-nums"
            >
              {unreadChatCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Pacdora Help Center Home View
  if (viewMode === 'home') {
    const filteredFaqs = FAQ_CATEGORIES.filter((faq) => {
      if (!faqQuery.trim()) return true;
      const needle = faqQuery.toLowerCase();
      return faq.label.toLowerCase().includes(needle) || faq.answer.toLowerCase().includes(needle);
    });
    const visibleFaqs = showAllFaqs || faqQuery.trim() ? filteredFaqs : filteredFaqs.slice(0, 3);

    return (
      <section
        role="dialog"
        aria-modal="false"
        aria-label="RJ Print HUB Help Center"
        className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 flex max-h-[min(41rem,calc(100vh-2.5rem))] w-auto sm:w-[25rem] flex-col overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-[#FAFAFA] shadow-[0_24px_60px_rgba(21,21,21,0.2)] modal-drawer-enter"
      >
        <header className="shrink-0 bg-[#151515] px-5 pt-5 pb-12 text-white">
          <div className="flex items-center justify-between gap-3">
            <img
              src="/rj-logo-mark.jpg"
              alt="RJ Print HUB"
              className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-white/25"
            />
            <button
              type="button"
              onClick={closeInquiryChat}
              aria-label="Close inquiry chat"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-4 text-[1.375rem] font-bold tracking-tight text-white">
            RJ Print HUB Help Center
          </h2>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-white/85">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${adminOnline ? 'bg-[#4ADE80]' : 'bg-[#94A3B8]'}`}
            />
            <span>How can we help you today?</span>
          </p>
        </header>

        <div className="-mt-7 flex-1 space-y-3.5 overflow-y-auto px-4 pb-5">
          {/* Card 1: Chat With Us */}
          <div className="overflow-hidden rounded-[16px] border border-[#EAEAEA] bg-white shadow-[0_6px_20px_rgba(21,21,21,0.08)]">
            <div className="border-b border-[#EAEAEA] px-4 py-2.5 text-[13px] font-semibold text-[#151515]">
              Chat With Us
            </div>
            <button
              type="button"
              onClick={() => setViewMode('chat')}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FAFAFA] cursor-pointer"
            >
              <img
                src="/rj-logo-mark.jpg"
                alt="RJ Print HUB"
                className="h-10 w-10 shrink-0 rounded-full border border-[#EAEAEA] bg-white object-contain p-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-semibold text-[#151515]">Send us a message</p>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#525252]">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${adminOnline ? 'bg-[#4ADE80]' : 'bg-[#94A3B8]'}`}
                    />
                    {adminOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#525252]">
                  {activeInquiry
                    ? `${activeServicesLabel} · ${activeInquiry.status}`
                    : 'What would you like help with?'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#676767]" aria-hidden="true" />
            </button>
          </div>

          {/* Card 2: FAQs */}
          <div className="overflow-hidden rounded-[16px] border border-[#EAEAEA] bg-white shadow-[0_6px_20px_rgba(21,21,21,0.08)]">
            <div className="flex items-center justify-between gap-2 border-b border-[#EAEAEA] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[#151515]">FAQs</span>
              <button
                type="button"
                aria-label="Search FAQs"
                onClick={() => setShowFaqSearch((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#EAEAEA] bg-[#FAFAFA] text-[#525252] hover:border-[#BAE6FD] hover:text-black cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>

            {showFaqSearch && (
              <div className="border-b border-[#EAEAEA] px-4 py-2">
                <input
                  type="search"
                  value={faqQuery}
                  onChange={(e) => setFaqQuery(e.target.value)}
                  placeholder="Search FAQs..."
                  aria-label="Search FAQs input"
                  className="h-8 w-full rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] px-2.5 text-xs text-[#151515]"
                />
              </div>
            )}

            <div className="divide-y divide-[#EAEAEA]">
              {visibleFaqs.map((faq) => {
                const Icon = faq.icon;
                const isOpen = expandedFaqId === faq.id;
                return (
                  <div key={faq.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isOpen ? null : faq.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFA] cursor-pointer"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] text-[#525252]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-[#151515]">
                        {faq.label}
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-[#676767] transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-[#EAEAEA] bg-[#FAFAFA] px-4 py-2.5 text-[12px] leading-relaxed text-[#525252]">
                        <p>{faq.answer}</p>
                        <button
                          type="button"
                          onClick={() => setViewMode('chat')}
                          className="mt-1.5 text-[11.5px] font-semibold text-[#151515] underline hover:text-black cursor-pointer"
                        >
                          Ask in chat
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!faqQuery.trim() && filteredFaqs.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllFaqs((prev) => !prev)}
                className="w-full border-t border-[#EAEAEA] px-4 py-2.5 text-left text-[12px] font-semibold text-[#151515] hover:bg-[#FAFAFA] cursor-pointer"
              >
                {showAllFaqs ? 'Show fewer categories' : 'Show more categories'}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const isSeenByAdmin = (isoTs: string): boolean => {
    if (!activeInquiry?.adminSeenAt) return false;
    const seenMs = new Date(activeInquiry.adminSeenAt).getTime();
    const msgMs = new Date(isoTs).getTime();
    return Number.isFinite(seenMs) && Number.isFinite(msgMs) && seenMs >= msgMs;
  };
  const hasAnyAdminReply = Boolean(
    activeInquiry?.responses.some((response) => response.senderRole !== 'customer'),
  );
  const initialSeen = activeInquiry ? isSeenByAdmin(activeInquiry.submittedAt) : false;
  const availableFollowUps = activeInquiry
    ? FOLLOW_UP_QUICK_REPLIES.filter(
        (prompt) => !activeInquiry.responses.some((item) => item.responseText.trim() === prompt),
      )
    : [];

  const detailsServiceId = activeInquiry?.serviceId ?? selectedServiceId;
  const detailsService = detailsServiceId ? SERVICE_BY_ID[detailsServiceId] : undefined;
  const detailsServiceName = detailsService?.serviceName ?? detailsServiceId ?? 'Not selected yet';

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Chat with RJ Print HUB"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 flex max-h-[min(41rem,calc(100vh-2.5rem))] w-auto sm:w-[25rem] flex-col overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-white shadow-[0_24px_60px_rgba(21,21,21,0.18)] modal-drawer-enter"
    >
      {/* Conversation Header */}
      <header className="relative shrink-0 bg-[#151515] px-4 pt-4 pb-7 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode('home')}
              aria-label="Back to help center"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <img
              src="/rj-logo-mark.jpg"
              alt="RJ Print HUB"
              className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-white/25"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-wide text-white/70">Chat with</p>
              <h2 className="truncate text-[1.0625rem] font-semibold tracking-tight text-white">
                RJ Print HUB
              </h2>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              aria-label="Chat settings"
              aria-expanded={isSettingsOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeInquiryChat}
              aria-label="Close inquiry chat"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <ChevronDown className="h-5 w-5" />
            </button>

            {isSettingsOpen && (
              <div
                role="menu"
                aria-label="Chat settings"
                className="absolute right-0 top-10 z-30 w-52 rounded-[14px] border border-[#EAEAEA] bg-white py-1.5 text-left text-[13px] text-[#151515] shadow-[0_12px_28px_rgba(21,21,21,0.18)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowDetailsCard((prev) => !prev);
                    setIsSettingsOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 font-medium text-[#151515] hover:bg-[#F4F5F6] cursor-pointer"
                >
                  <Info className="h-4 w-4 text-[#525252]" aria-hidden="true" />
                  <span>Inquiry details</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleToggleMute}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 font-medium text-[#151515] hover:bg-[#F4F5F6] cursor-pointer"
                >
                  {isMuted ? (
                    <Bell className="h-4 w-4 text-[#525252]" aria-hidden="true" />
                  ) : (
                    <BellOff className="h-4 w-4 text-[#525252]" aria-hidden="true" />
                  )}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleToggleBlocked}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 font-medium text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <Ban className="h-4 w-4 text-[#DC2626]" aria-hidden="true" />
                  <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2 pl-2 text-[12px] font-medium text-white/90">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${adminOnline ? 'bg-[#4ADE80]' : 'bg-[#94A3B8]'}`}
          />
          <span>{adminOnline ? "We're online" : 'Offline'}</span>
          {isMuted && <span className="text-white/70">· Muted</span>}
        </div>

        <svg
          aria-hidden="true"
          viewBox="0 0 400 24"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -bottom-px left-0 h-5 w-full text-white"
        >
          <path d="M0,12 C110,26 275,-4 400,14 L400,24 L0,24 Z" fill="currentColor" />
        </svg>
      </header>

      {showDetailsCard && (
        <div
          role="region"
          aria-label="Inquiry details"
          className="shrink-0 border-b border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3 text-[12.5px] text-[#151515]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#151515]">
              <Info className="h-4 w-4 text-[#525252]" aria-hidden="true" />
              <span>Inquiry details</span>
            </div>
            <button
              type="button"
              onClick={() => setShowDetailsCard(false)}
              aria-label="Close inquiry details"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[#525252] hover:bg-[#EAEAEA] hover:text-[#151515] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <dl className="mt-2 space-y-1.5 text-[#525252]">
            {customerSession && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <dt>Name</dt>
                  <dd className="truncate font-medium text-[#151515]">{customerSession.fullName}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Email</dt>
                  <dd className="truncate font-medium text-[#151515]">{customerSession.email}</dd>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt>Service(s)</dt>
              <dd className="truncate font-medium text-[#151515]">
                {activeInquiry ? activeServicesLabel : detailsServiceName}
              </dd>
            </div>
            {detailsService && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <dt>Rate</dt>
                  <dd className="font-medium text-[#151515]">{detailsService.pricePhp}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Reservation</dt>
                  <dd className="font-medium text-[#151515]">{detailsService.reservationFeePhp}</dd>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt>Status</dt>
              <dd>
                {activeInquiry ? (
                  <StatusBadge status={activeInquiry.status} />
                ) : (
                  <span className="font-medium text-[#151515]">In progress</span>
                )}
              </dd>
            </div>
            {activeInquiry && (
              <div className="flex items-center justify-between gap-2">
                <dt>Submitted</dt>
                <dd className="font-medium text-[#151515]">
                  {formatDateTime(activeInquiry.submittedAt)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Scrollable conversation area */}
      <div className="flex-1 overflow-y-auto bg-white px-4 py-3.5">
        {!activeInquiry ? (
          <div className="space-y-3">
            {intakeMessages.map((msg) => {
              const isCustomer = msg.sender === 'customer';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${isCustomer ? 'items-end' : 'items-start'}`}
                >
                  {isCustomer ? (
                    <>
                      {msg.imageDataUrl && (
                        <AttachmentImageFrame src={msg.imageDataUrl} alt="Attached sample" />
                      )}
                      {msg.text && (
                        <div className="max-w-[85%] rounded-[18px] rounded-tr-[6px] bg-[#38BDF8] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.06)]">
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        </div>
                      )}
                      <div className="pr-1 text-[11px]">
                        <DeliveryReceipt seen={false} sending={sendingIds[msg.id]} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-end gap-2 max-w-[92%]">
                      <StudioAvatar />
                      <div className="space-y-1">
                        {msg.imageDataUrl && (
                          <AttachmentImageFrame src={msg.imageDataUrl} alt="Attached sample" />
                        )}
                        {msg.text && (
                          <div className="rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 text-[13.5px] leading-relaxed text-[#151515] shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          </div>
                        )}
                        {msg.isBot && (
                          <span className="block px-1 text-[11px] text-[#6B6B6B]">
                            RJ Print HUB Bot Auto Reply
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isBotTyping && (
              <div className="flex items-end gap-2">
                <StudioAvatar />
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1 rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce [animation-delay:120ms]" />
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce [animation-delay:240ms]" />
                  </div>
                  <span className="block px-1 text-[11px] text-[#6B6B6B]">
                    RJ Print HUB Bot Auto Reply · Typing...
                  </span>
                </div>
              </div>
            )}

            {!isBlocked && (
              <div
                className="flex flex-col items-end gap-1.5 pt-1"
                role="group"
                aria-label="Quick-reply options"
              >
                {showServiceOptions ? (
                  <>
                    {services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectServiceOption(service)}
                        className="max-w-[92%] rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        <span>{service.serviceName}</span>
                        <span className="ml-1.5 font-normal text-[#525252]">
                          · {service.pricePhp} · {service.reservationFeePhp}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSelectServiceOption('General Inquiry')}
                      className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                    >
                      General Inquiry
                    </button>
                  </>
                ) : (
                  <>
                    {!selectedServiceId && (
                      <button
                        type="button"
                        onClick={() => handlePromptQuickReply('service')}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Choose item, price &amp; reservation
                      </button>
                    )}

                    {!customerName && (
                      <button
                        type="button"
                        onClick={() => handlePromptQuickReply('name')}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Add my name
                      </button>
                    )}

                    {!customerPhone && (
                      <button
                        type="button"
                        onClick={() => handlePromptQuickReply('phone')}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Add my PH phone number
                      </button>
                    )}

                    {!orderDetails && (
                      <button
                        type="button"
                        onClick={() => handlePromptQuickReply('details')}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Add order details
                      </button>
                    )}

                    {activePrompt === 'details' &&
                      !orderDetails &&
                      DETAILS_QUICK_REPLIES.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleIntakeSend(preset)}
                          className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}

                    {!hasViewedPrices && (
                      <button
                        type="button"
                        onClick={handleShowPricesOption}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Prices &amp; reservation fees
                      </button>
                    )}

                    {selectedServiceId && !wantsReservation && (
                      <button
                        type="button"
                        onClick={handleToggleIntakeReservation}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        Add reservation fee
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div ref={threadEndRef} />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Initial customer inquiry bubble */}
            <div className="flex flex-col items-end gap-1">
              <div className="max-w-[85%] rounded-[18px] rounded-tr-[6px] bg-[#38BDF8] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.06)]">
                <p className="whitespace-pre-wrap break-words">{activeInquiry.message}</p>
              </div>
              <div className="flex items-center gap-1.5 pr-1 text-[11px] text-[#6B6B6B]">
                <span>{formatDateTime(activeInquiry.submittedAt)}</span>
                <span aria-hidden="true">·</span>
                <DeliveryReceipt seen={initialSeen} sending={sendingIds[activeInquiry.id]} />
              </div>
            </div>

            {!hasAnyAdminReply && (
              <div className="flex items-end gap-2">
                <StudioAvatar />
                <div className="max-w-[85%] rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 text-[13px] leading-relaxed text-[#151515] shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                  All set! Your inquiry ({activeServicesLabel}) is now with our RJ Print HUB
                  admin team. Pick a quick question below or send a message anytime.
                </div>
              </div>
            )}

            {activeInquiry.responses.map((response) => {
              const isCustomer = response.senderRole === 'customer';
              const isSeen = isCustomer && isSeenByAdmin(response.respondedAt);
              const autoReply = botRepliesByResponseId[response.id];

              return (
                <div key={response.id} className="space-y-2.5">
                  {isCustomer ? (
                    <div className="flex flex-col items-end gap-1.5">
                      {response.imageDataUrl && (
                        <AttachmentImageFrame src={response.imageDataUrl} alt="Chat attachment" />
                      )}
                      {response.responseText && (
                        <div className="max-w-[85%] rounded-[18px] rounded-tr-[6px] bg-[#38BDF8] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.06)]">
                          <p className="whitespace-pre-wrap break-words">{response.responseText}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[#6B6B6B]">
                        <span>{formatDateTime(response.respondedAt)}</span>
                        <span aria-hidden="true">·</span>
                        <DeliveryReceipt seen={isSeen} sending={sendingIds[response.id]} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <StudioAvatar />
                      <div className="flex flex-col items-start gap-1 max-w-[88%]">
                        {response.imageDataUrl && (
                          <AttachmentImageFrame src={response.imageDataUrl} alt="Chat attachment" />
                        )}
                        {response.responseText && (
                          <div className="rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 text-[13.5px] leading-relaxed text-[#151515] shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                            <p className="whitespace-pre-wrap break-words">{response.responseText}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 px-1 text-[11px] text-[#6B6B6B]">
                          <span className="font-medium text-[#151515]">
                            {response.adminDisplayName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDateTime(response.respondedAt)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {autoReply && (
                    <div className="flex items-end gap-2">
                      <StudioAvatar />
                      <div className="flex flex-col items-start gap-1 max-w-[88%]">
                        <div className="rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 text-[13px] leading-relaxed text-[#151515] shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                          <p className="whitespace-pre-wrap break-words">{autoReply}</p>
                        </div>
                        <span className="px-1 text-[11px] text-[#6B6B6B]">
                          RJ Print HUB Bot Auto Reply
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isBotTyping && (
              <div className="flex items-end gap-2">
                <StudioAvatar />
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1 rounded-[18px] rounded-tl-[6px] border border-[#ECECEC] bg-white px-4 py-2.5 shadow-[0_3px_12px_rgba(21,21,21,0.06)]">
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce [animation-delay:120ms]" />
                    <span className="h-2 w-2 rounded-full bg-[#151515] animate-bounce [animation-delay:240ms]" />
                  </div>
                  <span className="block px-1 text-[11px] text-[#6B6B6B]">
                    RJ Print HUB Bot Auto Reply · Typing...
                  </span>
                </div>
              </div>
            )}

            {!isBlocked && (availableFollowUps.length > 0 || activeInquiry) && (
              <div
                className="flex flex-col items-end gap-1.5 pt-1"
                role="group"
                aria-label="Quick-reply options"
              >
                {showAddAnotherService ? (
                  <>
                    {services.map((service) => (
                      <button
                        key={`add-${service.id}`}
                        type="button"
                        onClick={() => {
                          setShowAddAnotherService(false);
                          sendMessage(
                            `Adding another item: ${service.serviceName} (${service.pricePhp})`,
                            undefined,
                            { serviceId: service.id, serviceNames: [service.serviceName], quantity: 1 },
                          );
                        }}
                        className="max-w-[92%] rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        <span>+ {service.serviceName}</span>
                        <span className="ml-1.5 font-normal text-[#525252]">
                          · {service.pricePhp}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowAddAnotherService(false)}
                      className="rounded-full border border-[#EAEAEA] bg-white px-4 py-1 text-[12px] font-medium text-[#525252] hover:bg-[#FAFAFA] cursor-pointer"
                    >
                      Back
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAddAnotherService(true)}
                      className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-semibold text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                    >
                      + Add another item
                    </button>
                    {availableFollowUps.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        className="rounded-full border border-[#38BDF8] bg-white px-4 py-1.5 text-right text-[12.5px] font-medium text-[#151515] shadow-[0_2px_8px_rgba(21,21,21,0.05)] transition-colors hover:bg-[#E0F2FE] cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      {/* Docked message composer footer */}
      <form
        onSubmit={handleComposerSubmit}
        className="shrink-0 border-t border-[#EAEAEA] bg-white px-4 pt-2.5 pb-3"
      >
        {isBlocked && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#991B1B]">
            <span>Chat is blocked. Unblock in Settings to send messages.</span>
            <button
              type="button"
              onClick={handleToggleBlocked}
              className="shrink-0 font-semibold text-[#B91C1C] underline hover:text-[#7F1D1D] cursor-pointer"
            >
              Unblock
            </button>
          </div>
        )}

        {attachmentDataUrl && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-[10px] border border-[#EAEAEA] bg-[#FAFAFA] p-1.5">
            <img
              src={attachmentDataUrl}
              alt="Pending upload"
              className="h-10 w-10 rounded-[6px] object-cover"
            />
            <button
              type="button"
              onClick={() => setAttachmentDataUrl(undefined)}
              aria-label="Remove picture"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[#555555] hover:bg-[#EAEAEA] hover:text-[#151515] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isEmojiOpen && !isBlocked && (
          <div className="mb-2 flex items-center gap-1 rounded-[12px] border border-[#EAEAEA] bg-[#FAFAFA] px-2 py-1.5">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setMessageText((prev) => `${prev}${emoji}`)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] hover:bg-white cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {composerError && <p className="mb-1 text-[12px] text-[#B91C1C]">{composerError}</p>}

        <textarea
          rows={2}
          disabled={isBlocked}
          value={messageText}
          onChange={(event) => {
            setMessageText(event.target.value);
            if (composerError) setComposerError(undefined);
          }}
          onKeyDown={handleComposerKeyDown}
          placeholder="Enter your message..."
          aria-label="Enter your message"
          className="w-full resize-none border-0 bg-transparent px-0 py-1 text-[13.5px] text-[#151515] placeholder:text-[#767676] focus:border-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
          tabIndex={-1}
        />

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isBlocked}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              aria-label="Attach picture"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#5A5A5A] transition-colors hover:bg-[#F4F5F6] hover:text-[#151515] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={isBlocked}
              onClick={() => setIsEmojiOpen((prev) => !prev)}
              aria-label="Insert emoji"
              aria-expanded={isEmojiOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#5A5A5A] transition-colors hover:bg-[#F4F5F6] hover:text-[#151515] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Smile className="h-4 w-4" />
            </button>
          </div>

          <span className="select-none text-[10.5px] font-medium tracking-wide text-[#737373]">
            RJ Print HUB
          </span>

          <button
            type="submit"
            disabled={isBlocked}
            aria-label="Send message"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#38BDF8] text-[#151515] shadow-[0_6px_16px_rgba(56,189,248,0.35)] transition-transform duration-150 hover:scale-105 hover:bg-[#7DD3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898EC] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
