import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityLogRecord,
  AdminRecord,
  AdminSessionRecord,
  BackendStore,
  ClientOrderStatus,
  CustomerAccountRecord,
  CustomerRecord,
  InquiryRecord,
  InquiryResponseRecord,
  InquiryStatus,
  ReviewRecord,
  SecurityLogRecord,
  ServiceRecord,
} from './types.js';
import { redactSecrets } from '../security/crypto.js';

const SERVICE_META: Record<string, { name: string; unit: number; reservation: number }> = {
  lamination: { name: 'Lamination', unit: 20, reservation: 100 },
  'souvenir-making': { name: 'Souvenir Making', unit: 45, reservation: 300 },
  'document-printing': { name: 'Document Printing', unit: 5, reservation: 50 },
  'sintra-board': { name: 'Sintra Board', unit: 180, reservation: 200 },
  'laser-engraving': { name: 'Laser Engraving', unit: 150, reservation: 250 },
  'mug-customization': { name: 'Mug Customization', unit: 120, reservation: 150 },
  'custom-keychains': { name: 'Custom Keychains', unit: 35, reservation: 100 },
  'a4-calendar': { name: 'A4 Calendar', unit: 85, reservation: 150 },
  'refrigerator-magnets': { name: 'Refrigerator Magnets', unit: 35, reservation: 150 },
};

function resolveServiceDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return SERVICE_META[trimmed]?.name ?? SERVICE_META[trimmed.toLowerCase()]?.name ?? trimmed;
}

function mergeServiceItems(existing?: string, incoming?: string | string[]): string {
  const parts: string[] = [];
  const pushFrom = (val?: string | string[]) => {
    if (!val) return;
    const arr = Array.isArray(val) ? val : [val];
    for (const chunk of arr) {
      for (const token of chunk.split(/\s*(?:&|,|\n)\s*/)) {
        const mapped = resolveServiceDisplayName(token);
        if (mapped) parts.push(mapped);
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

function extractServiceNamesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: Array<{ idx: number; name: string }> = [];
  for (const meta of Object.values(SERVICE_META)) {
    const idx = lower.indexOf(meta.name.toLowerCase());
    if (idx >= 0) matched.push({ idx, name: meta.name });
  }
  matched.sort((a, b) => a.idx - b.idx);
  return matched.map((m) => m.name);
}

function extractQtyFromMessage(msg: string): number {
  const m =
    /Qty:\s*(\d+)/i.exec(msg) ??
    /×\s*(\d+)/.exec(msg) ??
    /(\d+)\s*(?:pcs|pc|pieces|mugs|sheets|sets|items)\b/i.exec(msg);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) return Math.min(9999, Math.round(n));
  }
  return 1;
}

function computeInquiryPricing(input: {
  serviceId: string;
  message: string;
  quantity?: number;
  totalPrice?: number;
  reservationFee?: number | null;
  wantsReservation?: boolean;
}) {
  const meta = SERVICE_META[input.serviceId];
  const quantity =
    typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 1
      ? Math.min(9999, Math.round(input.quantity))
      : extractQtyFromMessage(input.message);
  const totalPrice =
    typeof input.totalPrice === 'number' && Number.isFinite(input.totalPrice) && input.totalPrice >= 0
      ? input.totalPrice
      : meta
        ? meta.unit * quantity
        : 0;
  const reservationFee =
    input.reservationFee !== undefined
      ? input.reservationFee
      : input.wantsReservation && meta
        ? meta.reservation
        : null;
  const extracted = extractServiceNamesFromText(input.message);
  const baseName = resolveServiceDisplayName(input.serviceId);
  const orderItem = mergeServiceItems(undefined, [baseName, ...extracted]) || baseName;
  return { quantity, totalPrice, reservationFee, orderItem };
}

function extractEmailFromText(value: string): string {
  const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value);
  return match?.[0]?.toLowerCase() ?? '';
}

function extractPhoneDigits(value: string): string {
  const cleaned = value.replace(/[\s()-]/g, '').replace(/(?:\+?63)(9\d{9})/g, '0$1');
  const match = /0\d{9,10}/.exec(cleaned);
  return match?.[0] ?? '';
}

function mergePhoneIntoContact(existing: string, candidateText: string): string {
  const foundPhone = extractPhoneDigits(candidateText);
  if (!foundPhone) return existing;
  if (extractPhoneDigits(existing) === foundPhone || existing.includes(foundPhone)) {
    return existing;
  }
  return existing ? `${foundPhone} · ${existing}` : foundPhone;
}

function stripLegacyDotEmail(value: string): string {
  return value.replace(/google\.customer@gmail\.com/gi, 'googlecustomer@gmail.com');
}

function sameCustomerIdentity(
  a: { name?: string; email?: string; contact?: string },
  b: { name?: string; email?: string; contact?: string },
): boolean {
  const emailA = stripLegacyDotEmail(a.email || extractEmailFromText(a.contact || ''))
    .trim()
    .toLowerCase();
  const emailB = stripLegacyDotEmail(b.email || extractEmailFromText(b.contact || ''))
    .trim()
    .toLowerCase();
  if (emailA && emailB && emailA === emailB) return true;

  const phoneA = extractPhoneDigits(a.contact || '');
  const phoneB = extractPhoneDigits(b.contact || '');
  if (phoneA && phoneB && phoneA === phoneB) return true;

  const nameA = (a.name || '').trim().toLowerCase();
  const nameB = (b.name || '').trim().toLowerCase();
  return Boolean(nameA && nameB && nameA === nameB);
}

function customerThreadKey(email?: string, contact?: string, name?: string): string {
  const em = stripLegacyDotEmail(email || extractEmailFromText(contact || ''))
    .trim()
    .toLowerCase();
  if (em) return `email:${em}`;
  const ph = extractPhoneDigits(contact || '');
  if (ph) return `phone:${ph}`;
  return `name:${(name || '').trim().toLowerCase()}`;
}

const ACTIVE_SERVICES: ServiceRecord[] = [
  { id: 'lamination', serviceName: 'Lamination', description: 'Protective matte or gloss film sealing for IDs, certificates, menus, and frequent-use prints.', isActive: true },
  { id: 'souvenir-making', serviceName: 'Souvenir Making', description: 'Customized event keepsakes and giveaways tailored for birthdays and milestones.', isActive: true },
  { id: 'document-printing', serviceName: 'Document Printing', description: 'Clear black-and-white or full-color bond & photo prints.', isActive: true },
  { id: 'sintra-board', serviceName: 'Sintra Board', description: 'High-resolution mounted portrait and wall signage boards with rigid backing.', isActive: true },
  { id: 'laser-engraving', serviceName: 'Laser Engraving', description: 'Precision etched lettering, logos, and markings on pens, plaques, and brushes.', isActive: true },
  { id: 'mug-customization', serviceName: 'Mug Customization', description: 'Vibrant heat-transferred ceramic mug prints for gifts and merchandise.', isActive: true },
  { id: 'custom-keychains', serviceName: 'Custom Keychains', description: 'Clear double-sided acrylic photo keychains with metal split-ring loops.', isActive: true },
  { id: 'a4-calendar', serviceName: 'A4 Calendar', description: 'Custom family and brand wall calendars with photo headers.', isActive: true },
  { id: 'refrigerator-magnets', serviceName: 'Refrigerator Magnets', description: 'Full-color custom acrylic magnets sized for event favors and keepsakes.', isActive: true },
];

interface LocalSnapshot {
  admins: AdminRecord[];
  sessions: AdminSessionRecord[];
  customerAccounts: CustomerAccountRecord[];
  customers: CustomerRecord[];
  inquiries: InquiryRecord[];
  totalInquirySubmissions?: number;
  activityLogs: ActivityLogRecord[];
  securityLogs: SecurityLogRecord[];
  reviews: ReviewRecord[];
  rateLimits: Record<string, { count: number; resetAt: string }>;
}

const EMPTY_SNAPSHOT: LocalSnapshot = {
  admins: [],
  sessions: [],
  customerAccounts: [],
  customers: [],
  inquiries: [],
  totalInquirySubmissions: 0,
  activityLogs: [],
  securityLogs: [],
  reviews: [],
  rateLimits: {},
};

function paginate<T extends { createdAt: string }>(
  list: T[],
  page = 1,
  pageSize = 20,
): { items: T[]; total: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const start = (safePage - 1) * safeSize;
  return {
    items: list.slice(start, start + safeSize),
    total: list.length,
  };
}

