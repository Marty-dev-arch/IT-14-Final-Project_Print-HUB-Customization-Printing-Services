import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Dashboard Home duotone icon */
export function DuotoneHomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M4 10.5 12 4l8 6.5V19a1.8 1.8 0 0 1-1.8 1.8H14.5v-5.2a2.5 2.5 0 0 0-5 0v5.2H5.8A1.8 1.8 0 0 1 4 19v-8.5Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path d="M9.5 20.8v-5.2a2.5 2.5 0 0 1 5 0v5.2" />
    </svg>
  );
}

/** Message Management speech bubble with 3 dots duotone icon */
export function DuotoneMessageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v7.4A2.8 2.8 0 0 1 17.2 17H9l-4.2 3.2A.5.5 0 0 1 4 19.8V6.8Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <circle cx="8.8" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.2" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Custom Client Records two-person duotone icon */
export function DuotoneClientsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9.5" cy="8" r="3.4" fill="currentColor" fillOpacity={0.16} />
      <path
        d="M3.5 19.5c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path d="M16.5 5.6a2.7 2.7 0 0 1 0 5.2" />
      <path d="M18.2 14.8c2 .6 3.3 2.1 3.3 4.7" />
    </svg>
  );
}

/** Logs scalloped receipt duotone icon */
export function DuotoneReceiptIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M5 4.8A1.8 1.8 0 0 1 6.8 3h10.4A1.8 1.8 0 0 1 19 4.8V20.2c0 .6-.7.9-1.2.5l-1.5-1.2a1 1 0 0 0-1.3 0l-1.5 1.2a1 1 0 0 1-1.3 0l-1.5-1.2a1 1 0 0 0-1.3 0l-1.5 1.2a1 1 0 0 1-1.3 0l-1.5-1.2c-.5-.4-1.1-.1-1.1.5V4.8Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path d="M8.5 8.5h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h4.2" />
    </svg>
  );
}
