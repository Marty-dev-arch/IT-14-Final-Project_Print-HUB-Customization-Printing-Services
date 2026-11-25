import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

const PIN_SLOTS = [0, 1, 2, 3, 4, 5] as const;

export function LoginPage() {
  const { stage, loading, loginWithPin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!loading && stage === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  const joinedPin = digits.join('');

  async function submitPin(pinValue: string) {
    if (submitting) return;
    if (pinValue.length !== 6) {
      setError('Enter all 6 digits of your security PIN.');
      const firstEmpty = digits.findIndex((d) => d === '');
      inputRefs.current[firstEmpty >= 0 ? firstEmpty : 0]?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const next = await loginWithPin(pinValue);
      if (next === 'authenticated') {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify PIN.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitPin(joinedPin);
  }

  function handleDigitChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const next = [...digits];
    const chars = clean.slice(0, 6 - index).split('');
    chars.forEach((ch, offset) => {
      if (index + offset < 6) next[index + offset] = ch;
    });
    setDigits(next);
    setError(null);

    const nextFocus = Math.min(5, index + chars.length);
    inputRefs.current[nextFocus]?.focus();

    const completed = next.join('');
    if (completed.length === 6) {
      void submitPin(completed);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = PIN_SLOTS.map((i) => pasted[i] ?? '');
    setDigits(next);
    setError(null);
    inputRefs.current[Math.min(5, pasted.length - 1)]?.focus();
    if (pasted.length === 6) {
      void submitPin(pasted);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-[430px] rounded-[24px] border border-[#EAEAEA] bg-white p-9 sm:p-11 shadow-[0px_4px_25px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[30px] sm:text-[32px] font-bold leading-tight tracking-tight text-[#0F172A]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Let&apos;s pick up where you left off
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-9 space-y-7">
          <div>
            <p className="text-center text-xs font-semibold tracking-tight text-[#0F172A]">
              Enter your 6-digit security PIN
            </p>

            <div
              className="mt-3.5 flex items-center justify-center gap-2.5"
              role="group"
              aria-label="6-digit security PIN"
            >
              {PIN_SLOTS.map((slot) => {
                const filled = digits[slot] !== '';
                return (
                  <input
                    key={slot}
                    ref={(el) => {
                      inputRefs.current[slot] = el;
                    }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    autoFocus={slot === 0}
                    autoComplete="one-time-code"
                    aria-label={`PIN digit ${slot + 1}`}
                    value={digits[slot]}
                    onChange={(e) => handleDigitChange(slot, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(slot, e)}
                    onPaste={handlePaste}
                    className={`font-mono-code h-12 w-11 sm:h-13 sm:w-12 rounded-xl border text-center text-lg font-bold transition-colors ${
                      error
                        ? 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]'
                        : filled
                          ? 'border-[#0F172A] bg-white text-[#0F172A]'
                          : 'border-[#E2E8F0] bg-white text-[#0F172A] focus:border-[#0F172A]'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-center text-xs font-medium text-[#DC2626]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#0A0A0A] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Authorizing...' : 'Authorize & Enter'}
          </button>

          {(stage === 'pin_required' || stage === 'mfa_required') && (
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full text-center text-xs font-medium text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              Reset pending session
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
