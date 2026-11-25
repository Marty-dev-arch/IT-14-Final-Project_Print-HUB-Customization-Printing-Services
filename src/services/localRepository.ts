import { SERVICE_BY_ID, SERVICES } from '../data/services';
import {
  SEED_CUSTOMERS,
  SEED_INQUIRIES,
} from '../data/seed';
import { createReferenceCode } from '../lib/format';
import {
  hasValidationErrors,
  isValidEmail,
  normalizeContactKey,
  validateAdminLogin,
  validateClientDraft,
  validateInquiryDraft,
  validateReplyText,
  validateStrongPassword,
} from '../lib/validation';
import type {
  AdminCreateDraft,
  AdminLoginDraft,
  AdminProfile,
  AdminSession,
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
import type {
  AuthService,
  CustomerPrefsService,
  DataRepository,
  InquiryStatusCounts,
  StoreSnapshot,
} from './repository';

const STORE_STORAGE_KEY = 'rjhub_store_v1';

function mergeServiceNames(existing?: string, incoming?: string | string[]): string {
  const parts: string[] = [];
  const pushFrom = (val?: string | string[]) => {
    if (!val) return;
    const arr = Array.isArray(val) ? val : [val];
    for (const chunk of arr) {
      for (const token of chunk.split(/\s*(?:&|,|\n)\s*/)) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        parts.push(SERVICE_BY_ID[trimmed]?.serviceName ?? trimmed);
      }
    }
  };
  pushFrom(existing);
  pushFrom(incoming);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of parts) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }
  const concrete = unique.filter((n) => n.toLowerCase() !== 'general inquiry');
  return (concrete.length > 0 ? concrete : unique).join(' & ');
}

function extractServicesFromDraftText(text: string): string[] {
  const lower = text.toLowerCase();
  return SERVICES.filter((s) => lower.includes(s.serviceName.toLowerCase())).map((s) => s.serviceName);
}
const SESSION_STORAGE_KEY = 'rjhub_admin_session_v1';
const ADMIN_ACCOUNTS_STORAGE_KEY = 'rjhub_admin_accounts_v1';
const FAVORITES_STORAGE_KEY = 'rjhub_favorites_v1';
const CUSTOMER_SESSION_STORAGE_KEY = 'rjhub_customer_session_v1';

interface StoredAdminAccount {
  profile: AdminProfile;
  password: string;
}

function cloneSeedSnapshot(): StoreSnapshot {
  return {
    customers: SEED_CUSTOMERS.map((customer) => ({ ...customer })),
    inquiries: SEED_INQUIRIES.map((inquiry) => ({
      ...inquiry,
      responses: inquiry.responses.map((response) => ({ ...response })),
    })),
  };
}

function readStoredSnapshot(): StoreSnapshot {
  try {
    const raw = window.localStorage.getItem(STORE_STORAGE_KEY);
    if (!raw) {
      const seeded = cloneSeedSnapshot();
      window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<StoreSnapshot>;
    if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.inquiries)) {
      throw new Error('Malformed store payload');
    }
    return {
      customers: parsed.customers,
      inquiries: parsed.inquiries,
    };
  } catch {
    const fallback = cloneSeedSnapshot();
    try {
      window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(fallback));
    } catch {
      // Ignore storage quota errors in restricted contexts
    }
    return fallback;
  }
}

