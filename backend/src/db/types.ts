export type AdminRole = 'owner' | 'admin' | 'staff';
export type InquiryStatus = 'Pending' | 'Answered' | 'Completed';
export type ClientOrderStatus = 'Pending' | 'Done' | 'Cancelled';
export type AuthStage = 'password_ok' | 'pin_ok' | 'mfa_verified';

export interface AdminRecord {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  passwordHash: string;
  pinHash: string;
  totpSecretEncrypted: string | null;
  mfaEnabled: boolean;
  recoveryCodeHashes: string[];
  lastTotpStep: number | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  tokenHash: string;
  csrfTokenHash: string;
  authStage: AuthStage;
  ipAddress: string;
  userAgent: string;
  lastActiveAt: string;
  expiresAt: string;
  reauthVerifiedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CustomerAccountRecord {
  id: string;
  customerId: string | null;
  googleSub: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  lastLoginAt: string;
  createdAt: string;
}

export interface ServiceRecord {
  id: string;
  serviceName: string;
  description: string;
  isActive: boolean;
}

export interface CustomerRecord {
  id: string;
  fullName: string;
  contactInfo: string;
  notes: string;
  orderItem?: string;
  quantity?: number;
  totalPrice?: number;
  reservationFee?: number | null;
  orderDate?: string;
  orderStatus?: ClientOrderStatus;
  statusUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryResponseRecord {
  id: string;
  inquiryId: string;
  adminId: string | null;
  adminDisplayName: string;
  senderRole: 'admin' | 'customer';
  responseText: string;
  imageDataUrl?: string;
  respondedAt: string;
}

export interface InquiryRecord {
  id: string;
  referenceCode: string;
  customerId: string | null;
  customerNameSnapshot: string;
  customerContactSnapshot: string;
  customerEmail?: string;
  customerAvatarUrl?: string;
  isCustomerArchived: boolean;
  serviceId: string;
  orderItem?: string;
  message: string;
  quantity?: number;
  totalPrice?: number;
  reservationFee?: number | null;
  adminSeenAt?: string | null;
  acceptedAt?: string | null;
  archivedToHistory?: boolean;
  status: InquiryStatus;
  submittedAt: string;
  updatedAt: string;
  responses: InquiryResponseRecord[];
}

export interface ActivityLogRecord {
  id: string;
  actorType: 'admin' | 'customer' | 'system';
  actorId: string | null;
  actorIdentity: string;
  category: string;
  action: string;
  description: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SecurityLogRecord {
  id: string;
  eventType: string;
  severity: 'info' | 'warn' | 'critical';
  actorIdentity: string;
  ipAddress: string;
  description: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewRecord {
  id: string;
  author: string;
  initials: string;
  role: string;
  quote: string;
  rating: number;
  avatarUrl?: string;
  createdAt: string;
}

export interface BackendStore {
  getServices(): Promise<ServiceRecord[]>;
  listAdmins(): Promise<AdminRecord[]>;
  findAdminByEmail(email: string): Promise<AdminRecord | null>;
  findAdminById(id: string): Promise<AdminRecord | null>;
  upsertProvisionedAdmin(admin: Omit<AdminRecord, 'id' | 'createdAt'> & { id?: string }): Promise<AdminRecord>;
  updateAdminSecurity(id: string, patch: Partial<AdminRecord>): Promise<void>;
  createSession(session: Omit<AdminSessionRecord, 'id' | 'createdAt'>): Promise<AdminSessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | null>;
  updateSession(id: string, patch: Partial<AdminSessionRecord>): Promise<AdminSessionRecord | null>;
  listAdminSessions(adminId?: string): Promise<AdminSessionRecord[]>;
  revokeSession(id: string): Promise<void>;
  revokeAllOtherSessions(adminId: string, exceptSessionId: string): Promise<number>;
  upsertGoogleCustomer(input: {
    googleSub: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  }): Promise<CustomerAccountRecord>;
  updateCustomerAvatar(input: {
    email?: string;
    fullName?: string;
    avatarUrl: string | null;
  }): Promise<void>;
  createInquiry(input: {
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
  }): Promise<InquiryRecord>;
  listInquiries(filters?: { search?: string; status?: 'All' | InquiryStatus }): Promise<InquiryRecord[]>;
  getInquiryById(id: string): Promise<InquiryRecord | null>;
  getInquiryByRef(ref: string): Promise<InquiryRecord | null>;
  findCustomerInquiry(input: { email?: string; name?: string }): Promise<InquiryRecord | null>;
  getTotalInquirySubmissions(): Promise<number>;
  updateInquiryStatus(id: string, status: InquiryStatus): Promise<InquiryRecord | null>;
  markInquirySeen(id: string): Promise<InquiryRecord | null>;
  acceptInquiry(id: string): Promise<{ inquiry: InquiryRecord; client: CustomerRecord | null } | null>;
  archiveInquiryToHistory(id: string): Promise<InquiryRecord | null>;
  setInquiryReservation(id: string, reservationFee: number | null): Promise<InquiryRecord | null>;
  addInquiryResponse(input: {
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
  }): Promise<{ inquiry: InquiryRecord; response: InquiryResponseRecord } | null>;
  deleteAllMessageHistory(): Promise<{ deletedCount: number }>;
  listClients(search?: string): Promise<CustomerRecord[]>;
  getClientById(id: string): Promise<CustomerRecord | null>;
  getClientInquiries(clientId: string): Promise<InquiryRecord[]>;
  createClient(input: {
    fullName: string;
    contactInfo: string;
    notes: string;
    orderItem?: string;
    quantity?: number;
    totalPrice?: number;
    reservationFee?: number | null;
    orderDate?: string;
    orderStatus?: ClientOrderStatus;
  }): Promise<CustomerRecord>;
  updateClient(
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
  ): Promise<CustomerRecord | null>;
  deleteClient(id: string): Promise<{ deletedClientId: string; archivedInquiryCount: number } | null>;
  deleteAllLogClients(): Promise<{ deletedCount: number; archivedInquiryCount: number }>;
  appendActivityLog(log: Omit<ActivityLogRecord, 'id' | 'createdAt'>): Promise<ActivityLogRecord>;
  listActivityLogs(filters?: {
    search?: string;
    category?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ActivityLogRecord[]; total: number }>;
  appendSecurityLog(log: Omit<SecurityLogRecord, 'id' | 'createdAt'>): Promise<SecurityLogRecord>;
  listSecurityLogs(filters?: {
    search?: string;
    severity?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SecurityLogRecord[]; total: number }>;
  incrementRateLimit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: string }>;
  listReviews(): Promise<ReviewRecord[]>;
  createReview(input: {
    author: string;
    initials: string;
    role: string;
    quote: string;
    rating: number;
    avatarUrl?: string;
  }): Promise<ReviewRecord>;
}
