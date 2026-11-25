interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: { img: 'h-7 w-auto', text: 'text-base' },
  md: { img: 'h-9 w-auto', text: 'text-lg' },
  lg: { img: 'h-11 sm:h-12 w-auto', text: 'text-xl sm:text-2xl' },
} as const;

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const styles = SIZE_MAP[size];

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      <img
        src="/rj-logo-mark.jpg"
        alt=""
        aria-hidden="true"
        className={`${styles.img} object-contain mix-blend-multiply`}
      />
      <span className={`${styles.text} leading-none tracking-[-0.025em] text-black whitespace-nowrap`}>
        <span className="font-semibold">Print</span>{' '}
        <span className="font-bold">HUB</span>
      </span>
    </span>
  );
}
