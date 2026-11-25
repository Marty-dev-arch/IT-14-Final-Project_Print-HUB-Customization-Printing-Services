import { User } from 'lucide-react';

interface ProfileAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  showOnline?: boolean;
}

const SIZE_CLASSES = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-16 w-16 text-2xl',
  lg: 'h-20 w-20 text-3xl',
} as const;

export function ProfileAvatar({
  name,
  avatarUrl,
  size = 'sm',
  showOnline = false,
}: ProfileAvatarProps) {
  const initial = name?.trim().charAt(0).toUpperCase();

  return (
    <span className={`relative inline-flex shrink-0 ${SIZE_CLASSES[size]}`}>
      <span
        className={`inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full ${
          avatarUrl
            ? 'border border-[var(--line)] bg-[var(--surface-soft)]'
            : name
              ? 'bg-[#2C3A47] font-semibold text-white'
              : 'border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink-strong)]'
        }`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name ?? 'User avatar'} className="h-full w-full object-cover" />
        ) : initial ? (
          <span>{initial}</span>
        ) : (
          <User className={size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
        )}
      </span>
      {showOnline && (
        <span
          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#FEFEFE] bg-[#22C55E]"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
