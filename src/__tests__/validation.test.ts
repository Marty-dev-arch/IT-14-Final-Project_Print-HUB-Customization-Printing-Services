import { describe, expect, it } from 'vitest';
import {
  hasValidationErrors,
  isValidPhPhone,
  sanitizePhPhone,
  validateClientDraft,
  validateInquiryDraft,
  validateReplyText,
  validateStrongPassword,
} from '../lib/validation';

describe('validation', () => {
  it('rejects empty, invalid contact, and overly short inquiry inputs', () => {
    const errors = validateInquiryDraft({
      customerName: ' ',
      contactInfo: 'abc',
      serviceId: 'unknown-service',
      message: 'short',
    });

    expect(hasValidationErrors(errors)).toBe(true);
    expect(errors.customerName).toBeDefined();
    expect(errors.contactInfo).toBeDefined();
    expect(errors.serviceId).toBeDefined();
    expect(errors.message).toBeDefined();
  });

  it('accepts valid email or phone contact for inquiries', () => {
    const emailValid = validateInquiryDraft({
      customerName: 'Clarisse Mendoza',
      contactInfo: 'clarisse@example.com',
      serviceId: 'lamination',
      message: 'Need matte A4 lamination for 25 certificates.',
    });
    const phoneValid = validateInquiryDraft({
      customerName: 'Marco Villanueva',
      contactInfo: '+63 917 555 0148',
      serviceId: 'mug-customization',
      message: 'Looking for 15 custom white ceramic mugs.',
    });

    expect(hasValidationErrors(emailValid)).toBe(false);
    expect(hasValidationErrors(phoneValid)).toBe(false);
  });

  it('rejects overlong messages and empty replies or client fields', () => {
    const overlong = validateInquiryDraft({
      customerName: 'Test User',
      contactInfo: 'test@example.com',
      serviceId: 'document-printing',
      message: 'x'.repeat(2001),
    });
    expect(overlong.message).toBeDefined();

    expect(validateReplyText(' ')).toBeDefined();
    expect(validateReplyText(' ', true)).toBeUndefined();
    expect(validateReplyText('Confirmed, ready for proof check.')).toBeUndefined();

    expect(validateStrongPassword('weak')).toBeDefined();
    expect(validateStrongPassword('missingnumber@')).toBeDefined();
    expect(validateStrongPassword('missingSpecial1')).toBeDefined();
    expect(validateStrongPassword('Owner@2026')).toBeUndefined();

    const badClient = validateClientDraft({
      fullName: 'A',
      contactInfo: '123',
      notes: '',
    });
    expect(badClient.fullName).toBeDefined();
    expect(badClient.contactInfo).toBeDefined();
  });

  it('validates and sanitizes strictly 11-digit Philippine mobile numbers and Contact General Inquiry payloads', () => {
    expect(sanitizePhPhone('+63 0917-123-456789')).toBe('63091712345');
    expect(sanitizePhPhone('0917-123-4567')).toBe('09171234567');
    expect(isValidPhPhone('09171234567')).toBe(true);
    expect(isValidPhPhone('0917123')).toBe(false);
    expect(isValidPhPhone('08171234567')).toBe(false);
    expect(isValidPhPhone('091712345678')).toBe(false);

    const badContact = validateInquiryDraft(
      {
        customerName: 'Clarisse Mendoza',
        contactInfo: '0917123',
        email: '',
        serviceId: 'General Inquiry',
        message: 'Inquiry about event packages in Mawab.',
      },
      { requireService: false, requireEmail: true, requirePhPhone: true },
    );
    expect(hasValidationErrors(badContact)).toBe(true);
    expect(badContact.contactInfo).toMatch(/11-digit Philippine mobile number/i);
    expect(badContact.email).toBeDefined();
    expect(badContact.serviceId).toBeUndefined();

    const validContact = validateInquiryDraft(
      {
        customerName: 'Clarisse Mendoza',
        contactInfo: '09171234567',
        email: 'clarisse@example.com',
        serviceId: 'General Inquiry',
        message: 'Inquiry about event packages in Mawab.',
      },
      { requireService: false, requireEmail: true, requirePhPhone: true },
    );
    expect(hasValidationErrors(validContact)).toBe(false);
  });
});
