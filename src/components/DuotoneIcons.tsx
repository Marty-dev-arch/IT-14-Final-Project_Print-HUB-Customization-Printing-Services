import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Notifications bell duotone icon */
export function DuotoneBellIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M12 3a1.5 1.5 0 0 1 1.5 1.5v.3A5.5 5.5 0 0 1 17.5 10v3.8l1.4 2.1a.8.8 0 0 1-.66 1.25H5.76a.8.8 0 0 1-.66-1.25L6.5 13.8V10a5.5 5.5 0 0 1 4-5.2v-.3A1.5 1.5 0 0 1 12 3Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path d="M9.8 19.6a2.4 2.4 0 0 0 4.4 0" />
    </svg>
  );
}

/** Favorites heart duotone icon */
export function DuotoneHeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path
        d="M12 20.4s-7.5-4.7-9.2-9.2C1.6 8.1 3.7 4.8 7.1 4.5c2-.2 3.8.8 4.9 2.4 1.1-1.6 2.9-2.6 4.9-2.4 3.4.3 5.5 3.6 4.3 6.7-1.7 4.5-9.2 9.2-9.2 9.2Z"
        fill="currentColor"
        fillOpacity={filled ? 1 : 0.16}
      />
    </svg>
  );
}
