import type {
  AdminCreateDraft,
  AdminLoginDraft,
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

export interface InquiryStatusCounts {
  total: number;
  pending: number;
  answered: number;
  completed: number;
}

export interface StoreSnapshot {
  customers: Customer[];
  inquiries: Inquiry[];
}

export interface DataRepository {
  getServices(): readonly ServiceItem[];
  getSnapshot(): StoreSnapshot;
  listInquiries(filters?: InquiryFilters): Inquiry[];
  getInquiryById(id: string): Inquiry | undefined;
  getStatusCounts(): InquiryStatusCounts;
  createInquiry(draft: InquiryDraft): Inquiry;
  updateInquiry(id: string, draft: InquiryDraft): Inquiry;
  updateInquiryStatus(id: string, status: InquiryStatus): Inquiry;
  addInquiryReply(
    inquiryId: string,
    responseText: string,
    nextStatus?: InquiryStatus,
    imageDataUrl?: string,
  ): { inquiry: Inquiry; response: InquiryResponse };
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
  ): { inquiry: Inquiry; response: InquiryResponse };
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
  ): boolean;
  removeInquiryByRef(referenceCode: string): boolean;
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
  }): Inquiry;
  listClients(search?: string): Customer[];
  getClientById(id: string): Customer | undefined;
  getClientInquiries(clientId: string): Inquiry[];
  createClient(draft: ClientDraft): Customer;
  updateClient(id: string, draft: ClientDraft): Customer;
  deleteClient(id: string): { deletedClientId: string; archivedInquiryCount: number };
  resetDemoData(): StoreSnapshot;
}

export interface AuthService {
  getSession(): AdminSession | null;
  signIn(credentials: AdminLoginDraft): AdminSession;
  registerAdmin(draft: AdminCreateDraft): AdminSession;
  updateAdminProfile(patch: ProfileUpdateDraft): AdminSession | null;
  signOut(): void;
}

export interface CustomerPrefsService {
  getFavorites(): string[];
  toggleFavorite(serviceId: string): string[];
  getCustomerSession(): CustomerSession | null;
  getLastSavedCustomerAccount(): CustomerSession | null;
  signInWithGoogle(fullName?: string, email?: string, avatarDataUrl?: string): CustomerSession;
  updateCustomerProfile(patch: ProfileUpdateDraft): CustomerSession;
  signOutCustomer(): void;
}