function writeStoredSnapshot(snapshot: StoreSnapshot): void {
  window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(snapshot));
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// shortcut: Phase 1 browser storage persists locally; replace with Supabase + backend API in Phase 2.
export const localRepository: DataRepository = {
  getServices(): readonly ServiceItem[] {
    return SERVICES.filter((service) => service.isActive);
  },

  getSnapshot(): StoreSnapshot {
    return readStoredSnapshot();
  },

  listInquiries(filters?: InquiryFilters): Inquiry[] {
    const snapshot = readStoredSnapshot();
    const searchNeedle = filters?.search.trim().toLowerCase() ?? '';
    const statusFilter = filters?.status ?? 'All';

    return snapshot.inquiries
      .filter((inquiry) => {
        if (statusFilter !== 'All' && inquiry.status !== statusFilter) {
          return false;
        }
        if (!searchNeedle) {
          return true;
        }
        const serviceName = SERVICE_BY_ID[inquiry.serviceId]?.serviceName.toLowerCase() ?? '';
        return (
          inquiry.customerNameSnapshot.toLowerCase().includes(searchNeedle) ||
          inquiry.customerContactSnapshot.toLowerCase().includes(searchNeedle) ||
          inquiry.referenceCode.toLowerCase().includes(searchNeedle) ||
          inquiry.message.toLowerCase().includes(searchNeedle) ||
          serviceName.includes(searchNeedle)
        );
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  },

  getInquiryById(id: string): Inquiry | undefined {
    return readStoredSnapshot().inquiries.find((inquiry) => inquiry.id === id);
  },

  getStatusCounts(): InquiryStatusCounts {
    const inquiries = readStoredSnapshot().inquiries;
    let pending = 0;
    let answered = 0;
    let completed = 0;
    for (const inquiry of inquiries) {
      if (inquiry.status === 'Pending') pending += 1;
      else if (inquiry.status === 'Answered') answered += 1;
      else if (inquiry.status === 'Completed') completed += 1;
    }
    return { total: inquiries.length, pending, answered, completed };
  },

  createInquiry(draft: InquiryDraft): Inquiry {
    const isGeneralInquiry = draft.serviceId === 'General Inquiry';
    const errors = validateInquiryDraft(draft, {
      requireService: !isGeneralInquiry,
    });
    if (hasValidationErrors(errors)) {
      throw new Error(Object.values(errors).find(Boolean) ?? 'Invalid inquiry input.');
    }

    const snapshot = readStoredSnapshot();
    const now = new Date().toISOString();
    const trimmedName = draft.customerName.trim();
    const trimmedContact = draft.contactInfo.trim();
    const trimmedEmail = draft.email?.trim() ?? '';
    const trimmedMessage = draft.message.trim();
    const contactSnapshot =
      trimmedEmail && !trimmedContact.toLowerCase().includes(trimmedEmail.toLowerCase())
        ? `${trimmedContact} · ${trimmedEmail}`
        : trimmedContact || trimmedEmail;
    const contactKey = normalizeContactKey(trimmedContact);

    let customer = snapshot.customers.find(
      (item) => normalizeContactKey(item.contactInfo) === contactKey,
    );

    if (!customer) {
      customer = {
        id: createId('cust'),
        fullName: trimmedName,
        contactInfo: trimmedContact,
        notes: '',
        isSample: false,
        createdAt: now,
        updatedAt: now,
      };
      snapshot.customers.unshift(customer);
    } else {
      customer.updatedAt = now;
    }

    const normName = trimmedName.toLowerCase();
    const normEmail = trimmedEmail.toLowerCase();
    const existingInq = snapshot.inquiries.find((i) => {
      if (normEmail && i.customerContactSnapshot.toLowerCase().includes(normEmail)) return true;
      return Boolean(normName && i.customerNameSnapshot.trim().toLowerCase() === normName);
    });

    const incomingNames = mergeServiceNames(undefined, [
      SERVICE_BY_ID[draft.serviceId]?.serviceName ?? draft.serviceId,
      ...extractServicesFromDraftText(trimmedMessage),
    ]);

    if (existingInq) {
      const msgResp: InquiryResponse = {
        id: createId('resp'),
        inquiryId: existingInq.id,
        adminId: customer.id,
        adminDisplayName: trimmedName,
        responseText: trimmedMessage,
        respondedAt: now,
        senderRole: 'customer',
        ...(draft.imageDataUrl ? { imageDataUrl: draft.imageDataUrl } : {}),
      };
      existingInq.customerId = customer.id;
      existingInq.serviceId = draft.serviceId;
      existingInq.orderItem = mergeServiceNames(
        existingInq.orderItem ?? (SERVICE_BY_ID[existingInq.serviceId]?.serviceName || existingInq.serviceId),
        incomingNames,
      );
      existingInq.quantity = (existingInq.quantity ?? 0) + (draft.quantity ?? 1);
      if (draft.reservationFee !== undefined) existingInq.reservationFee = draft.reservationFee;
      existingInq.status = 'Pending';
      existingInq.updatedAt = now;
      existingInq.responses.push(msgResp);
      writeStoredSnapshot(snapshot);
      return existingInq;
    }

    const newInquiry: Inquiry = {
      id: createId('inq'),
      referenceCode: createReferenceCode(snapshot.inquiries.map((item) => item.referenceCode)),
      customerId: customer.id,
      customerNameSnapshot: trimmedName,
      customerContactSnapshot: contactSnapshot,
      isCustomerArchived: false,
      serviceId: draft.serviceId,
      orderItem: incomingNames,
      message: trimmedMessage,
      quantity: draft.quantity ?? 1,
      reservationFee: draft.reservationFee ?? null,
      adminSeenAt: null,
      status: 'Pending',
      isSample: false,
      submittedAt: now,
      updatedAt: now,
      responses: draft.imageDataUrl
        ? [
            {
              id: createId('resp'),
              inquiryId: '',
              adminId: customer.id,
              adminDisplayName: trimmedName,
              responseText: '',
              respondedAt: now,
              senderRole: 'customer',
              imageDataUrl: draft.imageDataUrl,
            },
          ]
        : [],
    };
    if (newInquiry.responses[0]) {
      newInquiry.responses[0].inquiryId = newInquiry.id;
    }

    snapshot.inquiries.unshift(newInquiry);
    writeStoredSnapshot(snapshot);
    return newInquiry;
  },

  updateInquiry(id: string, draft: InquiryDraft): Inquiry {
    const isGeneralInquiry = draft.serviceId === 'General Inquiry';
    const errors = validateInquiryDraft(draft, {
      requireService: !isGeneralInquiry,
    });
    if (hasValidationErrors(errors)) {
      throw new Error(Object.values(errors).find(Boolean) ?? 'Invalid inquiry input.');
    }

    const snapshot = readStoredSnapshot();
    const inquiry = snapshot.inquiries.find((item) => item.id === id);
    if (!inquiry) {
      throw new Error('Inquiry record not found.');
    }

    const trimmedName = draft.customerName.trim();
    const trimmedContact = draft.contactInfo.trim();
    const trimmedEmail = draft.email?.trim() ?? '';
    const trimmedMessage = draft.message.trim();
    const now = new Date().toISOString();

    inquiry.customerNameSnapshot = trimmedName;
    inquiry.customerContactSnapshot = trimmedEmail
      ? `${trimmedContact} · ${trimmedEmail}`
      : trimmedContact;
    inquiry.serviceId = draft.serviceId;
    inquiry.message = trimmedMessage;
    inquiry.updatedAt = now;

    if (inquiry.customerId) {
      const customer = snapshot.customers.find((item) => item.id === inquiry.customerId);
      if (customer) {
        customer.fullName = trimmedName;
        customer.contactInfo = trimmedContact;
        customer.updatedAt = now;
      }
    }

    writeStoredSnapshot(snapshot);
    return inquiry;
  },

  updateInquiryStatus(id: string, status: InquiryStatus): Inquiry {
    const snapshot = readStoredSnapshot();
    const inquiry = snapshot.inquiries.find((item) => item.id === id);
    if (!inquiry) {
      throw new Error('Inquiry record not found.');
    }
    inquiry.status = status;
    inquiry.updatedAt = new Date().toISOString();
    writeStoredSnapshot(snapshot);
    return inquiry;
  },

  addInquiryReply(
    inquiryId: string,
    responseText: string,
    nextStatus?: InquiryStatus,
    imageDataUrl?: string,
  ): { inquiry: Inquiry; response: InquiryResponse } {
    const error = validateReplyText(responseText, Boolean(imageDataUrl));
    if (error) {
      throw new Error(error);
    }

    const snapshot = readStoredSnapshot();
    const inquiry = snapshot.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry) {
      throw new Error('Inquiry record not found.');
    }

    const session = localAuthService.getSession();
    const now = new Date().toISOString();
    const response: InquiryResponse = {
      id: createId('resp'),
      inquiryId: inquiry.id,
      adminId: session?.admin.id ?? 'admin-system',
      adminDisplayName: session?.admin.displayName ?? 'RJ HUB Admin',
      responseText: responseText.trim(),
      respondedAt: now,
      senderRole: 'admin',
      ...(imageDataUrl ? { imageDataUrl } : {}),
    };

    inquiry.responses.push(response);
    inquiry.status = nextStatus ?? (inquiry.status === 'Pending' ? 'Answered' : inquiry.status);
    inquiry.updatedAt = now;
    writeStoredSnapshot(snapshot);
    return { inquiry, response };
  },

  addCustomerMessage(
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
  ): { inquiry: Inquiry; response: InquiryResponse } {
    const error = validateReplyText(messageText, Boolean(imageDataUrl));
    if (error) {
      throw new Error(error);
    }

    const snapshot = readStoredSnapshot();
    const inquiry = snapshot.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry) {
      throw new Error('Inquiry record not found.');
    }

    const now = new Date().toISOString();
    const response: InquiryResponse = {
      id: createId('resp'),
      inquiryId: inquiry.id,
      adminId: inquiry.customerId ?? 'customer',
      adminDisplayName: senderName?.trim() || inquiry.customerNameSnapshot,
      responseText: messageText.trim(),
      respondedAt: now,
      senderRole: 'customer',
      ...(imageDataUrl ? { imageDataUrl } : {}),
    };

    const extraNames: string[] = [];
    if (reservationOpts?.serviceNames) extraNames.push(...reservationOpts.serviceNames);
    if (reservationOpts?.serviceId) extraNames.push(reservationOpts.serviceId);
    if (
      extraNames.length > 0 ||
      /^(Adding another item:|Favorites Inquiry|3D Customizer Draft)/i.test(messageText.trim())
    ) {
      extraNames.push(...extractServicesFromDraftText(messageText));
    }
    if (extraNames.length > 0) {
      const base = inquiry.orderItem ?? (SERVICE_BY_ID[inquiry.serviceId]?.serviceName || inquiry.serviceId);
      inquiry.orderItem = mergeServiceNames(base, extraNames);
      if (reservationOpts?.quantity) {
        inquiry.quantity = (inquiry.quantity ?? 0) + reservationOpts.quantity;
      }
    }

    inquiry.responses.push(response);
    inquiry.status = 'Pending';
    if (reservationOpts?.reservationFee !== undefined) {
      inquiry.reservationFee = reservationOpts.reservationFee;
    }
    inquiry.updatedAt = now;
    writeStoredSnapshot(snapshot);
    return { inquiry, response };
  },

  syncInquiryFromBackend(
    referenceCode: string,
    payload: {
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
    },
  ): boolean {
    const snapshot = readStoredSnapshot();
    const idx = snapshot.inquiries.findIndex((item) => item.referenceCode === referenceCode);
    if (idx < 0) return false;
    const current = snapshot.inquiries[idx]!;
    const existingKeys = new Set(
      current.responses.map((r) => `${r.senderRole}:${r.responseText}:${r.respondedAt.slice(0, 16)}`),
    );

    const nextSeenAt = payload.adminSeenAt ?? current.adminSeenAt ?? null;
    const nextResFee =
      payload.reservationFee !== undefined ? payload.reservationFee : current.reservationFee;
    const nextOrderItem = payload.orderItem || current.orderItem;
    let changed =
      current.status !== payload.status ||
      current.orderItem !== nextOrderItem ||
      (current.adminSeenAt ?? null) !== nextSeenAt ||
      current.reservationFee !== nextResFee;
    const mergedResponses = [...current.responses];
    for (const remote of payload.responses) {
      if (mergedResponses.some((r) => r.id === remote.id)) continue;
      const dedupeKey = `${remote.senderRole}:${remote.responseText}:${remote.respondedAt.slice(0, 16)}`;
      if (existingKeys.has(dedupeKey)) continue;
      mergedResponses.push({
        id: remote.id,
        inquiryId: current.id,
        adminId: remote.adminId ?? 'admin',
        adminDisplayName: remote.adminDisplayName,
        responseText: remote.responseText,
        respondedAt: remote.respondedAt,
        senderRole: remote.senderRole,
        ...(remote.imageDataUrl ? { imageDataUrl: remote.imageDataUrl } : {}),
      });
      changed = true;
    }

    if (!changed) return false;
    snapshot.inquiries[idx] = {
      ...current,
      status: payload.status,
      orderItem: nextOrderItem,
      adminSeenAt: nextSeenAt,
      reservationFee: nextResFee,
      updatedAt: payload.updatedAt,
      responses: mergedResponses,
    };
    writeStoredSnapshot(snapshot);
    return true;
  },

  removeInquiryByRef(referenceCode: string): boolean {
    const snapshot = readStoredSnapshot();
    const nextInquiries = snapshot.inquiries.filter((i) => i.referenceCode !== referenceCode);
    if (nextInquiries.length === snapshot.inquiries.length) return false;
    snapshot.inquiries = nextInquiries;
    writeStoredSnapshot(snapshot);
    return true;
  },

  upsertRemoteInquiry(remote: {
    id: string;
    referenceCode: string;
    customerId: string | null;
    customerNameSnapshot: string;
    customerContactSnapshot: string;
    serviceId: string;
    orderItem?: string;
    message: string;
    status: InquiryStatus;
    adminSeenAt?: string | null;
    quantity?: number;
    reservationFee?: number | null;
    submittedAt: string;
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
  }): Inquiry {
    const snapshot = readStoredSnapshot();
    const mappedResponses: InquiryResponse[] = remote.responses.map((r) => ({
      id: r.id,
      inquiryId: remote.id,
      adminId: r.adminId ?? 'admin',
      adminDisplayName: r.adminDisplayName,
      responseText: r.responseText,
      respondedAt: r.respondedAt,
      senderRole: r.senderRole,
      ...(r.imageDataUrl ? { imageDataUrl: r.imageDataUrl } : {}),
    }));
    const idx = snapshot.inquiries.findIndex(
      (i) => i.referenceCode === remote.referenceCode || i.id === remote.id,
    );
    const merged: Inquiry = {
      id: idx >= 0 ? snapshot.inquiries[idx]!.id : remote.id,
      referenceCode: remote.referenceCode,
      customerId: remote.customerId,
      customerNameSnapshot: remote.customerNameSnapshot,
      customerContactSnapshot: remote.customerContactSnapshot,
      isCustomerArchived: false,
      serviceId: remote.serviceId,
      orderItem:
        remote.orderItem ||
        SERVICE_BY_ID[remote.serviceId]?.serviceName ||
        remote.serviceId,
      message: remote.message,
      quantity: remote.quantity ?? 1,
      reservationFee: remote.reservationFee ?? null,
      adminSeenAt: remote.adminSeenAt ?? null,
      status: remote.status,
      isSample: false,
      submittedAt: remote.submittedAt,
      updatedAt: remote.updatedAt,
      responses: mappedResponses,
    };
    if (idx >= 0) {
      snapshot.inquiries[idx] = merged;
    } else {
      snapshot.inquiries.unshift(merged);
    }
    writeStoredSnapshot(snapshot);
    return merged;
  },

  listClients(search = ''): Customer[] {
    const needle = search.trim().toLowerCase();
    const customers = readStoredSnapshot().customers;
    return customers
      .filter((customer) => {
        if (!needle) return true;
        return (
          customer.fullName.toLowerCase().includes(needle) ||
          customer.contactInfo.toLowerCase().includes(needle) ||
          customer.notes.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  getClientById(id: string): Customer | undefined {
    return readStoredSnapshot().customers.find((customer) => customer.id === id);
  },

  getClientInquiries(clientId: string): Inquiry[] {
    return readStoredSnapshot()
      .inquiries.filter((inquiry) => inquiry.customerId === clientId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  },

  createClient(draft: ClientDraft): Customer {
    const errors = validateClientDraft(draft);
    if (hasValidationErrors(errors)) {
      throw new Error(Object.values(errors).find(Boolean) ?? 'Invalid client input.');
    }

    const snapshot = readStoredSnapshot();
    const now = new Date().toISOString();
    const customer: Customer = {
      id: createId('cust'),
      fullName: draft.fullName.trim(),
      contactInfo: draft.contactInfo.trim(),
      notes: draft.notes.trim(),
      isSample: false,
      createdAt: now,
      updatedAt: now,
    };
    snapshot.customers.unshift(customer);
    writeStoredSnapshot(snapshot);
    return customer;
  },

  updateClient(id: string, draft: ClientDraft): Customer {
    const errors = validateClientDraft(draft);
    if (hasValidationErrors(errors)) {
      throw new Error(Object.values(errors).find(Boolean) ?? 'Invalid client input.');
    }

    const snapshot = readStoredSnapshot();
    const customer = snapshot.customers.find((item) => item.id === id);
    if (!customer) {
      throw new Error('Client record not found.');
    }

    const now = new Date().toISOString();
    customer.fullName = draft.fullName.trim();
    customer.contactInfo = draft.contactInfo.trim();
    customer.notes = draft.notes.trim();
    customer.updatedAt = now;

    // Keep linked inquiry snapshots aligned with active client contact updates.
    for (const inquiry of snapshot.inquiries) {
      if (inquiry.customerId === id && !inquiry.isCustomerArchived) {
        inquiry.customerNameSnapshot = customer.fullName;
        inquiry.customerContactSnapshot = customer.contactInfo;
      }
    }

    writeStoredSnapshot(snapshot);
    return customer;
  },

  deleteClient(id: string): { deletedClientId: string; archivedInquiryCount: number } {
    const snapshot = readStoredSnapshot();
    const exists = snapshot.customers.some((customer) => customer.id === id);
    if (!exists) {
      throw new Error('Client record not found.');
    }

    snapshot.customers = snapshot.customers.filter((customer) => customer.id !== id);
    let archivedInquiryCount = 0;
    const now = new Date().toISOString();

    // Keep inquiry messages & customer snapshot intact when deleting a client record
    for (const inquiry of snapshot.inquiries) {
      if (inquiry.customerId === id) {
        inquiry.customerId = null;
        inquiry.updatedAt = now;
        archivedInquiryCount += 1;
      }
    }

    writeStoredSnapshot(snapshot);
    return { deletedClientId: id, archivedInquiryCount };
  },

  resetDemoData(): StoreSnapshot {
    const seeded = cloneSeedSnapshot();
    writeStoredSnapshot(seeded);
    return seeded;
  },
};

function readAdminAccounts(): StoredAdminAccount[] {
  try {
    const raw = window.localStorage.getItem(ADMIN_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredAdminAccount[]) : [];
  } catch {
    return [];
  }
}

// shortcut: Phase 1 sessionStorage auth gate; replace with Supabase Auth + admin_profiles check in Phase 2.
export const localAuthService: AuthService = {
  getSession(): AdminSession | null {
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AdminSession>;
      if (!parsed.admin?.id || !parsed.admin.email) return null;
      return parsed as AdminSession;
    } catch {
      return null;
    }
  },

  signIn(credentials: AdminLoginDraft): AdminSession {
    const errors = validateAdminLogin(credentials);
    if (hasValidationErrors(errors)) {
      throw new Error(Object.values(errors).find(Boolean) ?? 'Invalid login input.');
    }

    const normalizedEmail = credentials.email.trim().toLowerCase();
    const matched = readAdminAccounts().find(
      (account) =>
        account.profile.email.toLowerCase() === normalizedEmail &&
        account.password === credentials.password,
    );
    if (!matched) {
      throw new Error('Invalid administrator email or password.');
    }

    const session: AdminSession = {
      admin: matched.profile,
      signedInAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  },

  registerAdmin(draft: AdminCreateDraft): AdminSession {
    const email = draft.email.trim().toLowerCase();
    const password = draft.password;

    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.');
    }
    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      throw new Error(passwordError);
    }

    const rawHandle = (email.split('@')[0] ?? 'admin').replace(/[._-]+/g, ' ').trim();
    const derivedName = rawHandle
      ? rawHandle.replace(/\b\w/g, (ch) => ch.toUpperCase())
      : 'Admin';
    const displayName = (draft.displayName ?? '').trim() || derivedName;

    const existing = readAdminAccounts();
    if (existing.some((account) => account.profile.email.toLowerCase() === email)) {
      throw new Error('An admin account with this email already exists.');
    }

    const newProfile: AdminProfile = {
      id: createId('admin'),
      email,
      displayName,
      role: draft.role ?? 'admin',
    };
    const nextAccounts: StoredAdminAccount[] = [
      ...existing,
      { profile: newProfile, password },
    ];
    try {
      window.localStorage.setItem(ADMIN_ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts));
    } catch {
      // Ignore storage quota errors in restricted contexts
    }

    const session: AdminSession = {
      admin: newProfile,
      signedInAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  },

  updateAdminProfile(patch: ProfileUpdateDraft): AdminSession | null {
    const current = this.getSession();
    if (!current) return null;

    const nextProfile: AdminProfile = {
      ...current.admin,
      displayName: patch.fullName !== undefined ? patch.fullName.trim() || current.admin.displayName : current.admin.displayName,
      email: patch.email !== undefined ? patch.email.trim().toLowerCase() || current.admin.email : current.admin.email,
      avatarDataUrl:
        patch.avatarDataUrl === null
          ? undefined
          : patch.avatarDataUrl !== undefined
            ? patch.avatarDataUrl
            : current.admin.avatarDataUrl,
    };

    const nextAccounts = readAdminAccounts().map((account) =>
      account.profile.id === current.admin.id
        ? { ...account, profile: nextProfile }
        : account,
    );
    try {
      window.localStorage.setItem(ADMIN_ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts));
    } catch {
      // Ignore storage quota errors
    }

    const updatedSession: AdminSession = {
      ...current,
      admin: nextProfile,
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
    return updatedSession;
  },

  signOut(): void {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  },
};

const CUSTOMER_PROFILES_KEY = 'rjhub_customer_profiles_v1';
const LAST_SAVED_ACCOUNT_KEY = 'rjhub_last_saved_account_v1';

function readCustomerProfilesMap(): Record<string, Partial<CustomerSession>> {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_PROFILES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Partial<CustomerSession>>) : {};
  } catch {
    return {};
  }
}

function saveCustomerProfileEntry(session: CustomerSession) {
  try {
    const map = readCustomerProfilesMap();
    map[session.email.toLowerCase()] = {
      id: session.id,
      fullName: session.fullName,
      email: session.email,
      avatarDataUrl: session.avatarDataUrl,
      roleTitle: session.roleTitle,
      defaultServiceId: session.defaultServiceId,
    };
    window.localStorage.setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

// shortcut: Phase 1 browser Google sign-in & favorite storage; replace with Supabase OAuth in Phase 2.
export const localCustomerPrefsService: CustomerPrefsService = {
  getFavorites(): string[] {
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : [];
    } catch {
      return [];
    }
  },

  toggleFavorite(serviceId: string): string[] {
    const current = this.getFavorites();
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
    return next;
  },

  getCustomerSession(): CustomerSession | null {
    try {
      const raw = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CustomerSession>;
      if (!parsed.id || !parsed.fullName || !parsed.email) return null;
      return parsed as CustomerSession;
    } catch {
      return null;
    }
  },

  getLastSavedCustomerAccount(): CustomerSession | null {
    try {
      const raw = window.localStorage.getItem(LAST_SAVED_ACCOUNT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CustomerSession>;
      if (!parsed.id || !parsed.fullName || !parsed.email) return null;
      return parsed as CustomerSession;
    } catch {
      return null;
    }
  },

  signInWithGoogle(
    fullName = 'Google Customer',
    email = 'customer@gmail.com',
    avatarDataUrl?: string,
  ): CustomerSession {
    const cleanName = fullName.trim() || 'Google Customer';
    const cleanEmail =
      email.trim().toLowerCase() ||
      `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'customer'}@gmail.com`;
    const saved = readCustomerProfilesMap()[cleanEmail];
    const session: CustomerSession = {
      id: saved?.id || createId('cust-google'),
      fullName: cleanName,
      email: cleanEmail,
      avatarDataUrl: avatarDataUrl ?? saved?.avatarDataUrl,
      roleTitle: saved?.roleTitle,
      defaultServiceId: saved?.defaultServiceId,
      provider: 'google',
      signedInAt: new Date().toISOString(),
    };
    saveCustomerProfileEntry(session);
    try {
      window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
      window.localStorage.setItem(LAST_SAVED_ACCOUNT_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage quota errors
    }
    return session;
  },

  updateCustomerProfile(patch: ProfileUpdateDraft): CustomerSession {
    const existing = this.getCustomerSession() ?? this.signInWithGoogle();
    const updated: CustomerSession = {
      ...existing,
      fullName: patch.fullName !== undefined ? patch.fullName.trim() || existing.fullName : existing.fullName,
      email: patch.email !== undefined ? patch.email.trim().toLowerCase() || existing.email : existing.email,
      avatarDataUrl:
        patch.avatarDataUrl === null
          ? undefined
          : patch.avatarDataUrl !== undefined
            ? patch.avatarDataUrl
            : existing.avatarDataUrl,
      roleTitle: patch.roleTitle !== undefined ? patch.roleTitle.trim() : existing.roleTitle,
      defaultServiceId:
        patch.defaultServiceId !== undefined ? patch.defaultServiceId : existing.defaultServiceId,
    };
    saveCustomerProfileEntry(updated);
    try {
      window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(updated));
      window.localStorage.setItem(LAST_SAVED_ACCOUNT_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
    return updated;
  },

  signOutCustomer(): void {
    try {
      window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  },
};
