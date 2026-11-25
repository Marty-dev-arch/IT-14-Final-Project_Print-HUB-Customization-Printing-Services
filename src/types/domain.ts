export type InquiryStatus = 'Pending' | 'Answered' | 'Completed';

export type ServiceCategory = 'print-paper' | 'keepsakes-gifts' | 'engraving-signage';

export type ServiceAccent = 'cyan' | 'magenta' | 'yellow';

export interface ServiceItem {
  id: string;
  slug: string;
  code: string;
  serviceName: string;
  category: ServiceCategory;
  categoryLabel: string;
  accent: ServiceAccent;
  pastelHex: string;
  pricePhp: string;
  reservationFeePhp: string;
  imageSrc?: string;
  sizeNote?: string;
  description: string;
  inquiryGuidance: string;
  isActive: boolean;
}

export interface ChatDraftPayload {
  text: string;
  imageDataUrl?: string;
  quantity?: number;
  serviceNames?: string[];
}

export interface CustomerReview {
  id: string;
  author: string;
  initials: string;
  role: string;
  quote: string;
  rating: number;
  avatarUrl?: string;
  createdAt: string;
  isSample?: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  contactInfo: string;
  notes: string;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryResponse {
  id: string;
  inquiryId: string;
  adminId: string;
  adminDisplayName: string;
  responseText: string;
  respondedAt: string;
  senderRole?: 'admin' | 'customer';
  imageDataUrl?: string;
}

export interface Inquiry {
  id: string;
  referenceCode: string;
  customerId: string | null;
  customerNameSnapshot: string;
  customerContactSnapshot: string;
  isCustomerArchived: boolean;
  serviceId: string;
  orderItem?: string;
  message: string;
  status: InquiryStatus;
  adminSeenAt?: string | null;
  quantity?: number;
  reservationFee?: number | null;
  isSample: boolean;
  submittedAt: string;
  updatedAt: string;
  responses: InquiryResponse[];
}

export interface AdminProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'staff';
  avatarDataUrl?: string;
}

export interface AdminSession {
  admin: AdminProfile;
  signedInAt: string;
}

export interface AdminCreateDraft {
  displayName?: string;
  email: string;
  role?: 'owner' | 'admin' | 'staff';
  password: string;
}

export interface CustomerSession {
  id: string;
  fullName: string;
  email: string;
  provider: 'google';
  signedInAt: string;
  avatarDataUrl?: string;
  roleTitle?: string;
  defaultServiceId?: string;
}

export interface ProfileUpdateDraft {
  fullName?: string;
  email?: string;
  avatarDataUrl?: string | null;
  roleTitle?: string;
  defaultServiceId?: string;
}

export interface InquiryDraft {
  customerName: string;
  contactInfo: string;
  email?: string;
  serviceId: string;
  message: string;
  quantity?: number;
  wantsReservation?: boolean;
  reservationFee?: number | null;
  imageDataUrl?: string;
}

export interface ClientDraft {
  fullName: string;
  contactInfo: string;
  notes: string;
}

export interface AdminLoginDraft {
  email: string;
  password: string;
}

export interface InquiryFilters {
  search: string;
  status: 'All' | InquiryStatus;
}

export type ValidationErrors<T> = Partial<Record<keyof T, string>>;
