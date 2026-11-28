import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Mail, MapPin, Menu, Minus, Phone, Plus, Trash2, X } from 'lucide-react';
import { DuotoneHeartIcon } from './DuotoneIcons';
import { useAppStore } from '../context/AppStoreContext';
import { PENDING_OWNER_VERIFICATION_TEXT, SHOP_LOCATION } from '../data/services';
import { renderMockupSnapshot } from '../lib/mockupCanvas';
import { BrandLogo } from './BrandLogo';
import { InquiryChatWidget } from './InquiryChatWidget';
import { ProfileAvatar } from './ProfileAvatar';
import { SignInPromptCard } from './SignInPromptCard';
import { StudioModal } from './StudioModal';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
] as const;

export function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.scrollTo === 'function' &&
      !navigator.userAgent?.includes('jsdom')
    ) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.key]);
  const {
    services,
    favoriteServiceIds,
    favoriteQuantities,
    toggleFavoriteService,
    setFavoriteQuantity,
    customerSession,
    session,
    signOutCustomer,
    signOut,
    openInquiryChat,
    isAuthenticated,
    openSignInPrompt,
  } = useAppStore();

  const favoriteServices = services.filter((service) => favoriteServiceIds.includes(service.id));
  const totalFavoriteQty = favoriteServices.reduce(
    (sum, item) => sum + (favoriteQuantities[item.id] ?? 1),
    0,
  );

  const handleStartFavoritesChat = async () => {
    const primary = favoriteServices.find((s) => Boolean(s.imageSrc)) ?? favoriteServices[0];
    if (!primary) return;

    const lines = favoriteServices.map((item) => {
      const qty = favoriteQuantities[item.id] ?? 1;
      return `• ${item.serviceName} × ${qty} (${item.pricePhp})`;
    });
    const text = `Favorites Inquiry (${totalFavoriteQty} ${totalFavoriteQty === 1 ? 'pc' : 'pcs'}):\n${lines.join('\n')}`;

    const imageDataUrl =
      primary.imageSrc ??
      (await renderMockupSnapshot({
        serviceName: primary.serviceName,
        sizeLabel: `${favoriteQuantities[primary.id] ?? 1} pcs`,
        summaryLine: `${primary.pricePhp} · ${primary.reservationFeePhp}`,
      }));

    setFavoritesOpen(false);
    openInquiryChat(primary.id, {
      text,
      imageDataUrl,
      quantity: totalFavoriteQty,
      serviceNames: favoriteServices.map((s) => s.serviceName),
    });
  };
  const isSignedIn = Boolean(customerSession || session);
  const activeName = customerSession?.fullName ?? session?.admin.displayName;
  const activeEmail = customerSession?.email ?? session?.admin.email ?? '';
  const activeAvatar = customerSession?.avatarDataUrl ?? session?.admin.avatarDataUrl;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--paper)] text-[var(--ink)]">
      <header className="printula-header-enter sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/95 backdrop-blur-sm">
        <div className="relative mx-auto flex max-w-[75rem] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          {/* Left: Clean RJ Print HUB Logo Only */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center rounded-md" aria-label="RJ Print HUB Home">
              <BrandLogo size="lg" />
            </Link>
          </div>

          {/* Center: Printula 5-link Nav with hover underline */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-9">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `nav-link-printula text-base font-medium transition-colors ${isActive ? 'text-black font-semibold' : 'text-[#151515] hover:text-black'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right: Heart Favorites Drawer + Hover/Click Profile Menu (Sign In / Settings / Sign Out) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  setProfileMenuOpen(false);
                  openSignInPrompt();
                  return;
                }
                setFavoritesOpen((prev) => !prev);
                setProfileMenuOpen(false);
              }}
              aria-expanded={favoritesOpen}
              aria-label={`Favorite services (${favoriteServices.length})`}
              title="Favorite Services"
              className={`relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] border transition-colors cursor-pointer ${favoritesOpen
                ? 'border-transparent bg-[#38BDF8] text-black'
                : 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink-strong)] hover:border-transparent hover:bg-[#38BDF8]'
                }`}
            >
              <DuotoneHeartIcon
                filled={favoriteServices.length > 0}
                className={`h-5 w-5 ${favoriteServices.length > 0 ? 'text-black' : ''}`}
                aria-hidden="true"
              />
              {favoriteServices.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-white bg-[#38BDF8] px-1 text-[11px] font-bold leading-none text-black tabular-nums">
                  {favoriteServices.length}
                </span>
              )}
            </button>

            {/* Hover + Click Profile Avatar Trigger & Menu Card */}
            <div
              className="relative"
              onMouseEnter={() => {
                setProfileMenuOpen(true);
                setFavoritesOpen(false);
              }}
              onMouseLeave={() => setProfileMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev);
                  setFavoritesOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                aria-label="Open profile"
                title="Open profile"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
              >
                <ProfileAvatar
                  name={isSignedIn ? activeName : undefined}
                  avatarUrl={activeAvatar}
                  size="sm"
                  showOnline={isSignedIn}
                />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-full z-50 pt-2">
                  <div
                    role="menu"
                    aria-label="Profile menu"
                    className="dropdown-glide-enter w-64 rounded-2xl border border-[var(--line)] bg-[#FEFEFE] p-5 press-shadow"
                  >
                    <div className="flex flex-col items-center text-center">
                      <ProfileAvatar
                        name={isSignedIn ? activeName : undefined}
                        avatarUrl={activeAvatar}
                        size="md"
                        showOnline={isSignedIn}
                      />
                      {isSignedIn && (
                        <>
                          <p className="mt-3 text-base font-semibold text-black">{activeName}</p>
                          <p className="mt-0.5 text-xs text-[var(--ink-muted)] truncate max-w-full">
                            {activeEmail}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="mt-5 space-y-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          if (!isAuthenticated) {
                            openSignInPrompt();
                            return;
                          }
                          setFavoritesOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ink-strong)] hover:bg-[var(--surface-soft)] hover:text-black cursor-pointer"
                      >
                        <span>Favorite Services</span>
                        <span className="font-mono-code text-xs text-[var(--ink-muted)]">
                          {favoriteServices.length}
                        </span>
                      </button>

                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-strong)] hover:bg-[var(--surface-soft)] hover:text-black"
                      >
                        Settings
                      </Link>
                    </div>

                    <div className="mt-3 border-t border-[var(--line)] pt-3 space-y-1">
                      {isSignedIn ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            signOutCustomer();
                            signOut();
                            setProfileMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#A3003D] hover:bg-[#FFF5F8] cursor-pointer"
                        >
                          Sign Out
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          role="menuitem"
                          onClick={() => setProfileMenuOpen(false)}
                          className="block rounded-full bg-[#0D0C22] px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-[#1E1D33]"
                        >
                          Sign In with Google
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] text-black md:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Webflow Half-Screen Right Favorites Drawer (Text & Quantity Focused) */}
          <StudioModal
            open={favoritesOpen}
            onClose={() => setFavoritesOpen(false)}
            title={`Favorites (${favoriteServices.length})`}
            variant="drawer"
            widthClass="max-w-[34rem] sm:max-w-[38rem]"
            ariaLabel="Saved favorite services"
            footer={
              favoriteServices.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-base">
                    <span className="font-medium text-[var(--ink-muted)]">Total Quantity</span>
                    <span className="font-semibold text-black tabular-nums">
                      {totalFavoriteQty} {totalFavoriteQty === 1 ? 'pc' : 'pcs'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartFavoritesChat}
                    className="btn-lime-clean w-full font-semibold"
                  >
                    Start Inquiry Chat
                  </button>
                </div>
              ) : (
                <Link
                  to="/services"
                  onClick={() => setFavoritesOpen(false)}
                  className="btn-lime-clean w-full font-semibold"
                >
                  Browse Services
                </Link>
              )
            }
          >
            {favoriteServices.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-base text-[var(--ink-muted)]">
                  No favorite services saved yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-3.5">
                {favoriteServices.map((service) => {
                  const qty = favoriteQuantities[service.id] ?? 1;
                  return (
                    <li
                      key={service.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold leading-snug text-black">
                          {service.serviceName}
                        </p>
                        <p className="mt-1 text-base font-semibold text-[#151515] tabular-nums">
                          {service.pricePhp}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--ink-muted)] tabular-nums">
                          {service.reservationFeePhp}
                          {service.sizeNote ? ` · ${service.sizeNote}` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleFavoriteService(service.id)}
                          aria-label={`Remove ${service.serviceName} from favorites`}
                          className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Remove
                        </button>
                      </div>

                      <div className="flex shrink-0 items-center rounded-lg border border-[#EAEAEA] bg-white">
                        <button
                          type="button"
                          onClick={() => setFavoriteQuantity(service.id, qty - 1)}
                          aria-label={`Decrease quantity for ${service.serviceName}`}
                          className="flex h-10 w-9 items-center justify-center text-[#525252] hover:bg-[#FAFAFA] hover:text-black cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={qty}
                          onChange={(e) => setFavoriteQuantity(service.id, Number(e.target.value))}
                          aria-label={`Quantity for ${service.serviceName}`}
                          className="h-10 w-12 border-x border-[#EAEAEA] bg-white text-center text-base font-semibold text-black tabular-nums focus:border-[#3898EC]"
                        />
                        <button
                          type="button"
                          onClick={() => setFavoriteQuantity(service.id, qty + 1)}
                          aria-label={`Increase quantity for ${service.serviceName}`}
                          className="flex h-10 w-9 items-center justify-center text-[#525252] hover:bg-[#FAFAFA] hover:text-black cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </StudioModal>
        </div>

        {mobileOpen && (
          <div className="border-t border-[var(--line)] bg-[var(--paper)] px-4 py-4 md:hidden">
            <nav aria-label="Mobile navigation" className="flex flex-col gap-2">
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-base font-medium ${isActive ? 'bg-[var(--surface-soft)] text-black font-semibold' : 'text-[#151515]'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <Link
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-[#151515]"
              >
                Settings
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="btn-printula mt-2 w-full"
              >
                {activeName ?? 'Sign In'}
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <div key={`${location.pathname}-${location.key}`} className="page-enter">
          <Outlet />
        </div>
      </main>

      <InquiryChatWidget />
      <SignInPromptCard />

      <footer className="border-t border-[var(--line)] bg-[var(--paper)]">
        <div className="mx-auto max-w-[75rem] px-4 py-12 sm:px-6 space-y-10">
          {/* Printula-style 3 contact strip with lime square tiles */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="printula-footer-item flex items-center gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#38BDF8] text-black">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-[var(--ink-muted)]">Email</p>
                <p className="text-sm font-semibold text-black">{PENDING_OWNER_VERIFICATION_TEXT}</p>
              </div>
            </div>

            <div className="printula-footer-item flex items-center gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#38BDF8] text-black">
                <Phone className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-[var(--ink-muted)]">Phone</p>
                <p className="text-sm font-semibold text-black">{PENDING_OWNER_VERIFICATION_TEXT}</p>
              </div>
            </div>

            <div className="printula-footer-item flex items-center gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#38BDF8] text-black">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-[var(--ink-muted)]">Location</p>
                <p className="text-sm font-semibold text-black">{SHOP_LOCATION}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 border-t border-[var(--line)] pt-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <BrandLogo size="md" />
              <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--ink-muted)]">
                Custom printing and personalization in {SHOP_LOCATION}.
              </p>
            </div>

            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-black">Pages</p>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--ink-muted)]">
                <li>
                  <Link to="/" className="hover:text-black">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="hover:text-black">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/services" className="hover:text-black">
                    Services
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="hover:text-black">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-black">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <p className="text-sm font-semibold text-black">Services</p>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--ink-muted)]">
                <li>
                  <button
                    type="button"
                    onClick={() => openInquiryChat('lamination')}
                    className="hover:text-black cursor-pointer"
                  >
                    Lamination
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openInquiryChat('souvenir-making')}
                    className="hover:text-black cursor-pointer"
                  >
                    Souvenir Making
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openInquiryChat('document-printing')}
                    className="hover:text-black cursor-pointer"
                  >
                    Document Printing
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openInquiryChat('mug-customization')}
                    className="hover:text-black cursor-pointer"
                  >
                    Mug Customization
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-black">Direct Access</p>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--ink-muted)]">
                <li>
                  <button
                    type="button"
                    onClick={() => openInquiryChat()}
                    className="hover:text-black cursor-pointer"
                  >
                    Inquiry Chat
                  </button>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-black">
                    Profile Settings
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="hover:text-black">
                    Account Sign In
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-6 text-xs text-[var(--ink-subtle)]">
            <span>RJ HUB Printing · Est. 2023</span>
            <span>Client Inquiry &amp; Records System</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
