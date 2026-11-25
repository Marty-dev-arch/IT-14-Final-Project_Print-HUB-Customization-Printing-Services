import { SERVICE_BY_ID } from '../data/services';
import type {
  AdminLoginDraft,
  ClientDraft,
  InquiryDraft,
  ValidationErrors,
} from '../types/domain';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_CHARS = /^[+\d()\s.-]+$/;
const PH_MOBILE_PATTERN = /^09\d{9}$/;

export function sanitizePhPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function isValidPhPhone(value: string): boolean {
  return PH_MOBILE_PATTERN.test(value.replace(/\D/g, ''));
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidContactInfo(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 120) {
    return false;
  }
  if (trimmed.includes('@')) {
    return isValidEmail(trimmed);
  }
  if (!PHONE_ALLOWED_CHARS.test(trimmed)) {
    return false;
  }
  const digitCount = trimmed.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

export function normalizeContactKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  return trimmed.replace(/\D/g, '');
}

export interface InquiryValidationOptions {
  requireService?: boolean;
  requireEmail?: boolean;
  requirePhPhone?: boolean;
}

export function validateInquiryDraft(
  draft: InquiryDraft,
  options: InquiryValidationOptions = {},
): ValidationErrors<InquiryDraft> {
  const { requireService = true, requireEmail = false, requirePhPhone = false } = options;
  const errors: ValidationErrors<InquiryDraft> = {};
  const name = draft.customerName.trim();
  const contact = draft.contactInfo.trim();
  const email = (draft.email ?? '').trim();
  const message = draft.message.trim();

  if (name.length < 2) {
    errors.customerName = 'Enter your full name (at least 2 characters).';
  } else if (name.length > 100) {
    errors.customerName = 'Name must be 100 characters or fewer.';
  }

  if (requirePhPhone) {
    if (!isValidPhPhone(contact)) {
      errors.contactInfo =
        'Enter a valid 11-digit Philippine mobile number starting with 09 (e.g., 09171234567).';
    }
  } else if (!contact) {
    errors.contactInfo = 'Enter an email address or phone number so we can reach you.';
  } else if (!isValidContactInfo(contact)) {
    errors.contactInfo = 'Enter a valid email address or phone number (7–15 digits).';
  }

  if (requireEmail && !email) {
    errors.email = 'Enter your email address.';
  } else if (email && !email.includes('@')) {
    errors.email = "Email address must include '@'.";
  } else if (email && !isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const isGeneralInquiry = draft.serviceId === 'General Inquiry';
  if (requireService) {
    if (!draft.serviceId || (!isGeneralInquiry && !SERVICE_BY_ID[draft.serviceId]?.isActive)) {
      errors.serviceId = 'Select one of the available RJ HUB Printing services.';
    }
  } else if (draft.serviceId && !isGeneralInquiry && !SERVICE_BY_ID[draft.serviceId]?.isActive) {
    errors.serviceId = 'Select one of the available RJ HUB Printing services.';
  }

  if (message.length < 10) {
    errors.message = 'Describe your printing request in at least 10 characters.';
  } else if (message.length > 2000) {
    errors.message = 'Message must be 2,000 characters or fewer.';
  }

  return errors;
}

export function validateStrongPassword(password: string): string | undefined {
  const hasMinLen = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  if (!hasMinLen || !hasLower || !hasUpper || !hasDigit || !hasSpecial) {
    return 'Password must be 8+ characters with uppercase, lowercase, number, and special character.';
  }
  return undefined;
}

export function validateReplyText(replyText: string, hasImage = false): string | undefined {
  const trimmed = replyText.trim();
  if (hasImage && !trimmed) {
    return undefined;
  }
  if (trimmed.length < 2) {
    return 'Write a reply of at least 2 characters before saving.';
  }
  if (trimmed.length > 2000) {
    return 'Reply must be 2,000 characters or fewer.';
  }
  return undefined;
}

export function validateClientDraft(draft: ClientDraft): ValidationErrors<ClientDraft> {
  const errors: ValidationErrors<ClientDraft> = {};
  const fullName = draft.fullName.trim();
  const contact = draft.contactInfo.trim();
  const notes = draft.notes.trim();

  if (fullName.length < 2) {
    errors.fullName = 'Client name must be at least 2 characters.';
  } else if (fullName.length > 100) {
    errors.fullName = 'Client name must be 100 characters or fewer.';
  }

  if (!contact) {
    errors.contactInfo = 'Client contact info (email or phone) is required.';
  } else if (!isValidContactInfo(contact)) {
    errors.contactInfo = 'Provide a valid email address or 7–15 digit phone number.';
  }

  if (notes.length > 500) {
    errors.notes = 'Client notes must be 500 characters or fewer.';
  }

  return errors;
}

export function validateAdminLogin(draft: AdminLoginDraft): ValidationErrors<AdminLoginDraft> {
  const errors: ValidationErrors<AdminLoginDraft> = {};
  if (!isValidEmail(draft.email)) {
    errors.email = 'Enter a valid administrator email address.';
  }
  if (!draft.password.trim()) {
    errors.password = 'Enter your administrator password.';
  }
  return errors;
}

export function hasValidationErrors<T>(errors: ValidationErrors<T>): boolean {
  return Object.values(errors).some((msg) => Boolean(msg));
}