function makeRefCode(inquiries: InquiryRecord[]): string {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  for (const inq of inquiries) {
    const m = /^RJH-\d{4}-(\d+)$/.exec(inq.referenceCode);
    if (m?.[1]) {
      maxSeq = Math.max(maxSeq, Number(m[1]));
    }
  }
  return `RJH-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

function normalizeContact(value: string): string {
  const v = value.trim();
  return v.includes('@') ? v.toLowerCase() : v.replace(/\D/g, '');
}

export class LocalFileStore implements BackendStore {
  private data: LocalSnapshot;
  private readonly filePath: string | null;

  constructor(filePath: string | null = path.resolve(process.cwd(), '.local-data/store.json')) {
    this.filePath = filePath;
    this.data = structuredClone(EMPTY_SNAPSHOT);
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<LocalSnapshot>;
        this.data = { ...structuredClone(EMPTY_SNAPSHOT), ...parsed };
        this.data.customerAccounts = this.data.customerAccounts.map((acc) => ({
          ...acc,
          email: stripLegacyDotEmail(acc.email),
        }));
        this.data.customers = this.data.customers.map((c) => ({
          ...c,
          contactInfo: stripLegacyDotEmail(c.contactInfo),
          orderStatus:
            (c.orderStatus as string | undefined) === 'In Progress'
              ? 'Pending'
              : (c.orderStatus ?? 'Pending'),
        }));
        const normalizedInqs = this.data.inquiries.map((inq) => ({
          ...inq,
          customerContactSnapshot: stripLegacyDotEmail(inq.customerContactSnapshot),
          customerEmail: inq.customerEmail
            ? stripLegacyDotEmail(inq.customerEmail)
            : extractEmailFromText(stripLegacyDotEmail(inq.customerContactSnapshot)) || undefined,
        }));
        // Collapse duplicate inquiry threads for the same Gmail or customer name into 1 unified thread
        const sortedChron = [...normalizedInqs].sort(
          (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
        );
        const byCustomerKey = new Map<string, InquiryRecord>();
        for (const inq of sortedChron) {
          const key = customerThreadKey(inq.customerEmail, inq.customerContactSnapshot, inq.customerNameSnapshot);
          const existing = byCustomerKey.get(key);
          if (!existing) {
            byCustomerKey.set(key, { ...inq, responses: [...inq.responses] });
          } else {
            if (inq.message && inq.message !== existing.message) {
              existing.responses.push({
                id: `${inq.id}-msg`,
                inquiryId: existing.id,
                adminId: inq.customerId,
                adminDisplayName: inq.customerNameSnapshot,
                senderRole: 'customer',
                responseText: inq.message,
                respondedAt: inq.submittedAt,
              });
            }
            for (const r of inq.responses) {
              existing.responses.push({ ...r, inquiryId: existing.id });
            }
            existing.serviceId = inq.serviceId;
            existing.quantity = inq.quantity ?? existing.quantity;
            existing.totalPrice = inq.totalPrice ?? existing.totalPrice;
            existing.reservationFee = inq.reservationFee ?? existing.reservationFee;
            existing.updatedAt = inq.updatedAt;
            existing.customerAvatarUrl = inq.customerAvatarUrl || existing.customerAvatarUrl;
          }
        }
        this.data.inquiries = Array.from(byCustomerKey.values()).sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        this.data.totalInquirySubmissions =
          typeof this.data.totalInquirySubmissions === 'number' &&
          this.data.totalInquirySubmissions >= normalizedInqs.length
            ? this.data.totalInquirySubmissions
            : normalizedInqs.length;
      } catch {
        this.data = structuredClone(EMPTY_SNAPSHOT);
      }
    }
  }

  private persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  async getServices(): Promise<ServiceRecord[]> {
    return ACTIVE_SERVICES.filter((s) => s.isActive);
  }

  async listAdmins(): Promise<AdminRecord[]> {
    return [...this.data.admins];
  }

  async findAdminByEmail(email: string): Promise<AdminRecord | null> {
    const needle = email.trim().toLowerCase();
    return this.data.admins.find((a) => a.email.toLowerCase() === needle) ?? null;
  }

  async findAdminById(id: string): Promise<AdminRecord | null> {
    return this.data.admins.find((a) => a.id === id) ?? null;
  }

  async upsertProvisionedAdmin(
    admin: Omit<AdminRecord, 'id' | 'createdAt'> & { id?: string },
  ): Promise<AdminRecord> {
    const idx = this.data.admins.findIndex(
      (a) => a.email.toLowerCase() === admin.email.trim().toLowerCase(),
    );
    const now = new Date().toISOString();
    if (idx >= 0) {
      const updated: AdminRecord = { ...this.data.admins[idx]!, ...admin, id: this.data.admins[idx]!.id };
      this.data.admins[idx] = updated;
      this.persist();
      return updated;
    }
    const created: AdminRecord = {
      ...admin,
      id: admin.id ?? crypto.randomUUID(),
      createdAt: now,
    };
    this.data.admins.push(created);
    this.persist();
    return created;
  }

  async updateAdminSecurity(id: string, patch: Partial<AdminRecord>): Promise<void> {
    const idx = this.data.admins.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.data.admins[idx] = { ...this.data.admins[idx]!, ...patch };
      this.persist();
    }
  }

  async createSession(
    session: Omit<AdminSessionRecord, 'id' | 'createdAt'>,
  ): Promise<AdminSessionRecord> {
    const record: AdminSessionRecord = {
      ...session,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.data.sessions.push(record);
    this.persist();
    return record;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | null> {
    return this.data.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
  }

  async updateSession(
    id: string,
    patch: Partial<AdminSessionRecord>,
  ): Promise<AdminSessionRecord | null> {
    const idx = this.data.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const next = { ...this.data.sessions[idx]!, ...patch };
    this.data.sessions[idx] = next;
    this.persist();
    return next;
  }

  async listAdminSessions(adminId?: string): Promise<AdminSessionRecord[]> {
    return this.data.sessions
      .filter((s) => !adminId || s.adminId === adminId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async revokeSession(id: string): Promise<void> {
    await this.updateSession(id, { revokedAt: new Date().toISOString() });
  }

  async revokeAllOtherSessions(adminId: string, exceptSessionId: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    this.data.sessions = this.data.sessions.map((s) => {
      if (s.adminId === adminId && s.id !== exceptSessionId && !s.revokedAt) {
        count += 1;
        return { ...s, revokedAt: now };
      }
      return s;
    });
    this.persist();
    return count;
  }

  async upsertGoogleCustomer(input: {
    googleSub: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  }): Promise<CustomerAccountRecord> {
    const now = new Date().toISOString();
    const emailNorm = input.email.trim().toLowerCase();
    const existingAccount = this.data.customerAccounts.find(
      (c) => c.googleSub === input.googleSub || c.email.toLowerCase() === emailNorm,
    );
    const customer = this.data.customers.find(
      (c) => normalizeContact(c.contactInfo) === emailNorm,
    );

    if (existingAccount) {
      const updated: CustomerAccountRecord = {
        ...existingAccount,
        fullName: input.fullName.trim(),
        avatarUrl: input.avatarUrl ?? existingAccount.avatarUrl,
        customerId: existingAccount.customerId ?? customer?.id ?? null,
        lastLoginAt: now,
      };
      this.data.customerAccounts = this.data.customerAccounts.map((a) =>
        a.id === existingAccount.id ? updated : a,
      );
      this.persist();
      return updated;
    }

    const created: CustomerAccountRecord = {
      id: crypto.randomUUID(),
      customerId: customer?.id ?? null,
      googleSub: input.googleSub,
      email: emailNorm,
      fullName: input.fullName.trim(),
      avatarUrl: input.avatarUrl,
      lastLoginAt: now,
      createdAt: now,
    };
    this.data.customerAccounts.push(created);
    this.persist();
    return created;
  }

  async updateCustomerAvatar(input: {
    email?: string;
    fullName?: string;
    avatarUrl: string | null;
  }): Promise<void> {
    const emailNorm = stripLegacyDotEmail(input.email?.trim().toLowerCase() ?? '');
    const nameNorm = input.fullName?.trim().toLowerCase() ?? '';
    let changed = false;

    if (emailNorm) {
      const existingAcc = this.data.customerAccounts.find((a) => a.email.toLowerCase() === emailNorm);
      if (existingAcc) {
        existingAcc.avatarUrl = input.avatarUrl ?? undefined;
        if (input.fullName?.trim()) existingAcc.fullName = input.fullName.trim();
        changed = true;
      } else {
        const now = new Date().toISOString();
        this.data.customerAccounts.push({
          id: crypto.randomUUID(),
          customerId: null,
          googleSub: `profile-${crypto.createHash('sha256').update(emailNorm).digest('hex').slice(0, 16)}`,
          email: emailNorm,
          fullName: input.fullName?.trim() || 'Google Customer',
          avatarUrl: input.avatarUrl ?? undefined,
          lastLoginAt: now,
          createdAt: now,
        });
        changed = true;
      }
    } else if (nameNorm) {
      for (const acc of this.data.customerAccounts) {
        if (acc.fullName.toLowerCase() === nameNorm) {
          acc.avatarUrl = input.avatarUrl ?? undefined;
          changed = true;
        }
      }
    }

    for (const inq of this.data.inquiries) {
      const inqEmail = (inq.customerEmail ?? extractEmailFromText(inq.customerContactSnapshot)).toLowerCase();
      const matches = emailNorm
        ? inqEmail === emailNorm
        : Boolean(nameNorm && !inqEmail && inq.customerNameSnapshot.toLowerCase() === nameNorm);
      if (matches) {
        inq.customerAvatarUrl = input.avatarUrl ?? undefined;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private resolveLocalAvatar(
    name: string,
    contact: string,
    explicit?: string,
    email?: string,
  ): string | undefined {
    const emailNorm = (email || extractEmailFromText(contact)).toLowerCase();
    if (emailNorm) {
      const byEmail = this.data.customerAccounts.find((a) => a.email.toLowerCase() === emailNorm);
      if (byEmail?.avatarUrl) return byEmail.avatarUrl;
      return explicit;
    }
    if (explicit) return explicit;
    const nameLower = name.trim().toLowerCase();
    const byName = this.data.customerAccounts.find(
      (a) => nameLower && a.fullName.toLowerCase() === nameLower,
    );
    return byName?.avatarUrl;
  }

  private syncCustomerFromInquiry(customer: CustomerRecord, inquiry: InquiryRecord, now: string) {
    const pricing = computeInquiryPricing({
      serviceId: inquiry.serviceId,
      message: inquiry.message,
      quantity: inquiry.quantity,
      totalPrice: inquiry.totalPrice,
      reservationFee: inquiry.reservationFee,
    });
    const combinedItem = mergeServiceItems(
      customer.orderStatus === 'Pending' ? customer.orderItem : undefined,
      inquiry.orderItem || pricing.orderItem,
    );
    customer.orderItem = combinedItem || inquiry.orderItem || pricing.orderItem;
    customer.quantity = pricing.quantity;
    customer.totalPrice = pricing.totalPrice;
    customer.reservationFee = pricing.reservationFee ?? customer.reservationFee ?? null;
    customer.orderDate = inquiry.submittedAt.slice(0, 10);
    if (!customer.orderStatus) {
      customer.orderStatus = 'Pending';
    }
    customer.updatedAt = now;
  }

  async createInquiry(input: {
    customerName: string;
    contactInfo: string;
    email?: string;
    serviceId: string;
    message: string;
    referenceCode?: string;
    avatarUrl?: string;
    quantity?: number;
    totalPrice?: number;
    reservationFee?: number | null;
    wantsReservation?: boolean;
    imageDataUrl?: string;
  }): Promise<InquiryRecord> {
    const now = new Date().toISOString();
    const emailNorm = input.email ? stripLegacyDotEmail(input.email.trim().toLowerCase()) : '';
    const pricing = computeInquiryPricing(input);
    const rawContactTrimmed = input.contactInfo.trim();
    const contactSnapshot = mergePhoneIntoContact(
      emailNorm && !rawContactTrimmed.toLowerCase().includes(emailNorm)
        ? `${rawContactTrimmed} · ${emailNorm}`
        : rawContactTrimmed || emailNorm,
      input.message,
    );

    const incomingIdentity = {
      name: input.customerName.trim(),
      email: emailNorm,
      contact: contactSnapshot,
    };

    let customer = this.data.customers.find((c) =>
      sameCustomerIdentity({ name: c.fullName, contact: c.contactInfo }, incomingIdentity),
    );

    if (!customer) {
      customer = {
        id: crypto.randomUUID(),
        fullName: input.customerName.trim(),
        contactInfo: contactSnapshot,
        notes: '',
        orderItem: pricing.orderItem,
        quantity: pricing.quantity,
        totalPrice: pricing.totalPrice,
        reservationFee: pricing.reservationFee,
        orderDate: now.slice(0, 10),
        orderStatus: 'Pending',
        statusUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.data.customers.unshift(customer);
    } else {
      const wasPending = (customer.orderStatus ?? 'Pending') === 'Pending';
      customer.orderItem = wasPending
        ? mergeServiceItems(customer.orderItem, pricing.orderItem)
        : pricing.orderItem;
      customer.quantity = wasPending ? (customer.quantity ?? 0) + pricing.quantity : pricing.quantity;
      customer.totalPrice = wasPending
        ? (customer.totalPrice ?? 0) + pricing.totalPrice
        : pricing.totalPrice;
      if (pricing.reservationFee !== null) {
        customer.reservationFee = pricing.reservationFee;
      }
      customer.orderDate = now.slice(0, 10);
      if (extractPhoneDigits(contactSnapshot)) {
        customer.contactInfo = mergePhoneIntoContact(customer.contactInfo, contactSnapshot);
      }
      if (!wasPending) {
        customer.orderStatus = 'Pending';
        customer.statusUpdatedAt = now;
      }
      customer.updatedAt = now;
    }

    this.data.totalInquirySubmissions =
      (this.data.totalInquirySubmissions ?? this.data.inquiries.length) + 1;

    const existingIdx = this.data.inquiries.findIndex((i) =>
      sameCustomerIdentity(
        {
          name: i.customerNameSnapshot,
          email: i.customerEmail,
          contact: i.customerContactSnapshot,
        },
        incomingIdentity,
      ),
    );

    if (existingIdx >= 0) {
      const existingInq = this.data.inquiries[existingIdx]!;
      const mergedItems = mergeServiceItems(
        existingInq.orderItem || resolveServiceDisplayName(existingInq.serviceId),
        pricing.orderItem,
      );
      const appendedMsg: InquiryResponseRecord = {
        id: crypto.randomUUID(),
        inquiryId: existingInq.id,
        adminId: customer.id,
        adminDisplayName: input.customerName.trim(),
        senderRole: 'customer',
        responseText: input.message.trim(),
        respondedAt: now,
        ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
      };
      const updatedInq: InquiryRecord = {
        ...existingInq,
        customerId: customer.id,
        customerNameSnapshot: input.customerName.trim() || existingInq.customerNameSnapshot,
        customerContactSnapshot: contactSnapshot || existingInq.customerContactSnapshot,
        customerEmail: emailNorm || existingInq.customerEmail,
        customerAvatarUrl: this.resolveLocalAvatar(
          input.customerName,
          contactSnapshot,
          input.avatarUrl || existingInq.customerAvatarUrl,
          emailNorm,
        ),
        serviceId: input.serviceId,
        orderItem: mergedItems,
        quantity: (existingInq.quantity ?? 0) + pricing.quantity,
        totalPrice: (existingInq.totalPrice ?? 0) + pricing.totalPrice,
        reservationFee:
          pricing.reservationFee !== null ? pricing.reservationFee : existingInq.reservationFee,
        archivedToHistory: false,
        status: 'Pending',
        updatedAt: now,
        responses: [...existingInq.responses, appendedMsg],
      };
      this.data.inquiries[existingIdx] = updatedInq;
      this.persist();
      return updatedInq;
    }

    const ref =
      input.referenceCode && !this.data.inquiries.some((i) => i.referenceCode === input.referenceCode)
        ? input.referenceCode
        : makeRefCode(this.data.inquiries);

    const inquiryId = crypto.randomUUID();
    const initialResponses: InquiryResponseRecord[] = input.imageDataUrl
      ? [
          {
            id: crypto.randomUUID(),
            inquiryId,
            adminId: customer.id,
            adminDisplayName: input.customerName.trim(),
            senderRole: 'customer',
            responseText: '',
            imageDataUrl: input.imageDataUrl,
            respondedAt: now,
          },
        ]
      : [];

    const inquiry: InquiryRecord = {
      id: inquiryId,
      referenceCode: ref,
      customerId: customer.id,
      customerNameSnapshot: input.customerName.trim(),
      customerContactSnapshot: contactSnapshot,
      customerEmail: emailNorm || undefined,
      customerAvatarUrl: this.resolveLocalAvatar(
        input.customerName,
        contactSnapshot,
        input.avatarUrl,
        emailNorm,
      ),
      isCustomerArchived: false,
      serviceId: input.serviceId,
      orderItem: pricing.orderItem,
      message: input.message.trim(),
      quantity: pricing.quantity,
      totalPrice: pricing.totalPrice,
      reservationFee: pricing.reservationFee,
      adminSeenAt: null,
      acceptedAt: null,
      archivedToHistory: false,
      status: 'Pending',
      submittedAt: now,
      updatedAt: now,
      responses: initialResponses,
    };
    this.data.inquiries.unshift(inquiry);
    this.persist();
    return inquiry;
  }

  async listInquiries(filters?: { search?: string; status?: 'All' | InquiryStatus }): Promise<InquiryRecord[]> {
    const q = filters?.search?.trim().toLowerCase() ?? '';
    const status = filters?.status ?? 'All';
    return this.data.inquiries
      .filter((i) => {
        if (status !== 'All' && i.status !== status) return false;
        if (!q) return true;
        return (
          i.customerNameSnapshot.toLowerCase().includes(q) ||
          i.referenceCode.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          i.serviceId.toLowerCase().includes(q)
        );
      })
      .map((i) => ({
        ...i,
        customerAvatarUrl: this.resolveLocalAvatar(
          i.customerNameSnapshot,
          i.customerContactSnapshot,
          i.customerAvatarUrl,
          i.customerEmail,
        ),
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getInquiryById(id: string): Promise<InquiryRecord | null> {
    const found = this.data.inquiries.find((i) => i.id === id);
    if (!found) return null;
    return {
      ...found,
      customerAvatarUrl: this.resolveLocalAvatar(
        found.customerNameSnapshot,
        found.customerContactSnapshot,
        found.customerAvatarUrl,
        found.customerEmail,
      ),
    };
  }

  async getInquiryByRef(ref: string): Promise<InquiryRecord | null> {
    return this.data.inquiries.find((i) => i.referenceCode === ref) ?? null;
  }

  async findCustomerInquiry(input: { email?: string; name?: string; contact?: string }): Promise<InquiryRecord | null> {
    const found = this.data.inquiries.find((i) =>
      sameCustomerIdentity(
        {
          name: i.customerNameSnapshot,
          email: i.customerEmail,
          contact: i.customerContactSnapshot,
        },
        input,
      ),
    );
    if (!found) return null;
    return {
      ...found,
      customerAvatarUrl: this.resolveLocalAvatar(
        found.customerNameSnapshot,
        found.customerContactSnapshot,
        found.customerAvatarUrl,
        found.customerEmail,
      ),
    };
  }

  async getTotalInquirySubmissions(): Promise<number> {
    return this.data.totalInquirySubmissions ?? this.data.inquiries.length;
  }

  async updateInquiryStatus(id: string, status: InquiryStatus): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      status,
      adminSeenAt: prev.adminSeenAt ?? now,
      updatedAt: now,
    };
    this.data.inquiries[idx] = next;
    this.persist();
    return next;
  }

  async markInquirySeen(id: string): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      adminSeenAt: now,
    };
    this.data.inquiries[idx] = next;
    this.persist();
    return next;
  }

  async acceptInquiry(
    id: string,
  ): Promise<{ inquiry: InquiryRecord; client: CustomerRecord | null } | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const pricing = computeInquiryPricing({
      serviceId: prev.serviceId,
      message: prev.message,
      quantity: prev.quantity,
      totalPrice: prev.totalPrice,
      reservationFee: prev.reservationFee,
    });
    const combinedItem = prev.orderItem || pricing.orderItem;
    const nextInq: InquiryRecord = {
      ...prev,
      status: prev.status === 'Pending' ? 'Answered' : prev.status,
      orderItem: combinedItem,
      quantity: pricing.quantity,
      totalPrice: pricing.totalPrice,
      reservationFee: pricing.reservationFee,
      adminSeenAt: prev.adminSeenAt ?? now,
      acceptedAt: prev.acceptedAt ?? now,
      archivedToHistory: false,
      updatedAt: now,
    };
    this.data.inquiries[idx] = nextInq;

    let linkedClient = prev.customerId
      ? (this.data.customers.find((c) => c.id === prev.customerId) ?? null)
      : (this.data.customers.find((c) =>
          sameCustomerIdentity(
            { name: c.fullName, contact: c.contactInfo },
            {
              name: prev.customerNameSnapshot,
              email: prev.customerEmail,
              contact: prev.customerContactSnapshot,
            },
          ),
        ) ?? null);
    if (!linkedClient) {
      linkedClient = {
        id: crypto.randomUUID(),
        fullName: prev.customerNameSnapshot,
        contactInfo: prev.customerContactSnapshot,
        notes: '',
        orderItem: combinedItem,
        quantity: pricing.quantity,
        totalPrice: pricing.totalPrice,
        reservationFee: pricing.reservationFee,
        orderDate: prev.submittedAt.slice(0, 10),
        orderStatus: 'Pending',
        statusUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.data.customers.unshift(linkedClient);
      nextInq.customerId = linkedClient.id;
    } else {
      nextInq.customerId = linkedClient.id;
      this.syncCustomerFromInquiry(linkedClient, nextInq, now);
    }

    this.persist();
    return { inquiry: nextInq, client: linkedClient };
  }

  async archiveInquiryToHistory(id: string): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      adminSeenAt: prev.adminSeenAt ?? now,
      archivedToHistory: true,
      updatedAt: now,
    };
    this.data.inquiries[idx] = next;
    this.persist();
    return next;
  }

  async setInquiryArchive(id: string, archived: boolean): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      adminSeenAt: prev.adminSeenAt ?? now,
      isArchived: archived,
      archivedToHistory: archived ? prev.archivedToHistory : false,
      updatedAt: now,
    };
    this.data.inquiries[idx] = next;
    this.persist();
    return next;
  }

  async setInquiryBlock(id: string, blocked: boolean): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      adminSeenAt: prev.adminSeenAt ?? now,
      isBlocked: blocked,
      updatedAt: now,
    };
    this.data.inquiries[idx] = next;
    this.persist();
    return next;
  }

  async deleteInquiry(id: string): Promise<boolean> {
    const exists = this.data.inquiries.some((i) => i.id === id);
    if (!exists) return false;
    this.data.inquiries = this.data.inquiries.filter((i) => i.id !== id);
    this.persist();
    return true;
  }

  async isCustomerBlocked(input: { email?: string; name?: string; contact?: string }): Promise<boolean> {
    return this.data.inquiries.some(
      (i) =>
        Boolean(i.isBlocked) &&
        sameCustomerIdentity(
          {
            name: i.customerNameSnapshot,
            email: i.customerEmail,
            contact: i.customerContactSnapshot,
          },
          input,
        ),
    );
  }

  async setInquiryReservation(id: string, reservationFee: number | null): Promise<InquiryRecord | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const prev = this.data.inquiries[idx]!;
    const now = new Date().toISOString();
    const next: InquiryRecord = {
      ...prev,
      reservationFee,
      updatedAt: now,
    };
    this.data.inquiries[idx] = next;
    if (prev.customerId) {
      const client = this.data.customers.find((c) => c.id === prev.customerId);
      if (client) {
        client.reservationFee = reservationFee;
        client.updatedAt = now;
      }
    }
    this.persist();
    return next;
  }

  async addInquiryResponse(input: {
    inquiryId: string;
    adminId: string | null;
    adminDisplayName: string;
    senderRole: 'admin' | 'customer';
    responseText: string;
    imageDataUrl?: string;
    nextStatus?: InquiryStatus;
    serviceId?: string;
    serviceNames?: string[];
    quantity?: number;
  }): Promise<{ inquiry: InquiryRecord; response: InquiryResponseRecord } | null> {
    const idx = this.data.inquiries.findIndex((i) => i.id === input.inquiryId);
    if (idx < 0) return null;
    const now = new Date().toISOString();
    const current = this.data.inquiries[idx]!;
    const response: InquiryResponseRecord = {
      id: crypto.randomUUID(),
      inquiryId: current.id,
      adminId: input.adminId,
      adminDisplayName: input.adminDisplayName,
      senderRole: input.senderRole,
      responseText: input.responseText.trim(),
      respondedAt: now,
      ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
    };
    const nextStatus: InquiryStatus =
      input.nextStatus ??
      (input.senderRole === 'customer'
        ? current.status === 'Completed'
          ? 'Pending'
          : current.status
        : current.status === 'Pending'
          ? 'Answered'
          : current.status);

    let nextOrderItem = current.orderItem || resolveServiceDisplayName(current.serviceId);
    let nextQuantity = current.quantity ?? 1;
    let nextTotalPrice = current.totalPrice ?? 0;
    let nextContactSnapshot = current.customerContactSnapshot;

    if (input.senderRole === 'customer') {
      nextContactSnapshot = mergePhoneIntoContact(nextContactSnapshot, input.responseText);
      const explicitNames: string[] = [];
      if (input.serviceNames && input.serviceNames.length > 0) {
        explicitNames.push(...input.serviceNames);
      }
      if (input.serviceId) {
        explicitNames.push(resolveServiceDisplayName(input.serviceId));
      }
      if (
        explicitNames.length > 0 ||
        /^(Adding another item:|Favorites Inquiry|3D Customizer Draft)/i.test(input.responseText.trim())
      ) {
        explicitNames.push(...extractServiceNamesFromText(input.responseText));
      }

      if (explicitNames.length > 0) {
        nextOrderItem = mergeServiceItems(nextOrderItem, explicitNames);
        const addQty =
          typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 1
            ? Math.round(input.quantity)
            : extractQtyFromMessage(input.responseText);
        const targetMeta =
          (input.serviceId ? SERVICE_META[input.serviceId] : undefined) ??
          Object.values(SERVICE_META).find(
            (m) => m.name.toLowerCase() === explicitNames[0]?.trim().toLowerCase(),
          );
        nextQuantity += addQty;
        nextTotalPrice += targetMeta ? targetMeta.unit * addQty : 0;
      }
    }

    const updated: InquiryRecord = {
      ...current,
      customerContactSnapshot: nextContactSnapshot,
      status: nextStatus,
      orderItem: nextOrderItem,
      quantity: nextQuantity,
      totalPrice: nextTotalPrice,
      adminSeenAt: input.senderRole === 'admin' ? now : current.adminSeenAt,
      acceptedAt: input.senderRole === 'admin' ? (current.acceptedAt ?? now) : current.acceptedAt,
      archivedToHistory: input.senderRole === 'customer' ? false : current.archivedToHistory,
      isArchived: input.senderRole === 'customer' ? false : current.isArchived,
      updatedAt: now,
      responses: [...current.responses, response],
    };
    this.data.inquiries[idx] = updated;

    const targetClient = updated.customerId
      ? this.data.customers.find((c) => c.id === updated.customerId)
      : this.data.customers.find((c) =>
          sameCustomerIdentity(
            { name: c.fullName, contact: c.contactInfo },
            {
              name: updated.customerNameSnapshot,
              email: updated.customerEmail,
              contact: updated.customerContactSnapshot,
            },
          ),
        );
    if (targetClient) {
      if (nextContactSnapshot !== targetClient.contactInfo && extractPhoneDigits(nextContactSnapshot)) {
        targetClient.contactInfo = mergePhoneIntoContact(targetClient.contactInfo, nextContactSnapshot);
        targetClient.updatedAt = now;
      }
      if (input.senderRole === 'admin') {
        this.syncCustomerFromInquiry(targetClient, updated, now);
      } else if (nextOrderItem !== (current.orderItem || resolveServiceDisplayName(current.serviceId))) {
        updated.customerId = targetClient.id;
        targetClient.orderItem = mergeServiceItems(
          targetClient.orderStatus === 'Pending' ? targetClient.orderItem : undefined,
          nextOrderItem,
        );
        targetClient.quantity = nextQuantity;
        targetClient.totalPrice = nextTotalPrice;
        targetClient.orderDate = now.slice(0, 10);
        if (targetClient.orderStatus !== 'Pending') {
          targetClient.orderStatus = 'Pending';
          targetClient.statusUpdatedAt = now;
        }
        targetClient.updatedAt = now;
      }
    }

    this.persist();
    return { inquiry: updated, response };
  }

  async listClients(search = ''): Promise<CustomerRecord[]> {
    const q = search.trim().toLowerCase();
    return this.data.customers
      .filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.contactInfo.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getClientById(id: string): Promise<CustomerRecord | null> {
    return this.data.customers.find((c) => c.id === id) ?? null;
  }

  async getClientInquiries(clientId: string): Promise<InquiryRecord[]> {
    return this.data.inquiries
      .filter((i) => i.customerId === clientId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  async createClient(input: {
    fullName: string;
    contactInfo: string;
    notes: string;
    orderItem?: string;
    quantity?: number;
    totalPrice?: number;
    reservationFee?: number | null;
    orderDate?: string;
    orderStatus?: ClientOrderStatus;
  }): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const record: CustomerRecord = {
      id: crypto.randomUUID(),
      fullName: input.fullName.trim(),
      contactInfo: input.contactInfo.trim(),
      notes: input.notes.trim(),
      orderItem: input.orderItem?.trim() ?? '',
      quantity: input.quantity ?? 1,
      totalPrice: input.totalPrice ?? 0,
      reservationFee: input.reservationFee ?? null,
      orderDate: input.orderDate?.trim() || now.slice(0, 10),
      orderStatus: input.orderStatus ?? 'Pending',
      statusUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.data.customers.unshift(record);
    this.persist();
    return record;
  }

  async updateClient(
    id: string,
    input: {
      fullName: string;
      contactInfo: string;
      notes: string;
      orderItem?: string;
      quantity?: number;
      totalPrice?: number;
      reservationFee?: number | null;
      orderDate?: string;
      orderStatus?: ClientOrderStatus;
    },
  ): Promise<CustomerRecord | null> {
    const idx = this.data.customers.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const prev = this.data.customers[idx]!;
    const now = new Date().toISOString();
    const nextStatus = input.orderStatus ?? prev.orderStatus;
    const statusChanged = nextStatus !== prev.orderStatus;
    const next: CustomerRecord = {
      ...prev,
      fullName: input.fullName.trim(),
      contactInfo: input.contactInfo.trim(),
      notes: input.notes.trim(),
      orderItem: input.orderItem !== undefined ? input.orderItem.trim() : prev.orderItem,
      quantity: input.quantity !== undefined ? input.quantity : prev.quantity,
      totalPrice: input.totalPrice !== undefined ? input.totalPrice : prev.totalPrice,
      reservationFee:
        input.reservationFee !== undefined ? input.reservationFee : prev.reservationFee,
      orderDate: input.orderDate !== undefined ? input.orderDate.trim() : prev.orderDate,
      orderStatus: nextStatus,
      statusUpdatedAt: statusChanged ? now : (prev.statusUpdatedAt ?? prev.updatedAt),
      updatedAt: now,
    };
    this.data.customers[idx] = next;
    if (nextStatus === 'Done') {
      for (const inq of this.data.inquiries) {
        if (inq.customerId === id && inq.status !== 'Completed') {
          inq.status = 'Completed';
          inq.updatedAt = now;
        }
      }
    }
    this.persist();
    return next;
  }

  async deleteClient(id: string): Promise<{ deletedClientId: string; archivedInquiryCount: number } | null> {
    const exists = this.data.customers.some((c) => c.id === id);
    if (!exists) return null;
    this.data.customers = this.data.customers.filter((c) => c.id !== id);
    let archivedInquiryCount = 0;
    // Preserve messages and customer identity in Message Management when deleting from Client Records
    this.data.inquiries = this.data.inquiries.map((inq) => {
      if (inq.customerId === id) {
        archivedInquiryCount += 1;
        return {
          ...inq,
          customerId: null,
          status: inq.status === 'Completed' ? 'Answered' : inq.status,
        };
      }
      return inq;
    });
    this.persist();
    return { deletedClientId: id, archivedInquiryCount };
  }

  async deleteAllLogClients(): Promise<{ deletedCount: number; archivedInquiryCount: number }> {
    const logIds = new Set(
      this.data.customers
        .filter((c) => c.orderStatus === 'Done' || c.orderStatus === 'Cancelled')
        .map((c) => c.id),
    );
    if (logIds.size === 0) return { deletedCount: 0, archivedInquiryCount: 0 };

    this.data.customers = this.data.customers.filter((c) => !logIds.has(c.id));
    let archivedInquiryCount = 0;
    // Keep messages & customer names intact in Message Management
    this.data.inquiries = this.data.inquiries.map((inq) => {
      if (inq.customerId && logIds.has(inq.customerId)) {
        archivedInquiryCount += 1;
        return {
          ...inq,
          customerId: null,
          status: inq.status === 'Completed' ? 'Answered' : inq.status,
        };
      }
      return inq;
    });
    this.persist();
    return { deletedCount: logIds.size, archivedInquiryCount };
  }

  async deleteAllMessageHistory(): Promise<{ deletedCount: number }> {
    const historyIds = new Set(
      this.data.inquiries
        .filter(
          (i) =>
            Boolean(i.archivedToHistory) ||
            Boolean(i.acceptedAt) ||
            i.responses.some((r) => r.senderRole === 'admin'),
        )
        .map((i) => i.id),
    );
    if (historyIds.size === 0) return { deletedCount: 0 };
    this.data.inquiries = this.data.inquiries.filter((i) => !historyIds.has(i.id));
    if (this.data.inquiries.length === 0) {
      this.data.totalInquirySubmissions = 0;
    }
    this.persist();
    return { deletedCount: historyIds.size };
  }

  async appendActivityLog(log: Omit<ActivityLogRecord, 'id' | 'createdAt'>): Promise<ActivityLogRecord> {
    const record: ActivityLogRecord = {
      ...log,
      metadata: redactSecrets(log.metadata),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.data.activityLogs.unshift(record);
    this.persist();
    return record;
  }

  async listActivityLogs(filters?: {
    search?: string;
    category?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ActivityLogRecord[]; total: number }> {
    const q = filters?.search?.trim().toLowerCase() ?? '';
    const cat = filters?.category?.trim() ?? '';
    const fromMs = filters?.from ? new Date(filters.from).getTime() : 0;
    const toMs = filters?.to ? new Date(filters.to).getTime() + 86400_000 : Infinity;

    const filtered = this.data.activityLogs.filter((l) => {
      if (cat && cat !== 'all' && l.category !== cat) return false;
      const t = new Date(l.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return (
        l.description.toLowerCase().includes(q) ||
        l.actorIdentity.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    });
    return paginate(filtered, filters?.page, filters?.pageSize);
  }

  async appendSecurityLog(log: Omit<SecurityLogRecord, 'id' | 'createdAt'>): Promise<SecurityLogRecord> {
    const record: SecurityLogRecord = {
      ...log,
      details: redactSecrets(log.details),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.data.securityLogs.unshift(record);
    this.persist();
    return record;
  }

  async listSecurityLogs(filters?: {
    search?: string;
    severity?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SecurityLogRecord[]; total: number }> {
    const q = filters?.search?.trim().toLowerCase() ?? '';
    const sev = filters?.severity?.trim() ?? '';
    const fromMs = filters?.from ? new Date(filters.from).getTime() : 0;
    const toMs = filters?.to ? new Date(filters.to).getTime() + 86400_000 : Infinity;

    const filtered = this.data.securityLogs.filter((l) => {
      if (sev && sev !== 'all' && l.severity !== sev) return false;
      const t = new Date(l.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return (
        l.description.toLowerCase().includes(q) ||
        l.eventType.toLowerCase().includes(q) ||
        l.actorIdentity.toLowerCase().includes(q) ||
        l.ipAddress.toLowerCase().includes(q)
      );
    });
    return paginate(filtered, filters?.page, filters?.pageSize);
  }

  async incrementRateLimit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: string }> {
    const nowMs = Date.now();
    const cur = this.data.rateLimits[key];
    if (!cur || new Date(cur.resetAt).getTime() <= nowMs) {
      const next = { count: 1, resetAt: new Date(nowMs + windowSeconds * 1000).toISOString() };
      this.data.rateLimits[key] = next;
      this.persist();
      return next;
    }
    const next = { count: cur.count + 1, resetAt: cur.resetAt };
    this.data.rateLimits[key] = next;
    this.persist();
    return next;
  }

  async listReviews(): Promise<ReviewRecord[]> {
    const accountsByName = new Map<string, string>();
    for (const acc of this.data.customerAccounts ?? []) {
      if (acc.avatarUrl && acc.fullName) {
        accountsByName.set(acc.fullName.trim().toLowerCase(), acc.avatarUrl);
      }
    }
    return [...(this.data.reviews ?? [])].map((r) => ({
      ...r,
      role: r.role === 'Google Signed-In Client' ? 'Verified Customer' : r.role,
      avatarUrl: r.avatarUrl || accountsByName.get(r.author.trim().toLowerCase()),
    }));
  }

  async createReview(input: {
    author: string;
    initials: string;
    role: string;
    quote: string;
    rating: number;
    avatarUrl?: string;
  }): Promise<ReviewRecord> {
    const matchedAvatar =
      input.avatarUrl ||
      this.data.customerAccounts?.find(
        (a) => a.fullName.trim().toLowerCase() === input.author.trim().toLowerCase(),
      )?.avatarUrl;
    const record: ReviewRecord = {
      id: crypto.randomUUID(),
      author: input.author,
      initials: input.initials,
      role: input.role === 'Google Signed-In Client' ? 'Verified Customer' : input.role,
      quote: input.quote,
      rating: input.rating,
      avatarUrl: matchedAvatar,
      createdAt: new Date().toISOString(),
    };
    this.data.reviews = [record, ...(this.data.reviews ?? [])];
    this.persist();
    return record;
  }
}

function mapAdminRow(row: Record<string, unknown>): AdminRecord {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    displayName: String(row.display_name ?? ''),
    role: (row.role as AdminRecord['role']) ?? 'admin',
    passwordHash: String(row.password_hash ?? ''),
    pinHash: String(row.pin_hash ?? ''),
    totpSecretEncrypted: (row.totp_secret_encrypted as string | null) ?? null,
    mfaEnabled: Boolean(row.mfa_enabled),
    recoveryCodeHashes: Array.isArray(row.recovery_code_hashes)
      ? (row.recovery_code_hashes as string[])
      : [],
    lastTotpStep: typeof row.last_totp_step === 'number' ? row.last_totp_step : null,
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedUntil: (row.locked_until as string | null) ?? null,
    pinFailedAttempts: Number(row.pin_failed_attempts ?? 0),
    pinLockedUntil: (row.pin_locked_until as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapSessionRow(row: Record<string, unknown>): AdminSessionRecord {
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    tokenHash: String(row.token_hash),
    csrfTokenHash: String(row.csrf_token_hash),
    authStage: row.auth_stage as AdminSessionRecord['authStage'],
    ipAddress: String(row.ip_address ?? 'unknown'),
    userAgent: String(row.user_agent ?? ''),
    lastActiveAt: String(row.last_active_at),
    expiresAt: String(row.expires_at),
    reauthVerifiedAt: (row.reauth_verified_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapInquiryRow(row: Record<string, unknown>, responses: InquiryResponseRecord[]): InquiryRecord {
  return {
    id: String(row.id),
    referenceCode: String(row.reference_code),
    customerId: (row.customer_id as string | null) ?? null,
    customerNameSnapshot: String(row.customer_name_snapshot),
    customerContactSnapshot: String(row.customer_contact_snapshot),
    customerEmail: extractEmailFromText(String(row.customer_contact_snapshot)) || undefined,
    isCustomerArchived: Boolean(row.is_customer_archived),
    serviceId: String(row.service_id),
    orderItem: row.order_item ? String(row.order_item) : resolveServiceDisplayName(String(row.service_id)),
    message: String(row.message),
    quantity: typeof row.quantity === 'number' ? row.quantity : Number(row.quantity ?? 1),
    totalPrice: typeof row.total_price === 'number' ? row.total_price : Number(row.total_price ?? 0),
    reservationFee:
      row.reservation_fee !== null && row.reservation_fee !== undefined
        ? Number(row.reservation_fee)
        : null,
    adminSeenAt: (row.admin_seen_at as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    archivedToHistory: Boolean(row.archived_to_history),
    isArchived: Boolean(row.is_archived),
    isBlocked: Boolean(row.is_blocked),
    status: row.status as InquiryStatus,
    submittedAt: String(row.submitted_at),
    updatedAt: String(row.updated_at),
    responses,
  };
}

export class SupabaseStore implements BackendStore {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getServices(): Promise<ServiceRecord[]> {
    const { data, error } = await this.db
      .from('services')
      .select('id, service_name, description, is_active')
      .eq('is_active', true);
    if (error || !data || data.length === 0) return ACTIVE_SERVICES;
    return data.map((r) => ({
      id: String(r.id),
      serviceName: String(r.service_name),
      description: String(r.description),
      isActive: Boolean(r.is_active),
    }));
  }

  async listAdmins(): Promise<AdminRecord[]> {
    const { data, error } = await this.db.from('admin_profiles').select('*');
    if (error || !data) return [];
    return data.map(mapAdminRow);
  }

  async findAdminByEmail(email: string): Promise<AdminRecord | null> {
    const { data, error } = await this.db
      .from('admin_profiles')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (error || !data) return null;
    return mapAdminRow(data);
  }

  async findAdminById(id: string): Promise<AdminRecord | null> {
    const { data, error } = await this.db
      .from('admin_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapAdminRow(data);
  }

  async upsertProvisionedAdmin(
    admin: Omit<AdminRecord, 'id' | 'createdAt'> & { id?: string },
  ): Promise<AdminRecord> {
    const payload = {
      email: admin.email.trim().toLowerCase(),
      display_name: admin.displayName.trim(),
      role: admin.role,
      password_hash: admin.passwordHash,
      pin_hash: admin.pinHash,
      totp_secret_encrypted: admin.totpSecretEncrypted,
      mfa_enabled: admin.mfaEnabled,
      recovery_code_hashes: admin.recoveryCodeHashes,
    };
    const { data, error } = await this.db
      .from('admin_profiles')
      .upsert(payload, { onConflict: 'email' })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to provision admin.');
    return mapAdminRow(data);
  }

  async updateAdminSecurity(id: string, patch: Partial<AdminRecord>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.passwordHash !== undefined) dbPatch.password_hash = patch.passwordHash;
    if (patch.pinHash !== undefined) dbPatch.pin_hash = patch.pinHash;
    if (patch.totpSecretEncrypted !== undefined) dbPatch.totp_secret_encrypted = patch.totpSecretEncrypted;
    if (patch.mfaEnabled !== undefined) dbPatch.mfa_enabled = patch.mfaEnabled;
    if (patch.recoveryCodeHashes !== undefined) dbPatch.recovery_code_hashes = patch.recoveryCodeHashes;
    if (patch.lastTotpStep !== undefined) dbPatch.last_totp_step = patch.lastTotpStep;
    if (patch.failedLoginAttempts !== undefined) dbPatch.failed_login_attempts = patch.failedLoginAttempts;
    if (patch.lockedUntil !== undefined) dbPatch.locked_until = patch.lockedUntil;
    if (patch.pinFailedAttempts !== undefined) dbPatch.pin_failed_attempts = patch.pinFailedAttempts;
    if (patch.pinLockedUntil !== undefined) dbPatch.pin_locked_until = patch.pinLockedUntil;
    if (patch.lastLoginAt !== undefined) dbPatch.last_login_at = patch.lastLoginAt;
    await this.db.from('admin_profiles').update(dbPatch).eq('id', id);
  }

  async createSession(session: Omit<AdminSessionRecord, 'id' | 'createdAt'>): Promise<AdminSessionRecord> {
    const { data, error } = await this.db
      .from('admin_sessions')
      .insert({
        admin_id: session.adminId,
        token_hash: session.tokenHash,
        csrf_token_hash: session.csrfTokenHash,
        auth_stage: session.authStage,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
        last_active_at: session.lastActiveAt,
        expires_at: session.expiresAt,
        reauth_verified_at: session.reauthVerifiedAt,
        revoked_at: session.revokedAt,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to create session.');
    return mapSessionRow(data);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | null> {
    const { data, error } = await this.db
      .from('admin_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error || !data) return null;
    return mapSessionRow(data);
  }

  async updateSession(id: string, patch: Partial<AdminSessionRecord>): Promise<AdminSessionRecord | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.tokenHash !== undefined) dbPatch.token_hash = patch.tokenHash;
    if (patch.csrfTokenHash !== undefined) dbPatch.csrf_token_hash = patch.csrfTokenHash;
    if (patch.authStage !== undefined) dbPatch.auth_stage = patch.authStage;
    if (patch.lastActiveAt !== undefined) dbPatch.last_active_at = patch.lastActiveAt;
    if (patch.reauthVerifiedAt !== undefined) dbPatch.reauth_verified_at = patch.reauthVerifiedAt;
    if (patch.revokedAt !== undefined) dbPatch.revoked_at = patch.revokedAt;
    const { data, error } = await this.db
      .from('admin_sessions')
      .update(dbPatch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return mapSessionRow(data);
  }

  async listAdminSessions(adminId?: string): Promise<AdminSessionRecord[]> {
    let q = this.db.from('admin_sessions').select('*').order('created_at', { ascending: false }).limit(100);
    if (adminId) q = q.eq('admin_id', adminId);
    const { data } = await q;
    return (data ?? []).map(mapSessionRow);
  }

  async revokeSession(id: string): Promise<void> {
    await this.db.from('admin_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  }

  async revokeAllOtherSessions(adminId: string, exceptSessionId: string): Promise<number> {
    const { data } = await this.db
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('admin_id', adminId)
      .neq('id', exceptSessionId)
      .is('revoked_at', null)
      .select('id');
    return data?.length ?? 0;
  }

  async upsertGoogleCustomer(input: {
    googleSub: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  }): Promise<CustomerAccountRecord> {
    const emailNorm = input.email.trim().toLowerCase();
    const { data: existingCust } = await this.db
      .from('customers')
      .select('id')
      .eq('contact_info', emailNorm)
      .maybeSingle();
    const customerId = existingCust?.id ? String(existingCust.id) : null;

    const { data, error } = await this.db
      .from('customer_accounts')
      .upsert(
        {
          google_sub: input.googleSub,
          email: emailNorm,
          full_name: input.fullName.trim(),
          avatar_url: input.avatarUrl ?? null,
          customer_id: customerId,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: 'google_sub' },
      )
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to upsert Google customer.');
    return {
      id: String(data.id),
      customerId: (data.customer_id as string | null) ?? null,
      googleSub: String(data.google_sub),
      email: String(data.email),
      fullName: String(data.full_name),
      avatarUrl: (data.avatar_url as string | undefined) ?? undefined,
      lastLoginAt: String(data.last_login_at),
      createdAt: String(data.created_at),
    };
  }

  async updateCustomerAvatar(input: {
    email?: string;
    fullName?: string;
    avatarUrl: string | null;
  }): Promise<void> {
    const emailNorm = input.email?.trim().toLowerCase();
    const nameNorm = input.fullName?.trim();
    if (emailNorm) {
      await this.db
        .from('customer_accounts')
        .update({ avatar_url: input.avatarUrl })
        .eq('email', emailNorm);
    } else if (nameNorm) {
      await this.db
        .from('customer_accounts')
        .update({ avatar_url: input.avatarUrl })
        .eq('full_name', nameNorm);
    }
  }

  async createInquiry(input: {
    customerName: string;
    contactInfo: string;
    email?: string;
    serviceId: string;
    message: string;
    referenceCode?: string;
    avatarUrl?: string;
    quantity?: number;
    totalPrice?: number;
    reservationFee?: number | null;
    wantsReservation?: boolean;
    imageDataUrl?: string;
  }): Promise<InquiryRecord> {
    const emailNorm = input.email ? stripLegacyDotEmail(input.email.trim().toLowerCase()) : '';
    const rawContactTrimmed = input.contactInfo.trim();
    const contactSnapshot = mergePhoneIntoContact(
      emailNorm && !rawContactTrimmed.toLowerCase().includes(emailNorm)
        ? `${rawContactTrimmed} · ${emailNorm}`
        : rawContactTrimmed || emailNorm,
      input.message,
    );
    const pricing = computeInquiryPricing(input);
    const now = new Date().toISOString();

    const { data: allClients } = await this.db
      .from('customers')
      .select('id, full_name, contact_info, order_item, quantity, total_price, order_status');
    const incomingIdentity = { name: input.customerName.trim(), email: emailNorm, contact: contactSnapshot };
    const matchedClient = (allClients ?? []).find((c) =>
      sameCustomerIdentity(
        { name: String(c.full_name ?? ''), contact: String(c.contact_info ?? '') },
        incomingIdentity,
      ),
    );

    let customerId = matchedClient?.id ? String(matchedClient.id) : null;
    if (!customerId) {
      const { data: createdCust } = await this.db
        .from('customers')
        .insert({
          full_name: input.customerName.trim(),
          contact_info: contactSnapshot,
          notes: '',
          order_item: pricing.orderItem,
          quantity: pricing.quantity,
          total_price: pricing.totalPrice,
          reservation_fee: pricing.reservationFee,
          order_date: now.slice(0, 10),
          order_status: 'Pending',
          status_updated_at: now,
        })
        .select('id')
        .single();
      customerId = createdCust?.id ? String(createdCust.id) : null;
    } else {
      const wasPending = !matchedClient?.order_status || String(matchedClient.order_status) === 'Pending';
      const nextItem = wasPending
        ? mergeServiceItems(String(matchedClient?.order_item ?? ''), pricing.orderItem)
        : pricing.orderItem;
      const nextQty = wasPending
        ? Number(matchedClient?.quantity ?? 0) + pricing.quantity
        : pricing.quantity;
      const nextPrice = wasPending
        ? Number(matchedClient?.total_price ?? 0) + pricing.totalPrice
        : pricing.totalPrice;
      await this.db
        .from('customers')
        .update({
          order_item: nextItem,
          quantity: nextQty,
          total_price: nextPrice,
          ...(pricing.reservationFee !== null ? { reservation_fee: pricing.reservationFee } : {}),
          order_date: now.slice(0, 10),
          order_status: 'Pending',
          status_updated_at: now,
          updated_at: now,
        })
        .eq('id', customerId);
    }

    const existingInq = await this.findCustomerInquiry(incomingIdentity);
    if (existingInq) {
      await this.db.from('responses').insert({
        inquiry_id: existingInq.id,
        admin_id: customerId,
        sender_role: 'customer',
        response_text: input.message.trim(),
        image_data_url: input.imageDataUrl ?? null,
      });
      const mergedItem = mergeServiceItems(
        existingInq.orderItem || resolveServiceDisplayName(existingInq.serviceId),
        pricing.orderItem,
      );
      await this.db
        .from('inquiries')
        .update({
          customer_id: customerId,
          service_id: input.serviceId,
          order_item: mergedItem,
          quantity: (existingInq.quantity ?? 0) + pricing.quantity,
          total_price: (existingInq.totalPrice ?? 0) + pricing.totalPrice,
          ...(pricing.reservationFee !== null ? { reservation_fee: pricing.reservationFee } : {}),
          archived_to_history: false,
          status: 'Pending',
          updated_at: now,
        })
        .eq('id', existingInq.id);
      const updated = (await this.getInquiryById(existingInq.id)) ?? existingInq;
      if (input.avatarUrl) updated.customerAvatarUrl = input.avatarUrl;
      return updated;
    }

    const { count } = await this.db.from('inquiries').select('id', { count: 'exact', head: true });
    const ref =
      input.referenceCode ??
      `RJH-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await this.db
      .from('inquiries')
      .insert({
        reference_code: ref,
        customer_id: customerId,
        customer_name_snapshot: input.customerName.trim(),
        customer_contact_snapshot: contactSnapshot,
        service_id: input.serviceId,
        message: input.message.trim(),
        quantity: pricing.quantity,
        total_price: pricing.totalPrice,
        reservation_fee: pricing.reservationFee,
        status: 'Pending',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to create inquiry.');

    if (input.imageDataUrl) {
      await this.db.from('responses').insert({
        inquiry_id: data.id,
        admin_id: null,
        sender_role: 'customer',
        response_text: '',
        image_data_url: input.imageDataUrl,
      });
    }

    const record = (await this.getInquiryById(String(data.id))) ?? mapInquiryRow(data, []);
    if (input.avatarUrl) record.customerAvatarUrl = input.avatarUrl;
    return record;
  }

  async listInquiries(filters?: { search?: string; status?: 'All' | InquiryStatus }): Promise<InquiryRecord[]> {
    let q = this.db.from('inquiries').select('*').order('updated_at', { ascending: false });
    if (filters?.status && filters.status !== 'All') {
      q = q.eq('status', filters.status);
    }
    const { data: inqs } = await q;
    if (!inqs || inqs.length === 0) return [];
    const [{ data: resps }, { data: accounts }] = await Promise.all([
      this.db
        .from('responses')
        .select('*')
        .in('inquiry_id', inqs.map((i) => i.id))
        .order('responded_at', { ascending: true }),
      this.db.from('customer_accounts').select('customer_id, email, full_name, avatar_url'),
    ]);

    const avatarByCustomerId = new Map<string, string>();
    const avatarByEmail = new Map<string, string>();
    const avatarByName = new Map<string, string>();
    for (const acc of accounts ?? []) {
      const av = typeof acc.avatar_url === 'string' && acc.avatar_url ? acc.avatar_url : '';
      if (!av) continue;
      if (acc.customer_id) avatarByCustomerId.set(String(acc.customer_id), av);
      if (acc.email) avatarByEmail.set(String(acc.email).toLowerCase(), av);
      if (acc.full_name) avatarByName.set(String(acc.full_name).toLowerCase(), av);
    }

    const byInq = new Map<string, InquiryResponseRecord[]>();
    for (const r of resps ?? []) {
      const key = String(r.inquiry_id);
      const list = byInq.get(key) ?? [];
      list.push({
        id: String(r.id),
        inquiryId: key,
        adminId: (r.admin_id as string | null) ?? null,
        adminDisplayName: r.sender_role === 'customer' ? 'Customer' : 'RJ HUB Admin',
        senderRole: (r.sender_role as 'admin' | 'customer') ?? 'admin',
        responseText: String(r.response_text),
        imageDataUrl: (r.image_data_url as string | undefined) ?? undefined,
        respondedAt: String(r.responded_at),
      });
      byInq.set(key, list);
    }

    const search = filters?.search?.trim().toLowerCase() ?? '';
    return inqs
      .map((i) => {
        const mapped = mapInquiryRow(i, byInq.get(String(i.id)) ?? []);
        const contactLower = mapped.customerContactSnapshot.toLowerCase();
        let avatar = mapped.customerId ? avatarByCustomerId.get(mapped.customerId) : undefined;
        if (!avatar) {
          for (const [em, url] of avatarByEmail) {
            if (contactLower.includes(em)) {
              avatar = url;
              break;
            }
          }
        }
        if (!avatar) {
          avatar = avatarByName.get(mapped.customerNameSnapshot.toLowerCase());
        }
        if (avatar) mapped.customerAvatarUrl = avatar;
        return mapped;
      })
      .filter((i) =>
        !search
          ? true
          : i.customerNameSnapshot.toLowerCase().includes(search) ||
            i.referenceCode.toLowerCase().includes(search) ||
            i.message.toLowerCase().includes(search),
      );
  }

  async getInquiryById(id: string): Promise<InquiryRecord | null> {
    const all = await this.listInquiries();
    return all.find((i) => i.id === id) ?? null;
  }

  async getInquiryByRef(ref: string): Promise<InquiryRecord | null> {
    const all = await this.listInquiries();
    return all.find((i) => i.referenceCode === ref) ?? null;
  }

  async findCustomerInquiry(input: { email?: string; name?: string; contact?: string }): Promise<InquiryRecord | null> {
    const all = await this.listInquiries();
    return (
      all.find((i) =>
        sameCustomerIdentity(
          {
            name: i.customerNameSnapshot,
            email: i.customerEmail,
            contact: i.customerContactSnapshot,
          },
          input,
        ),
      ) ?? null
    );
  }

  async getTotalInquirySubmissions(): Promise<number> {
    const [{ count: inqCount }, { count: respCount }] = await Promise.all([
      this.db.from('inquiries').select('id', { count: 'exact', head: true }),
      this.db
        .from('responses')
        .select('id', { count: 'exact', head: true })
        .eq('sender_role', 'customer'),
    ]);
    return (inqCount ?? 0) + (respCount ?? 0);
  }

  async updateInquiryStatus(id: string, status: InquiryStatus): Promise<InquiryRecord | null> {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from('inquiries')
      .update({ status, updated_at: now })
      .eq('id', id);
    if (error) return null;
    return this.getInquiryById(id);
  }

  async markInquirySeen(id: string): Promise<InquiryRecord | null> {
    const { error } = await this.db
      .from('inquiries')
      .update({ admin_seen_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return null;
    return this.getInquiryById(id);
  }

  async acceptInquiry(
    id: string,
  ): Promise<{ inquiry: InquiryRecord; client: CustomerRecord | null } | null> {
    const current = await this.getInquiryById(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const pricing = computeInquiryPricing({
      serviceId: current.serviceId,
      message: current.message,
      quantity: current.quantity,
      totalPrice: current.totalPrice,
      reservationFee: current.reservationFee,
    });
    const combinedItem = current.orderItem || pricing.orderItem;
    await this.db
      .from('inquiries')
      .update({
        status: current.status === 'Pending' ? 'Answered' : current.status,
        admin_seen_at: current.adminSeenAt ?? now,
        accepted_at: current.acceptedAt ?? now,
        archived_to_history: false,
        quantity: pricing.quantity,
        total_price: pricing.totalPrice,
        reservation_fee: pricing.reservationFee,
        updated_at: now,
      })
      .eq('id', id);

    let client: CustomerRecord | null = null;
    if (current.customerId) {
      await this.db
        .from('customers')
        .update({
          order_item: combinedItem,
          quantity: pricing.quantity,
          total_price: pricing.totalPrice,
          reservation_fee: pricing.reservationFee,
          order_date: current.submittedAt.slice(0, 10),
          updated_at: now,
        })
        .eq('id', current.customerId);
      client = await this.getClientById(current.customerId);
    }
    const updated = await this.getInquiryById(id);
    return updated ? { inquiry: updated, client } : null;
  }

  async archiveInquiryToHistory(id: string): Promise<InquiryRecord | null> {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from('inquiries')
      .update({ admin_seen_at: now, archived_to_history: true, updated_at: now })
      .eq('id', id);
    if (error) return null;
    return this.getInquiryById(id);
  }

  async setInquiryArchive(id: string, archived: boolean): Promise<InquiryRecord | null> {
    const now = new Date().toISOString();
    let res = await this.db
      .from('inquiries')
      .update({ admin_seen_at: now, is_archived: archived, updated_at: now })
      .eq('id', id);
    if (res.error) {
      res = await this.db
        .from('inquiries')
        .update({ admin_seen_at: now, archived_to_history: archived, updated_at: now })
        .eq('id', id);
    }
    if (res.error) return null;
    return this.getInquiryById(id);
  }

  async setInquiryBlock(id: string, blocked: boolean): Promise<InquiryRecord | null> {
    const now = new Date().toISOString();
    let res = await this.db
      .from('inquiries')
      .update({ admin_seen_at: now, is_blocked: blocked, updated_at: now })
      .eq('id', id);
    if (res.error) {
      res = await this.db
        .from('inquiries')
        .update({ admin_seen_at: now, archived_to_history: blocked, updated_at: now })
        .eq('id', id);
    }
    if (res.error) return null;
    return this.getInquiryById(id);
  }

  async deleteInquiry(id: string): Promise<boolean> {
    await this.db.from('responses').delete().eq('inquiry_id', id);
    const { error } = await this.db.from('inquiries').delete().eq('id', id);
    return !error;
  }

  async isCustomerBlocked(input: { email?: string; name?: string; contact?: string }): Promise<boolean> {
    const all = await this.listInquiries();
    return all.some(
      (i) =>
        Boolean(i.isBlocked) &&
        sameCustomerIdentity(
          {
            name: i.customerNameSnapshot,
            email: i.customerEmail,
            contact: i.customerContactSnapshot,
          },
          input,
        ),
    );
  }

  async setInquiryReservation(id: string, reservationFee: number | null): Promise<InquiryRecord | null> {
    const current = await this.getInquiryById(id);
    if (!current) return null;
    const now = new Date().toISOString();
    await this.db
      .from('inquiries')
      .update({ reservation_fee: reservationFee, updated_at: now })
      .eq('id', id);
    if (current.customerId) {
      await this.db
        .from('customers')
        .update({ reservation_fee: reservationFee, updated_at: now })
        .eq('id', current.customerId);
    }
    return this.getInquiryById(id);
  }

  async addInquiryResponse(input: {
    inquiryId: string;
    adminId: string | null;
    adminDisplayName: string;
    senderRole: 'admin' | 'customer';
    responseText: string;
    imageDataUrl?: string;
    nextStatus?: InquiryStatus;
    serviceId?: string;
    serviceNames?: string[];
    quantity?: number;
  }): Promise<{ inquiry: InquiryRecord; response: InquiryResponseRecord } | null> {
    const current = await this.getInquiryById(input.inquiryId);
    if (!current) return null;
    const { data: inserted, error } = await this.db
      .from('responses')
      .insert({
        inquiry_id: input.inquiryId,
        admin_id: input.adminId,
        sender_role: input.senderRole,
        response_text: input.responseText.trim() || 'Sent attachment',
        image_data_url: input.imageDataUrl ?? null,
      })
      .select('*')
      .single();
    if (error || !inserted) return null;

    const now = new Date().toISOString();
    const nextStatus: InquiryStatus =
      input.nextStatus ??
      (input.senderRole === 'admin' && current.status === 'Pending' ? 'Answered' : current.status);

    let nextOrderItem = current.orderItem || resolveServiceDisplayName(current.serviceId);
    let nextQuantity = current.quantity ?? 1;
    let nextTotalPrice = current.totalPrice ?? 0;
    let nextContactSnapshot = current.customerContactSnapshot;

    if (input.senderRole === 'customer') {
      nextContactSnapshot = mergePhoneIntoContact(nextContactSnapshot, input.responseText);
      const explicitNames: string[] = [];
      if (input.serviceNames && input.serviceNames.length > 0) {
        explicitNames.push(...input.serviceNames);
      }
      if (input.serviceId) {
        explicitNames.push(resolveServiceDisplayName(input.serviceId));
      }
      if (
        explicitNames.length > 0 ||
        /^(Adding another item:|Favorites Inquiry|3D Customizer Draft)/i.test(input.responseText.trim())
      ) {
        explicitNames.push(...extractServiceNamesFromText(input.responseText));
      }
      if (explicitNames.length > 0) {
        nextOrderItem = mergeServiceItems(nextOrderItem, explicitNames);
        const addQty =
          typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 1
            ? Math.round(input.quantity)
            : extractQtyFromMessage(input.responseText);
        const targetMeta =
          (input.serviceId ? SERVICE_META[input.serviceId] : undefined) ??
          Object.values(SERVICE_META).find(
            (m) => m.name.toLowerCase() === explicitNames[0]?.trim().toLowerCase(),
          );
        nextQuantity += addQty;
        nextTotalPrice += targetMeta ? targetMeta.unit * addQty : 0;
        if (current.customerId) {
          await this.db
            .from('customers')
            .update({
              order_item: nextOrderItem,
              quantity: nextQuantity,
              total_price: nextTotalPrice,
              order_date: now.slice(0, 10),
              order_status: 'Pending',
              status_updated_at: now,
              updated_at: now,
            })
            .eq('id', current.customerId);
        }
      }
    }

    await this.db
      .from('inquiries')
      .update({
        status: nextStatus,
        quantity: nextQuantity,
        total_price: nextTotalPrice,
        ...(input.senderRole === 'admin'
          ? { admin_seen_at: now, accepted_at: current.acceptedAt ?? now }
          : { archived_to_history: false }),
        updated_at: now,
      })
      .eq('id', input.inquiryId);
    const updated = await this.getInquiryById(input.inquiryId);
    if (!updated) return null;
    updated.orderItem = nextOrderItem;
    return {
      inquiry: updated,
      response: {
        id: String(inserted.id),
        inquiryId: input.inquiryId,
        adminId: input.adminId,
        adminDisplayName: input.adminDisplayName,
        senderRole: input.senderRole,
        responseText: String(inserted.response_text),
        imageDataUrl: (inserted.image_data_url as string | undefined) ?? undefined,
        respondedAt: String(inserted.responded_at),
      },
    };
  }

  async listClients(search = ''): Promise<CustomerRecord[]> {
    const { data } = await this.db
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .map((c) => ({
        id: String(c.id),
        fullName: String(c.full_name),
        contactInfo: String(c.contact_info),
        notes: String(c.notes ?? ''),
        orderItem: String(c.order_item ?? ''),
        quantity: typeof c.quantity === 'number' ? c.quantity : Number(c.quantity ?? 1),
        totalPrice: typeof c.total_price === 'number' ? c.total_price : Number(c.total_price ?? 0),
        reservationFee:
          c.reservation_fee !== null && c.reservation_fee !== undefined
            ? Number(c.reservation_fee)
            : null,
        orderDate: String(c.order_date ?? String(c.created_at).slice(0, 10)),
        orderStatus:
          (c.order_status as string) === 'In Progress'
            ? 'Pending'
            : ((c.order_status as ClientOrderStatus) || 'Pending'),
        statusUpdatedAt: String(c.status_updated_at ?? c.updated_at),
        createdAt: String(c.created_at),
        updatedAt: String(c.updated_at),
      }))
      .filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.contactInfo.toLowerCase().includes(q));
  }

  async getClientById(id: string): Promise<CustomerRecord | null> {
    const { data } = await this.db.from('customers').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    return {
      id: String(data.id),
      fullName: String(data.full_name),
      contactInfo: String(data.contact_info),
      notes: String(data.notes ?? ''),
      orderItem: String(data.order_item ?? ''),
      quantity: typeof data.quantity === 'number' ? data.quantity : Number(data.quantity ?? 1),
      totalPrice: typeof data.total_price === 'number' ? data.total_price : Number(data.total_price ?? 0),
      reservationFee:
        data.reservation_fee !== null && data.reservation_fee !== undefined
          ? Number(data.reservation_fee)
          : null,
      orderDate: String(data.order_date ?? String(data.created_at).slice(0, 10)),
      orderStatus:
        (data.order_status as string) === 'In Progress'
          ? 'Pending'
          : ((data.order_status as ClientOrderStatus) || 'Pending'),
      statusUpdatedAt: String(data.status_updated_at ?? data.updated_at),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }

  async getClientInquiries(clientId: string): Promise<InquiryRecord[]> {
    const all = await this.listInquiries();
    return all.filter((i) => i.customerId === clientId);
  }

  async createClient(input: {
    fullName: string;
    contactInfo: string;
    notes: string;
    orderItem?: string;
    quantity?: number;
    totalPrice?: number;
    reservationFee?: number | null;
    orderDate?: string;
    orderStatus?: ClientOrderStatus;
  }): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from('customers')
      .insert({
        full_name: input.fullName.trim(),
        contact_info: input.contactInfo.trim(),
        notes: input.notes.trim(),
        order_item: input.orderItem?.trim() ?? '',
        quantity: input.quantity ?? 1,
        total_price: input.totalPrice ?? 0,
        reservation_fee: input.reservationFee ?? null,
        order_date: input.orderDate?.trim() || now.slice(0, 10),
        order_status: input.orderStatus ?? 'Pending',
        status_updated_at: now,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to create client.');
    return {
      id: String(data.id),
      fullName: String(data.full_name),
      contactInfo: String(data.contact_info),
      notes: String(data.notes ?? ''),
      orderItem: String(data.order_item ?? ''),
      quantity: typeof data.quantity === 'number' ? data.quantity : Number(data.quantity ?? 1),
      totalPrice: typeof data.total_price === 'number' ? data.total_price : Number(data.total_price ?? 0),
      reservationFee:
        data.reservation_fee !== null && data.reservation_fee !== undefined
          ? Number(data.reservation_fee)
          : null,
      orderDate: String(data.order_date ?? String(data.created_at).slice(0, 10)),
      orderStatus: (data.order_status as ClientOrderStatus) || 'Pending',
      statusUpdatedAt: String(data.status_updated_at ?? data.updated_at),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }

  async updateClient(
    id: string,
    input: {
      fullName: string;
      contactInfo: string;
      notes: string;
      orderItem?: string;
      quantity?: number;
      totalPrice?: number;
      reservationFee?: number | null;
      orderDate?: string;
      orderStatus?: ClientOrderStatus;
    },
  ): Promise<CustomerRecord | null> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      full_name: input.fullName.trim(),
      contact_info: input.contactInfo.trim(),
      notes: input.notes.trim(),
      updated_at: now,
    };
    if (input.orderItem !== undefined) patch.order_item = input.orderItem.trim();
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.totalPrice !== undefined) patch.total_price = input.totalPrice;
    if (input.reservationFee !== undefined) patch.reservation_fee = input.reservationFee;
    if (input.orderDate !== undefined) patch.order_date = input.orderDate.trim();
    if (input.orderStatus !== undefined) {
      patch.order_status = input.orderStatus;
      patch.status_updated_at = now;
    }

    const { data, error } = await this.db
      .from('customers')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: String(data.id),
      fullName: String(data.full_name),
      contactInfo: String(data.contact_info),
      notes: String(data.notes ?? ''),
      orderItem: String(data.order_item ?? ''),
      quantity: typeof data.quantity === 'number' ? data.quantity : Number(data.quantity ?? 1),
      totalPrice: typeof data.total_price === 'number' ? data.total_price : Number(data.total_price ?? 0),
      reservationFee:
        data.reservation_fee !== null && data.reservation_fee !== undefined
          ? Number(data.reservation_fee)
          : null,
      orderDate: String(data.order_date ?? String(data.created_at).slice(0, 10)),
      orderStatus: (data.order_status as ClientOrderStatus) || 'Pending',
      statusUpdatedAt: String(data.status_updated_at ?? data.updated_at),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }

  async deleteClient(id: string): Promise<{ deletedClientId: string; archivedInquiryCount: number } | null> {
    const existing = await this.getClientById(id);
    if (!existing) return null;
    await this.db
      .from('inquiries')
      .update({ status: 'Answered' })
      .eq('customer_id', id)
      .eq('status', 'Completed');
    const { data: linked } = await this.db
      .from('inquiries')
      .update({
        customer_id: null,
      })
      .eq('customer_id', id)
      .select('id');
    await this.db.from('customers').delete().eq('id', id);
    return { deletedClientId: id, archivedInquiryCount: linked?.length ?? 0 };
  }

  async deleteAllLogClients(): Promise<{ deletedCount: number; archivedInquiryCount: number }> {
    const { data: logs } = await this.db
      .from('customers')
      .select('id')
      .in('order_status', ['Done', 'Cancelled']);
    const ids = (logs ?? []).map((r) => String(r.id));
    if (ids.length === 0) return { deletedCount: 0, archivedInquiryCount: 0 };

    await this.db
      .from('inquiries')
      .update({ status: 'Answered' })
      .in('customer_id', ids)
      .eq('status', 'Completed');
    const { data: linked } = await this.db
      .from('inquiries')
      .update({ customer_id: null })
      .in('customer_id', ids)
      .select('id');
    await this.db.from('customers').delete().in('id', ids);
    return { deletedCount: ids.length, archivedInquiryCount: linked?.length ?? 0 };
  }

  async deleteAllMessageHistory(): Promise<{ deletedCount: number }> {
    const all = await this.listInquiries();
    const historyIds = all
      .filter(
        (i) =>
          Boolean(i.archivedToHistory) ||
          Boolean(i.acceptedAt) ||
          i.responses.some((r) => r.senderRole === 'admin'),
      )
      .map((i) => i.id);
    if (historyIds.length === 0) return { deletedCount: 0 };
    await this.db.from('responses').delete().in('inquiry_id', historyIds);
    await this.db.from('inquiries').delete().in('id', historyIds);
    return { deletedCount: historyIds.length };
  }

  async appendActivityLog(log: Omit<ActivityLogRecord, 'id' | 'createdAt'>): Promise<ActivityLogRecord> {
    const { data, error } = await this.db
      .from('activity_logs')
      .insert({
        actor_type: log.actorType,
        actor_id: log.actorId,
        actor_identity: log.actorIdentity,
        category: log.category,
        action: log.action,
        description: log.description,
        target_type: log.targetType,
        target_id: log.targetId,
        metadata: redactSecrets(log.metadata),
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to log activity.');
    return {
      id: String(data.id),
      actorType: data.actor_type,
      actorId: (data.actor_id as string | null) ?? null,
      actorIdentity: String(data.actor_identity),
      category: String(data.category),
      action: String(data.action),
      description: String(data.description),
      targetType: (data.target_type as string | null) ?? null,
      targetId: (data.target_id as string | null) ?? null,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      createdAt: String(data.created_at),
    };
  }

  async listActivityLogs(filters?: {
    search?: string;
    category?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ActivityLogRecord[]; total: number }> {
    const { data } = await this.db
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    const items = (data ?? []).map((r) => ({
      id: String(r.id),
      actorType: r.actor_type as ActivityLogRecord['actorType'],
      actorId: (r.actor_id as string | null) ?? null,
      actorIdentity: String(r.actor_identity ?? ''),
      category: String(r.category ?? 'operations'),
      action: String(r.action),
      description: String(r.description),
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
    const q = filters?.search?.trim().toLowerCase() ?? '';
    const cat = filters?.category?.trim() ?? '';
    const fromMs = filters?.from ? new Date(filters.from).getTime() : 0;
    const toMs = filters?.to ? new Date(filters.to).getTime() + 86400_000 : Infinity;
    const filtered = items.filter((l) => {
      if (cat && cat !== 'all' && l.category !== cat) return false;
      const t = new Date(l.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return l.description.toLowerCase().includes(q) || l.actorIdentity.toLowerCase().includes(q);
    });
    return paginate(filtered, filters?.page, filters?.pageSize);
  }

  async appendSecurityLog(log: Omit<SecurityLogRecord, 'id' | 'createdAt'>): Promise<SecurityLogRecord> {
    const { data, error } = await this.db
      .from('security_logs')
      .insert({
        event_type: log.eventType,
        severity: log.severity,
        actor_identity: log.actorIdentity,
        ip_address: log.ipAddress,
        description: log.description,
        target_id: log.targetId,
        details: redactSecrets(log.details),
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Unable to log security event.');
    return {
      id: String(data.id),
      eventType: String(data.event_type),
      severity: data.severity as SecurityLogRecord['severity'],
      actorIdentity: String(data.actor_identity),
      ipAddress: String(data.ip_address),
      description: String(data.description),
      targetId: (data.target_id as string | null) ?? null,
      details: (data.details as Record<string, unknown>) ?? {},
      createdAt: String(data.created_at),
    };
  }

  async listSecurityLogs(filters?: {
    search?: string;
    severity?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SecurityLogRecord[]; total: number }> {
    const { data } = await this.db
      .from('security_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    const items = (data ?? []).map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      severity: r.severity as SecurityLogRecord['severity'],
      actorIdentity: String(r.actor_identity ?? ''),
      ipAddress: String(r.ip_address ?? 'unknown'),
      description: String(r.description),
      targetId: (r.target_id as string | null) ?? null,
      details: (r.details as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    }));
    const q = filters?.search?.trim().toLowerCase() ?? '';
    const sev = filters?.severity?.trim() ?? '';
    const fromMs = filters?.from ? new Date(filters.from).getTime() : 0;
    const toMs = filters?.to ? new Date(filters.to).getTime() + 86400_000 : Infinity;
    const filtered = items.filter((l) => {
      if (sev && sev !== 'all' && l.severity !== sev) return false;
      const t = new Date(l.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return l.description.toLowerCase().includes(q) || l.actorIdentity.toLowerCase().includes(q);
    });
    return paginate(filtered, filters?.page, filters?.pageSize);
  }

  async incrementRateLimit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: string }> {
    const { data, error } = await this.db.rpc('increment_rate_limit', {
      p_key: key,
      p_window_seconds: windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      return { count: 1, resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString() };
    }
    return {
      count: Number(row.current_count ?? 1),
      resetAt: String(row.bucket_reset ?? new Date(Date.now() + windowSeconds * 1000).toISOString()),
    };
  }

  async listReviews(): Promise<ReviewRecord[]> {
    const { data, error } = await this.db
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data.map((r) => {
      const role = String(r.role_label ?? 'Verified Customer');
      return {
        id: String(r.id),
        author: String(r.author_name ?? ''),
        initials: String(r.initials ?? 'RJ'),
        role: role === 'Google Signed-In Client' ? 'Verified Customer' : role,
        quote: String(r.quote ?? ''),
        rating: Number(r.rating ?? 5),
        avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : undefined,
        createdAt: String(r.created_at),
      };
    });
  }

  async createReview(input: {
    author: string;
    initials: string;
    role: string;
    quote: string;
    rating: number;
    avatarUrl?: string;
  }): Promise<ReviewRecord> {
    const normalizedRole =
      input.role === 'Google Signed-In Client' ? 'Verified Customer' : input.role;
    const baseRow: Record<string, unknown> = {
      author_name: input.author,
      initials: input.initials,
      role_label: normalizedRole,
      quote: input.quote,
      rating: input.rating,
    };
    const insertRow: Record<string, unknown> = input.avatarUrl
      ? { ...baseRow, avatar_url: input.avatarUrl }
      : baseRow;
    let res = await this.db.from('reviews').insert(insertRow).select('*').single();
    if (res.error && input.avatarUrl) {
      res = await this.db.from('reviews').insert(baseRow).select('*').single();
    }
    const { data, error } = res;
    if (error || !data) throw new Error(error?.message || 'Unable to save review.');
    return {
      id: String(data.id),
      author: String(data.author_name ?? input.author),
      initials: String(data.initials ?? input.initials),
      role: normalizedRole,
      quote: String(data.quote ?? input.quote),
      rating: Number(data.rating ?? input.rating),
      avatarUrl:
        typeof data.avatar_url === 'string' && data.avatar_url
          ? data.avatar_url
          : input.avatarUrl,
      createdAt: String(data.created_at),
    };
  }
}

export function createStore(): BackendStore {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    return new SupabaseStore(url, key);
  }
  return new LocalFileStore();
}
