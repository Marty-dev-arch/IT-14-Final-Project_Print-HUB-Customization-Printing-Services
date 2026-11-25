import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';

export function SignInPromptCard() {
  const { signInPromptOpen, closeSignInPrompt } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!signInPromptOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSignInPrompt();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [signInPromptOpen, closeSignInPrompt]);

  if (!signInPromptOpen) return null;

  const card = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-end p-4 sm:p-6 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to RJ Print HUB with Google"
    >
      <div
        className="fixed inset-0 bg-black/35 modal-backdrop-enter pointer-events-auto"
        onClick={closeSignInPrompt}
        aria-hidden="true"
      />
      <div className="relative z-10 mt-14 w-full max-w-[22.5rem] overflow-hidden rounded-2xl border border-[#2C2C2C] bg-[#1F1F1F] text-white shadow-2xl modal-drawer-enter pointer-events-auto">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.5 12.27c0-.82-.07-1.61-.21-2.37H12v4.49h6.45a5.51 5.51 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.57-5.15 3.57-8.75z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.27v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l4-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.63l4 3.1C6.22 6.88 8.87 4.77 12 4.77z"
              />
            </svg>
            <p className="truncate text-[13px] font-medium text-white/90">
              Sign in to RJ Print HUB with Google
            </p>
          </div>
          <button
            type="button"
            onClick={closeSignInPrompt}
            aria-label="Close sign-in prompt"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-3">
            <img
              src="/rj-logo-mark.jpg"
              alt="RJ Print HUB"
              className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">RJ Print HUB Account</p>
              <p className="text-xs leading-relaxed text-white/75">
                Sign in to customize services, view details, save favorites, and chat.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              closeSignInPrompt();
              navigate('/login');
            }}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-full bg-[#3898EC] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2384db] cursor-pointer"
          >
            Continue to Sign In
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(card, document.body);
  }
  return card;
}
