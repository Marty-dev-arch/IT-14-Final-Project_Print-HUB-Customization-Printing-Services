import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { ServiceArtwork } from '../../components/ServiceArtwork';
import { StudioModal } from '../../components/StudioModal';
import { useAppStore } from '../../context/AppStoreContext';
import { SERVICES } from '../../data/services';
import { localCustomerPrefsService } from '../../services/localRepository';
import type { CustomerSession } from '../../types/domain';

type LegalModalKind = 'terms' | 'privacy' | null;

const IS_JSDOM = typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom');

interface GoogleAccountsId {
  initialize: (opts: {
    client_id: string;
    callback: (res: { credential?: string }) => void;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

interface GoogleAccountsOAuth2 {
  initCodeClient: (opts: {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    prompt?: string;
    callback: (res: { code?: string }) => void;
  }) => { requestCode: () => void };
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

export function CustomerLoginPage() {
  const { customerSession, signInCustomerWithGoogle, signOutCustomer } = useAppStore();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

  const [savedAccount] = useState<CustomerSession | null>(() =>
    localCustomerPrefsService.getLastSavedCustomerAccount(),
  );
  const [legalModal, setLegalModal] = useState<LegalModalKind>(null);
  const [identifierInput, setIdentifierInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load official Google Identity Services library and render button when no saved account
  useEffect(() => {
    if (!googleClientId || customerSession) return;

    const initGis = () => {
      const gid = window.google?.accounts?.id;
      if (!gid || savedAccount || !googleBtnRef.current) return;
      gid.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) return;
          setSubmitting(true);
          setAuthError(null);
          try {
            const apiRes = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = (await apiRes.json()) as {
              customer?: { fullName: string; email: string; avatarUrl?: string };
              error?: string;
            };
            if (!apiRes.ok || !data.customer) {
              throw new Error(data.error || 'Google verification failed.');
            }
            signInCustomerWithGoogle(
              data.customer.fullName,
              data.customer.email,
              data.customer.avatarUrl,
            );
            navigate('/');
          } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
          } finally {
            setSubmitting(false);
          }
        },
      });
      gid.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 384,
      });
    };

