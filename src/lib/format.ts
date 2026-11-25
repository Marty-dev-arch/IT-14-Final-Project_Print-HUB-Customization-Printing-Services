import type { InquiryStatus } from '../types/domain';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return DATE_TIME_FORMATTER.format(date);
}

export interface StatusMeta {
  label: InquiryStatus;
  badgeClass: string;
  dotClass: string;
  description: string;
}

export const STATUS_META: Readonly<Record<InquiryStatus, StatusMeta>> = {
  Pending: {
    label: 'Pending',
    badgeClass: 'bg-[#FFF7DC] text-[#7A5400] border-[#F2C94C]',
    dotClass: 'bg-[#FFC928]',
    description: 'Awaiting administrator review and response.',
  },
  Answered: {
    label: 'Answered',
    badgeClass: 'bg-[#E5F7FD] text-[#005B82] border-[#8ADBF8]',
    dotClass: 'bg-[#00AEEF]',
    description: 'Administrator reply has been saved.',
  },
  Completed: {
    label: 'Completed',
    badgeClass: 'bg-[#E8F6EE] text-[#175B38] border-[#9CD7B5]',
    dotClass: 'bg-[#1D7F4B]',
    description: 'Inquiry finalized and closed.',
  },
};

export function createReferenceCode(existingCodes: readonly string[]): string {
  const year = new Date().getFullYear();
  let maxNumber = 0;
  const prefix = `RJH-${year}-`;
  for (const code of existingCodes) {
    if (code.startsWith(prefix)) {
      const parsed = Number.parseInt(code.slice(prefix.length), 10);
      if (Number.isFinite(parsed) && parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }
  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
}
