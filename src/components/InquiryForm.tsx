import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';
import {
  hasValidationErrors,
  sanitizePhPhone,
  validateInquiryDraft,
} from '../lib/validation';
import type { Inquiry, InquiryDraft, ValidationErrors } from '../types/domain';
import { StatusBadge } from './StatusBadge';

interface InquiryFormProps {
  initialServiceId?: string;
  mode?: 'contact' | 'inquiry';
  existingInquiry?: Inquiry;
  onSubmitted?: (inquiry: Inquiry) => void;
  onCancelEdit?: () => void;
}

function splitContactSnapshot(snapshot: string): { phone: string; email: string } {
  const parts = snapshot.split('·').map((part) => part.trim());
  const phonePart = parts.find((part) => !part.includes('@')) ?? '';
  const emailPart = parts.find((part) => part.includes('@')) ?? '';
  return { phone: sanitizePhPhone(phonePart), email: emailPart };
}

function PhilippinesFlagIcon() {
  return (
    <svg
      viewBox="0 0 28 20"
      className="h-4 w-5 shrink-0 rounded-[3px] border border-[#E5E5E5]"
      aria-hidden="true"
    >
      <rect width="28" height="10" fill="#0038A8" />
      <rect y="10" width="28" height="10" fill="#CE1126" />
      <polygon points="0,0 13,10 0,20" fill="#FFFFFF" />
      <circle cx="4.8" cy="10" r="2" fill="#FCD116" />
      <circle cx="1.9" cy="3.8" r="0.7" fill="#FCD116" />
      <circle cx="1.9" cy="16.2" r="0.7" fill="#FCD116" />
      <circle cx="9.6" cy="10" r="0.7" fill="#FCD116" />
    </svg>
  );
}

