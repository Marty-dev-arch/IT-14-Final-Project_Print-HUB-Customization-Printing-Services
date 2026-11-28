export type AdminRole = 'owner' | 'admin' | 'staff';
export type InquiryStatus = 'Pending' | 'Answered' | 'Completed';
export type ClientOrderStatus = 'Pending' | 'Done' | 'Cancelled';
export type AuthStage = 'password_ok' | 'pin_ok' | 'mfa_verified';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  authStage?: AuthStage;
}

export interface InquiryResponseItem {
  id: string;
  inquiryId: string;
  adminId: string | null;
  adminDisplayName: string;
  senderRole: 'admin' | 'customer';
  responseText: string;
  imageDataUrl?: string;
  respondedAt: string;
}

export interface InquiryItem {
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
  isArchived?: boolean;
  isBlocked?: boolean;
  status: InquiryStatus;
  submittedAt: string;
  updatedAt: string;
  responses: InquiryResponseItem[];
}

export interface ClientItem {
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
  inquiryCount?: number;
  referenceCode?: string | null;
}

export interface ActivityLogItem {
  id: string;
  actorType: string;
  actorIdentity: string;
  category: string;
  action: string;
  description: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface SecurityLogItem {
  id: string;
  eventType: string;
  severity: 'info' | 'warn' | 'critical';
  actorIdentity: string;
  ipAddress: string;
  description: string;
  targetId: string | null;
  createdAt: string;
}

export interface ActiveSessionItem {
  id: string;
  adminId: string;
  authStage: AuthStage;
  ipAddress: string;
  userAgent: string;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface DashboardPayload {
  counts: {
    total: number;
    pending: number;
    answered: number;
    completed: number;
    clients: number;
  };
  dailyVolume: Array<{ date: string; label: string; count: number }>;
  chartSeries?: {
    daily: Array<{ label: string; incoming: number; resolved: number }>;
    weekly: Array<{ label: string; incoming: number; resolved: number }>;
    monthly: Array<{ label: string; incoming: number; resolved: number }>;
  };
  serviceDemand: Array<{ serviceId: string; serviceName: string; count: number }>;
  recentInquiries: InquiryItem[];
  recentActivities: ActivityLogItem[];
  recentSecurityAlerts: SecurityLogItem[];
}
