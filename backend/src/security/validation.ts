const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PH_MOBILE_RE = /^09\d{9}$/;
const PIN_RE = /^\d{6}$/;
const UUID_OR_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const INJECTION_RE = /<script\b|javascript:|on(?:error|load|click)=|\bunion\s+select\b|;\s*(?:drop|delete|truncate)\b|--\s*$/i;

export function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isSafeText(value: string): boolean {
  return !CONTROL_CHAR_RE.test(value) && !INJECTION_RE.test(value);
}

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && UUID_OR_ID_RE.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 120 && EMAIL_RE.test(v) && isSafeText(v);
}

export function isValidPhPhone(value: string): boolean {
  return PH_MOBILE_RE.test(value.replace(/\D/g, ''));
}

export function isValidContactInfo(value: string): boolean {
  const v = value.trim();
  if (!isSafeText(v) || v.length < 5 || v.length > 160) return false;
  if (v.includes('·')) {
    const parts = v.split('·').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((p) => (p.includes('@') ? isValidEmail(p) : isValidPhPhone(p)));
  }
  if (v.includes('@')) return isValidEmail(v);
  const digits = v.replace(/\D/g, '');
  return /^[+\d()\s.-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
}

export function validateAdminPassword(password: string): string | null {
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.';
  }
  return null;
}

export function validatePinFormat(pin: unknown): string | null {
  if (typeof pin !== 'string' || !PIN_RE.test(pin.trim())) {
    return 'PIN must be exactly 6 numeric digits.';
  }
  return null;
}

export function validateTotpOrRecovery(code: unknown): string | null {
  if (typeof code !== 'string') return 'Enter a 6-digit authenticator code or recovery code.';
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed) || /^[A-F0-9]{4}-[A-F0-9]{4}$/i.test(trimmed)) {
    return null;
  }
  return 'Enter a valid 6-digit TOTP code or XXXX-XXXX recovery code.';
}

export function validateInquiryPayload(body: Record<string, unknown>): string | null {
  const customerName = cleanText(body.customerName);
  const contactInfo = cleanText(body.contactInfo);
  const email = cleanText(body.email);
  const serviceId = cleanText(body.serviceId);
  const message = cleanText(body.message);

  if (customerName.length < 2 || customerName.length > 100 || !isSafeText(customerName)) {
    return 'Enter a valid full name (2–100 characters).';
  }
  if (!isValidPhPhone(contactInfo) && !isValidContactInfo(contactInfo)) {
    return 'Enter a valid 11-digit Philippine mobile number starting with 09.';
  }
  if (email && !isValidEmail(email)) {
    return "Enter a valid email address containing '@'.";
  }
  if (!serviceId || (!isValidId(serviceId) && serviceId !== 'General Inquiry')) {
    return 'Select a valid service.';
  }
  if (message.length < 10 || message.length > 2000 || !isSafeText(message)) {
    return 'Message must be safe text between 10 and 2000 characters.';
  }
  return null;
}

export function validateClientPayload(body: Record<string, unknown>): string | null {
  const fullName = cleanText(body.fullName);
  const contactInfo = cleanText(body.contactInfo);
  const notes = cleanText(body.notes);

  if (fullName.length < 2 || fullName.length > 100 || !isSafeText(fullName)) {
    return 'Client name must be 2–100 valid characters.';
  }
  if (contactInfo && !isValidContactInfo(contactInfo)) {
    return 'Provide a valid email address or 7–15 digit phone number.';
  }
  if (notes.length > 500 || !isSafeText(notes)) {
    return 'Notes must be safe text up to 500 characters.';
  }
  return null;
}

export function validateReplyPayload(body: Record<string, unknown>): string | null {
  const text = cleanText(body.responseText ?? body.messageText);
  const hasImage = typeof body.imageDataUrl === 'string' && body.imageDataUrl.length > 0;
  if (hasImage && !text) return null;
  if (text.length < 2 || text.length > 2000 || !isSafeText(text)) {
    return 'Reply must be safe text between 2 and 2000 characters.';
  }
  return null;
}

export function validateReviewPayload(body: Record<string, unknown>): string | null {
  const author = cleanText(body.author);
  const quote = cleanText(body.quote);
  const rating = Number(body.rating ?? 5);

  if (author.length < 2 || author.length > 80 || !isSafeText(author)) {
    return 'Author name must be 2–80 valid characters.';
  }
  if (quote.length < 8 || quote.length > 400 || !isSafeText(quote)) {
    return 'Review must be safe text between 8 and 400 characters.';
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return 'Rating must be between 1 and 5.';
  }
  return null;
}
