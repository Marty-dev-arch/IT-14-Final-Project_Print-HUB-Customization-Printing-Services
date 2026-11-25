import { STATUS_META } from '../lib/format';
import type { InquiryStatus } from '../types/domain';

interface StatusBadgeProps {
  status: InquiryStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