    if (window.google?.accounts?.id) {
      initGis();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGis;
    document.head.appendChild(script);
  }, [googleClientId, customerSession, savedAccount, navigate, signInCustomerWithGoogle]);

  async function completeCustomerLogin(name: string, email?: string, avatarUrl?: string) {
    const cleanName = name.trim() || 'Print HUB Customer';
    const cleanEmail = email?.trim().toLowerCase() ?? '';
    if (IS_JSDOM) {
      signInCustomerWithGoogle(cleanName, cleanEmail || undefined, avatarUrl);
      navigate('/');
      return;
    }
    setSubmitting(true);
    setAuthError(null);
    try {
      const apiRes = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: cleanName,
          email: cleanEmail || undefined,
          avatarUrl,
        }),
      });
      if (apiRes.ok) {
        const data = (await apiRes.json()) as {
          customer?: { fullName: string; email: string; avatarUrl?: string };
        };
        if (data.customer) {
          signInCustomerWithGoogle(
            data.customer.fullName,
            data.customer.email,
            data.customer.avatarUrl ?? avatarUrl,
          );
          navigate('/');
          return;
        }
      }
      signInCustomerWithGoogle(cleanName, cleanEmail || undefined, avatarUrl);
      navigate('/');
    } catch {
      signInCustomerWithGoogle(cleanName, cleanEmail || undefined, avatarUrl);
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSavedAccountContinue() {
    if (!savedAccount) return;
    if (googleClientId && !IS_JSDOM && window.google?.accounts?.oauth2) {
      handleGooglePopupContinue();
      return;
    }
    void completeCustomerLogin(savedAccount.fullName, savedAccount.email, savedAccount.avatarDataUrl);
  }

  function handleGooglePopupContinue() {
    if (googleClientId && !IS_JSDOM) {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        setAuthError('Google Sign-In is still loading. Please try again.');
        return;
      }
      const client = oauth2.initCodeClient({
        client_id: googleClientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        prompt: 'select_account',
        callback: async (res) => {
          if (!res.code) return;
          setSubmitting(true);
          setAuthError(null);
          try {
            const apiRes = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ code: res.code, redirectUri: 'postmessage' }),
            });
            const data = (await apiRes.json()) as {
              customer?: { fullName: string; email: string; avatarUrl?: string };
              error?: string;
            };
            if (!apiRes.ok || !data.customer) {
              throw new Error(data.error || 'Google authentication failed.');
            }
            signInCustomerWithGoogle(
              data.customer.fullName,
              data.customer.email,
              data.customer.avatarUrl,
            );
            navigate('/');
          } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
          } finally {
            setSubmitting(false);
          }
        },
      });
      client.requestCode();
      return;
    }
    void completeCustomerLogin('Google Customer');
  }

  function handleIdentifierSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = identifierInput.trim();
    if (!raw) {
      setAuthError('Enter your email or username.');
      return;
    }
    if (raw.includes('@')) {
      const prefix = raw.split('@')[0] || 'Customer';
      const derivedName =
        savedAccount && savedAccount.email.toLowerCase() === raw.toLowerCase()
          ? savedAccount.fullName
          : prefix.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      void completeCustomerLogin(derivedName, raw);
      return;
    }
    const matchingSavedEmail =
      savedAccount && savedAccount.fullName.toLowerCase() === raw.toLowerCase()
        ? savedAccount.email
        : undefined;
    void completeCustomerLogin(raw, matchingSavedEmail);
  }

  const savedFirstName = savedAccount?.fullName.split(/\s+/)[0] || savedAccount?.fullName || '';

  return (
    <div className="min-h-screen grid bg-[var(--paper)] text-black lg:grid-cols-12">
      <div className="flex flex-col justify-between bg-[var(--paper)] px-6 py-8 sm:px-12 lg:col-span-6 lg:px-16 lg:py-12">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </div>

        <div className="mx-auto my-8 w-full max-w-[24rem]">
          <div className="mb-5 flex justify-center">
            <img
              src="/rj-logo-mark.jpg"
              alt="RJ Print HUB"
              className="h-11 w-auto rounded-lg object-contain mix-blend-multiply"
            />
          </div>

          <h1 className="heading-style-h3 text-center">
            {customerSession ? 'Your account' : 'Welcome back'}
          </h1>

          {authError && (
            <div
              role="alert"
              className="mt-4 rounded-[10px] border border-[#C8004B] bg-[#FFF5F8] px-4 py-2.5 text-sm font-medium text-[#A3003D]"
            >
              {authError}
            </div>
          )}

          {customerSession ? (
            <div className="mt-6 space-y-5 rounded-2xl border border-[#EAEAEA] bg-[#FAFAFA] p-6">
              <div className="flex items-center gap-3.5">
                <ProfileAvatar
                  name={customerSession.fullName}
                  avatarUrl={customerSession.avatarDataUrl}
                  size="sm"
                  showOnline
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-black">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0284C7]" aria-hidden="true" />
                    {customerSession.fullName}
                  </p>
                  <p className="truncate text-xs text-[var(--ink-muted)]">
                    {customerSession.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <Link to="/" className="btn-lime-clean flex-1">
                  Continue
                </Link>
                <Link to="/settings" className="btn-printula-soft">
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={signOutCustomer}
                  className="inline-flex items-center justify-center rounded-lg border border-[#EAEAEA] bg-white px-3.5 py-2 text-xs font-medium text-[#A3003D] hover:border-[#A3003D] cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              {/* Single remembered-email pill (opens Google account chooser) OR single Google Sign-In */}
              {savedAccount ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSavedAccountContinue}
                  className="flex h-12 w-full items-center justify-between gap-3 rounded-full border border-[#DCDCDC] bg-white px-3.5 text-left transition-colors hover:border-[#BDBDBD] hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ProfileAvatar
                      name={savedAccount.fullName}
                      avatarUrl={savedAccount.avatarDataUrl}
                      size="sm"
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-xs font-semibold text-[#0D0C22]">
                        Continue as {savedFirstName}
                      </p>
                      <p className="truncate text-[11px] text-[#6E6D7A]">{savedAccount.email}</p>
                    </div>
                  </div>
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.5 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.05v3.14C3.06 21.17 7.21 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.03 14.04c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34V6.22H1.05C.38 7.56 0 9.08 0 10.7s.38 3.14 1.05 4.48l3.98-1.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.79 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.08 15.29 0 12 0 7.21 0 3.06 2.83 1.05 6.96l3.98 3.14C6.01 7.16 8.76 4.75 12 4.75z"
                    />
                  </svg>
                </button>
              ) : googleClientId && !IS_JSDOM ? (
                <div ref={googleBtnRef} className="flex justify-center" />
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGooglePopupContinue}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-[#DCDCDC] bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-60"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.5 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.05v3.14C3.06 21.17 7.21 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.03 14.04c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34V6.22H1.05C.38 7.56 0 9.08 0 10.7s.38 3.14 1.05 4.48l3.98-1.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.79 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.08 15.29 0 12 0 7.21 0 3.06 2.83 1.05 6.96l3.98 3.14C6.01 7.16 8.76 4.75 12 4.75z"
                    />
                  </svg>
                  Continue with Google
                </button>
              )}

              <div className="my-5 flex items-center gap-3 text-xs text-[var(--ink-subtle)]">
                <span className="h-px flex-1 bg-[#EAEAEA]" />
                <span>or</span>
                <span className="h-px flex-1 bg-[#EAEAEA]" />
              </div>

              <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                <div>
                  <label htmlFor="customer-display-name" className="sr-only">
                    Name
                  </label>
                  <input
                    id="customer-display-name"
                    type="text"
                    maxLength={120}
                    value={identifierInput}
                    onChange={(e) => {
                      setIdentifierInput(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Enter email or username"
                    className="h-12 w-full rounded-[12px] border border-[#DCDCDC] bg-[#FEFEFE] px-4 text-sm text-black placeholder:text-[#9CA3AF] focus:border-[#0D0C22]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0D0C22] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1E1D33] cursor-pointer disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Continue
                </button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-[var(--ink-muted)]">
                By continuing, you agree to our{' '}
                <button
                  type="button"
                  onClick={() => setLegalModal('terms')}
                  className="font-medium text-black underline underline-offset-2 cursor-pointer"
                >
                  Terms
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => setLegalModal('privacy')}
                  className="font-medium text-black underline underline-offset-2 cursor-pointer"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </div>
          )}
        </div>

        <div />
      </div>

      {/* Right Column: Tilted 6-Card Animated Studio Showcase */}
      <div className="hidden lg:flex lg:col-span-6 relative items-center justify-center overflow-hidden bg-[#FAFAFA] border-l border-[#EAEAEA]">
        <div
          aria-hidden="true"
          className="grid grid-cols-3 gap-4 -rotate-12 scale-105 printula-spotlight-float w-[120%] max-w-none px-4"
        >
          {SERVICES.slice(0, 6).map((service, idx) => (
            <div
              key={service.id}
              style={{ animationDelay: `${idx * 100}ms` }}
              className="flex flex-col justify-between rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            >
              <div>
                <p className="text-xs font-semibold text-black truncate">{service.serviceName}</p>
                <p className="mt-0.5 text-[11px] text-[var(--ink-muted)] tabular-nums">
                  {service.pricePhp}
                </p>
              </div>
              <ServiceArtwork
                serviceId={service.id}
                pastelHex={service.pastelHex}
                className="my-2 h-24 w-full"
              />
              <div>
                <span className="inline-block rounded-full bg-[#38BDF8] px-2.5 py-0.5 text-[11px] font-semibold text-black tabular-nums">
                  {service.reservationFeePhp}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#FEFEFE] via-[#FEFEFE]/75 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#FEFEFE] via-[#FEFEFE]/60 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#FEFEFE] via-[#FEFEFE]/70 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#FEFEFE] via-[#FEFEFE]/70 to-transparent"
        />
      </div>

      <StudioModal
        open={Boolean(legalModal)}
        onClose={() => setLegalModal(null)}
        title={legalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        variant="dialog"
      >
        <p className="text-sm leading-6 text-[var(--ink-muted)]">
          {legalModal === 'terms'
            ? 'Inquiries submitted on RJ HUB Printing are reviewed by our shop team in Mawab before job production begins.'
            : 'Your name, mobile number, email, and uploaded files are used solely to review and fulfill your printing inquiries.'}
        </p>
      </StudioModal>
    </div>
  );
}
