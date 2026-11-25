import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface StudioModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleNode?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
  variant?: 'drawer' | 'dialog';
  ariaLabel?: string;
}

export function StudioModal({
  open,
  onClose,
  title,
  titleNode,
  children,
  footer,
  widthClass,
  variant = 'drawer',
  ariaLabel,
}: StudioModalProps) {
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const isDrawer = variant === 'drawer';

  const modalNode = (
    <div
      className={`fixed inset-0 z-[70] ${isDrawer ? '' : 'flex items-center justify-center p-4'}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : headingId}
    >
      <div
        className="fixed inset-0 bg-black/40 modal-backdrop-enter"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={
          isDrawer
            ? `fixed inset-y-0 right-0 z-10 flex h-full w-full ${widthClass ?? 'max-w-[28rem]'} flex-col bg-white shadow-2xl modal-drawer-enter`
            : `relative z-10 flex max-h-[calc(100vh-3rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl page-enter`
        }
      >
        <div className="flex items-center justify-between gap-4 border-b border-[#EAEAEA] px-6 py-5">
          {titleNode ?? (
            <h2
              id={headingId}
              className="text-2xl font-semibold tracking-[-0.02em] text-black"
            >
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFEFEF] text-black transition-colors hover:bg-[#E2E2E2] cursor-pointer"
          >
            <X className="h-4 w-4 stroke-[2.2]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-[#EAEAEA] bg-white px-6 py-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
}