export function InquiryForm({
  initialServiceId = '',
  mode = 'inquiry',
  existingInquiry,
  onSubmitted,
  onCancelEdit,
}: InquiryFormProps) {
  const { services, customerSession, createInquiry, updateInquiry } = useAppStore();
  const isContact = mode === 'contact';
  const parsedExistingContact = existingInquiry
    ? splitContactSnapshot(existingInquiry.customerContactSnapshot)
    : { phone: '', email: '' };

  const resolvedInitialService = existingInquiry
    ? existingInquiry.serviceId
    : isContact
      ? 'General Inquiry'
      : services.some((s) => s.id === initialServiceId)
        ? initialServiceId
        : '';

  const [draft, setDraft] = useState<InquiryDraft>({
    customerName: existingInquiry?.customerNameSnapshot ?? customerSession?.fullName ?? '',
    contactInfo: parsedExistingContact.phone,
    email: parsedExistingContact.email || customerSession?.email || '',
    serviceId: resolvedInitialService,
    message: existingInquiry?.message ?? '',
  });
  const [errors, setErrors] = useState<ValidationErrors<InquiryDraft>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedInquiry, setSubmittedInquiry] = useState<Inquiry | null>(null);

  useEffect(() => {
    if (existingInquiry) {
      const nextContact = splitContactSnapshot(existingInquiry.customerContactSnapshot);
      setDraft({
        customerName: existingInquiry.customerNameSnapshot,
        contactInfo: nextContact.phone,
        email: nextContact.email,
        serviceId: existingInquiry.serviceId,
        message: existingInquiry.message,
      });
      return;
    }
    if (isContact) {
      setDraft((prev) => ({ ...prev, serviceId: 'General Inquiry' }));
    } else if (resolvedInitialService) {
      setDraft((prev) => ({ ...prev, serviceId: resolvedInitialService }));
    }
  }, [existingInquiry, isContact, resolvedInitialService]);

  const selectedService = !isContact
    ? services.find((service) => service.id === draft.serviceId)
    : undefined;

  function handleChange<K extends keyof InquiryDraft>(field: K, value: InquiryDraft[K]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (submitError) setSubmitError(null);
  }

  function handlePhoneChange(rawValue: string) {
    const hasNonDigit = /\D/.test(rawValue);
    const digitCount = rawValue.replace(/\D/g, '').length;
    const cleaned = sanitizePhPhone(rawValue);
    setDraft((prev) => ({ ...prev, contactInfo: cleaned }));
    if (submitError) setSubmitError(null);

    if (hasNonDigit) {
      setErrors((prev) => ({
        ...prev,
        contactInfo: 'Numbers only (0–9) — letters and special characters are not allowed.',
      }));
    } else if (digitCount > 11) {
      setErrors((prev) => ({
        ...prev,
        contactInfo: 'Phone number cannot exceed 11 digits.',
      }));
    } else {
      setErrors((prev) => {
        if (!prev.contactInfo) return prev;
        const next = { ...prev };
        delete next.contactInfo;
        return next;
      });
    }
  }

  function handlePhoneBlur() {
    const cleaned = draft.contactInfo.trim();
    if (!cleaned) return;
    if (!/^09\d{9}$/.test(cleaned)) {
      setErrors((prev) => ({
        ...prev,
        contactInfo:
          'Enter a valid 11-digit Philippine mobile number starting with 09 (e.g., 09171234567).',
      }));
    }
  }

  function handleEmailChange(rawValue: string) {
    setDraft((prev) => ({ ...prev, email: rawValue }));
    if (submitError) setSubmitError(null);
    const trimmed = rawValue.trim();
    if (trimmed && !trimmed.includes('@')) {
      setErrors((prev) => ({ ...prev, email: "Email address must include '@'." }));
    } else {
      setErrors((prev) => {
        if (!prev.email) return prev;
        const next = { ...prev };
        delete next.email;
        return next;
      });
    }
  }

  function handleEmailBlur() {
    const trimmed = (draft.email ?? '').trim();
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      setErrors((prev) => ({ ...prev, email: "Email address must include '@'." }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setErrors((prev) => ({ ...prev, email: 'Enter a valid email address (e.g., name@gmail.com).' }));
    }
  }

  function handleMessageBlur() {
    const trimmed = draft.message.trim();
    if (trimmed && trimmed.length < 10) {
      setErrors((prev) => ({
        ...prev,
        message: 'Describe your printing request in at least 10 characters.',
      }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: InquiryDraft = {
      ...draft,
      serviceId: isContact ? 'General Inquiry' : draft.serviceId,
    };

    const validation = validateInquiryDraft(payload, {
      requireService: !isContact,
      requireEmail: isContact,
      requirePhPhone: true,
    });
    if (hasValidationErrors(validation)) {
      setErrors(validation);
      return;
    }

    try {
      const saved = existingInquiry
        ? updateInquiry(existingInquiry.id, payload)
        : createInquiry(payload);
      if (!existingInquiry) {
        setSubmittedInquiry(saved);
      }
      onSubmitted?.(saved);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save inquiry.');
    }
  }

  function handleReset() {
    setSubmittedInquiry(null);
    setDraft({
      customerName: '',
      contactInfo: '',
      email: '',
      serviceId: resolvedInitialService,
      message: '',
    });
    setErrors({});
    setSubmitError(null);
  }

  if (submittedInquiry) {
    const service = services.find((s) => s.id === submittedInquiry.serviceId);
    return (
      <div
        className={
          isContact
            ? 'rounded-[12px] border border-[#EAEAEA] bg-white p-6 sm:p-[1.875rem] shadow-[0_8px_30px_-18px_rgba(0,0,0,0.08)]'
            : 'rounded-xl border border-[#EAEAEA] bg-[var(--surface-soft)] p-5'
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#38BDF8] text-black">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="heading-style-h6">
                {isContact ? 'Message Sent' : 'Inquiry Submitted'}
              </h2>
              <p className="font-mono-code text-xs text-[var(--ink-muted)]">
                {submittedInquiry.referenceCode}
              </p>
            </div>
          </div>
          <StatusBadge status={submittedInquiry.status} />
        </div>

        <dl className="mt-4 space-y-2 border-t border-[var(--line)] pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--ink-muted)]">Client</dt>
            <dd className="font-medium text-black">{submittedInquiry.customerNameSnapshot}</dd>
          </div>
          {service && (
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-muted)]">Service</dt>
              <dd className="font-medium text-black">{service.serviceName}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5">
          <button type="button" onClick={handleReset} className="btn-lime-clean w-full">
            {isContact ? 'Send Another Message' : 'New Inquiry'}
          </button>
        </div>
      </div>
    );
  }

  const inputClass = (hasErr: boolean) =>
    `h-11 w-full rounded-[10px] border bg-[#FEFEFE] px-4 py-2 text-sm text-black placeholder:text-[#9CA3AF] ${
      hasErr ? 'border-[#C8004B]' : 'border-[#DCDCDC]'
    }`;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={
        isContact
          ? 'rounded-[12px] border border-[#EAEAEA] bg-white p-6 sm:p-[1.875rem] shadow-[0_8px_30px_-18px_rgba(0,0,0,0.08)]'
          : 'space-y-5'
      }
    >
      {submitError && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-[#C8004B] bg-[#FFF5F8] px-4 py-2.5 text-sm font-medium text-[#A3003D]"
        >
          {submitError}
        </div>
      )}

      <div className="space-y-5">
        {onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-black cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to chat
          </button>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor={`inquiry-name-${mode}`} className="text-sm font-medium text-[#222222]">
            Full name
          </label>
          <input
            id={`inquiry-name-${mode}`}
            name="customerName"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={draft.customerName}
            onChange={(e) => handleChange('customerName', e.target.value)}
            aria-invalid={Boolean(errors.customerName)}
            placeholder="Your name"
            className={inputClass(Boolean(errors.customerName))}
          />
          {errors.customerName && (
            <p className="text-xs font-medium text-[#A3003D]">{errors.customerName}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`inquiry-phone-${mode}`} className="text-sm font-medium text-[#222222]">
            Phone number
          </label>
          <div
            data-invalid={errors.contactInfo ? 'true' : 'false'}
            className={`ph-phone-field flex h-11 w-full items-center overflow-hidden rounded-[10px] border bg-[#FEFEFE] ${
              errors.contactInfo ? 'border-[#C8004B]' : 'border-[#DCDCDC]'
            }`}
          >
            <div className="flex h-full items-center gap-1.5 border-r border-[#DCDCDC] bg-[#FAFAFA] px-3 text-xs font-medium text-[#444444] shrink-0">
              <PhilippinesFlagIcon />
              <span>PH</span>
            </div>
            <input
              id={`inquiry-phone-${mode}`}
              name="contactInfo"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={24}
              value={draft.contactInfo}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={handlePhoneBlur}
              aria-invalid={Boolean(errors.contactInfo)}
              placeholder="Your phone number"
              className="h-full min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm text-black placeholder:text-[#9CA3AF] tabular-nums focus:outline-none"
            />
          </div>
          {errors.contactInfo && (
            <p className="text-xs font-medium text-[#A3003D]">{errors.contactInfo}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`inquiry-email-${mode}`} className="text-sm font-medium text-[#222222]">
            Email Address
          </label>
          <input
            id={`inquiry-email-${mode}`}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={120}
            value={draft.email ?? ''}
            onChange={(e) => handleEmailChange(e.target.value)}
            onBlur={handleEmailBlur}
            aria-invalid={Boolean(errors.email)}
            placeholder="Your email"
            className={inputClass(Boolean(errors.email))}
          />
          {errors.email && (
            <p className="text-xs font-medium text-[#A3003D]">{errors.email}</p>
          )}
        </div>

        {!isContact && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`inquiry-service-${mode}`}
              className="text-sm font-medium text-[#222222]"
            >
              Service of Interest
            </label>
            <select
              id={`inquiry-service-${mode}`}
              name="serviceId"
              value={draft.serviceId}
              onChange={(e) => handleChange('serviceId', e.target.value)}
              aria-invalid={Boolean(errors.serviceId)}
              className={inputClass(Boolean(errors.serviceId))}
            >
              <option value="">Select a service...</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.serviceName} ({service.pricePhp})
                </option>
              ))}
            </select>
            {errors.serviceId && (
              <p className="text-xs font-medium text-[#A3003D]">{errors.serviceId}</p>
            )}
            {selectedService && !errors.serviceId && (
              <p className="text-xs text-[var(--ink-muted)] tabular-nums">
                {selectedService.pricePhp} · {selectedService.reservationFeePhp}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`inquiry-message-${mode}`}
            className="text-sm font-medium text-[#222222]"
          >
            Leave Us a Message
          </label>
          <textarea
            id={`inquiry-message-${mode}`}
            name="message"
            rows={4}
            maxLength={2000}
            value={draft.message}
            onChange={(e) => handleChange('message', e.target.value)}
            onBlur={handleMessageBlur}
            aria-invalid={Boolean(errors.message)}
            placeholder="Write Your Message here..."
            className={`h-[7.5rem] w-full rounded-[10px] border bg-[#FEFEFE] px-4 py-3 text-sm leading-6 text-black placeholder:text-[#9CA3AF] ${
              errors.message ? 'border-[#C8004B]' : 'border-[#DCDCDC]'
            }`}
          />
          {errors.message && (
            <p className="text-xs font-medium text-[#A3003D]">{errors.message}</p>
          )}
        </div>

        <div className="pt-1">
          <button type="submit" className="btn-lime-clean w-full">
            {existingInquiry ? 'Save changes' : isContact ? 'Send message' : 'Send inquiry'}
          </button>
        </div>
      </div>
    </form>
  );
}
