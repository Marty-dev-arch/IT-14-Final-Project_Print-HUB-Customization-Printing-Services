import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Trash2, Upload, User } from 'lucide-react';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { ScrollReveal } from '../../components/ScrollReveal';
import { useAppStore } from '../../context/AppStoreContext';

type SettingsTab = 'account' | 'preferences';
type EditingField = 'name' | 'email' | null;

export function ProfileSettingsPage() {
  const {
    services,
    customerSession,
    session,
    favoriteServiceIds,
    toggleFavoriteService,
    updateProfile,
    signOutCustomer,
    signOut,
    openInquiryChat,
  } = useAppStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeName =
    customerSession?.fullName ?? session?.admin.displayName ?? 'Guest Visitor';
  const activeEmail =
    customerSession?.email ?? session?.admin.email ?? 'Not signed in yet';
  const activeAvatar =
    customerSession?.avatarDataUrl ?? session?.admin.avatarDataUrl;
  const isSignedIn = Boolean(customerSession || session);

  const favoriteServices = services.filter((service) =>
    favoriteServiceIds.includes(service.id),
  );

  function startEdit(field: Exclude<EditingField, null>, initialValue: string) {
    setEditingField(field);
    setFieldValue(initialValue);
    setStatusMessage(null);
  }

  function handleSaveField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = fieldValue.trim();
    if (!clean) return;

    if (editingField === 'name') {
      updateProfile({ fullName: clean });
      setStatusMessage('Name updated.');
    } else if (editingField === 'email') {
      updateProfile({ email: clean });
      setStatusMessage('Email updated.');
    }
    setEditingField(null);
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateProfile({ avatarDataUrl: reader.result });
        setStatusMessage('Profile picture updated.');
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSignOutAll() {
    signOutCustomer();
    signOut();
    navigate('/');
  }

  return (
    <div className="py-14 sm:py-16 lg:py-[4.375rem]">
      <ScrollReveal>
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Left Settings Navigation (Inspired by Mobbin Account/Preferences sidebar) */}
          <aside className="lg:col-span-3" aria-label="Profile settings navigation">
            <nav className="flex gap-2 lg:flex-col">
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`inline-flex items-center gap-2.5 rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'account'
                    ? 'bg-[#38BDF8]/25 font-semibold text-black'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--surface-soft)] hover:text-black'
                }`}
              >
                <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                Account
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={`inline-flex items-center gap-2.5 rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === 'preferences'
                    ? 'bg-[#38BDF8]/25 font-semibold text-black'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--surface-soft)] hover:text-black'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                Preferences
              </button>
            </nav>
          </aside>

          {/* Right Settings Detail Panel */}
          <div className="max-w-2xl lg:col-span-9">
            {/* Avatar + Picture Upload Header */}
            <div className="flex flex-wrap items-center gap-6 pb-8 border-b border-[var(--line)]">
              <ProfileAvatar
                name={isSignedIn ? activeName : undefined}
                avatarUrl={activeAvatar}
                size="lg"
                showOnline={isSignedIn}
              />

              <div className="flex-1 min-w-[200px]">
                <h1 className="heading-style-h4">{activeName}</h1>
                <p className="text-size-small mt-1">{activeEmail}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <input
                    ref={fileInputRef}
                    id="profile-avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="sr-only"
                  />
                  <label
                    htmlFor="profile-avatar-upload"
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[#FEFEFE] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#38BDF8] cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    Upload Picture
                  </label>
                  {activeAvatar && (
                    <button
                      type="button"
                      onClick={() => {
                        updateProfile({ avatarDataUrl: null });
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        setStatusMessage('Profile picture removed.');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:border-[var(--line-strong)] hover:text-black cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {statusMessage && (
              <p
                role="status"
                className="mt-5 rounded-xl bg-[#38BDF8]/25 px-4 py-2.5 text-xs font-semibold text-black"
              >
                {statusMessage}
              </p>
            )}

            {activeTab === 'account' ? (
              <div className="mt-8 space-y-10">
                <section aria-labelledby="personal-details-heading">
                  <h2 id="personal-details-heading" className="heading-style-h5">
                    Personal details
                  </h2>

                  <div className="mt-4 divide-y divide-[var(--line)] border-t border-b border-[var(--line)]">
                    {/* Name Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black">Name</p>
                        {editingField === 'name' ? (
                          <form onSubmit={handleSaveField} className="mt-2 flex flex-wrap gap-2">
                            <input
                              type="text"
                              aria-label="Edit profile name"
                              maxLength={80}
                              value={fieldValue}
                              onChange={(e) => setFieldValue(e.target.value)}
                              className="h-10 flex-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--paper)] px-3.5 text-sm text-black"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-[#38BDF8] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#0EA5E9] cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingField(null)}
                              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <p className="text-size-small mt-0.5">{activeName}</p>
                        )}
                      </div>
                      {editingField !== 'name' && (
                        <button
                          type="button"
                          onClick={() => startEdit('name', isSignedIn ? activeName : '')}
                          className="text-sm font-medium text-black hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Email Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-black">Email address</p>
                        {editingField === 'email' ? (
                          <form onSubmit={handleSaveField} className="mt-2 flex flex-wrap gap-2">
                            <input
                              type="email"
                              aria-label="Edit email address"
                              maxLength={120}
                              value={fieldValue}
                              onChange={(e) => setFieldValue(e.target.value)}
                              className="h-10 flex-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--paper)] px-3.5 text-sm text-black"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-[#38BDF8] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#0EA5E9] cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingField(null)}
                              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <p className="text-size-small mt-0.5">{activeEmail}</p>
                        )}
                      </div>
                      {editingField !== 'email' && (
                        <button
                          type="button"
                          onClick={() => startEdit('email', isSignedIn ? activeEmail : '')}
                          className="text-sm font-medium text-black hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                  </div>
                </section>

                <section aria-labelledby="manage-account-heading">
                  <h2 id="manage-account-heading" className="heading-style-h5">
                    Manage account
                  </h2>

                  <div className="mt-4 divide-y divide-[var(--line)] border-t border-b border-[var(--line)]">
                    <div className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-black">
                          {isSignedIn ? 'Sign out of this browser' : 'Sign in to your account'}
                        </p>
                        <p className="text-size-small mt-0.5">
                          {isSignedIn
                            ? 'Clears your active session on this browser.'
                            : 'Sign in with Google to save favorites and inquiries.'}
                        </p>
                      </div>
                      {isSignedIn ? (
                        <button
                          type="button"
                          onClick={handleSignOutAll}
                          className="text-sm font-semibold text-[#A3003D] hover:underline cursor-pointer"
                        >
                          Sign Out
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          className="btn-lime-clean shrink-0 whitespace-nowrap font-semibold"
                        >
                          Sign In
                        </Link>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="mt-8 space-y-10">
                <section aria-labelledby="service-prefs-heading">
                  <h2 id="service-prefs-heading" className="heading-style-h5">
                    Customization preferences
                  </h2>

                  <div className="mt-4 space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-6">
                    <div>
                      <label htmlFor="pref-default-service" className="block text-sm font-medium text-black">
                        Default Service in Inquiry Chat
                      </label>
                      <select
                        id="pref-default-service"
                        value={customerSession?.defaultServiceId ?? ''}
                        onChange={(e) => {
                          updateProfile({ defaultServiceId: e.target.value });
                          setStatusMessage('Default inquiry service updated.');
                        }}
                        className="mt-2 h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-4 text-sm text-black"
                      >
                        <option value="">None (ask every time)</option>
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.serviceName} ({service.pricePhp})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="border-t border-[var(--line)] pt-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-black">
                          Saved Favorite Services ({favoriteServices.length})
                        </p>
                        <Link to="/services" className="text-xs font-semibold text-black underline">
                          Browse Services
                        </Link>
                      </div>

                      {favoriteServices.length === 0 ? (
                        <p className="text-size-small mt-2">
                          Tap the heart icon on any service card to pin it here.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {favoriteServices.map((service) => (
                            <li
                              key={service.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 text-sm"
                            >
                              <span className="font-medium text-black">
                                {service.serviceName}{' '}
                                <span className="text-xs text-[var(--ink-muted)] tabular-nums">
                                  ({service.pricePhp})
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openInquiryChat(service.id)}
                                  className="rounded-lg bg-[#38BDF8] px-2.5 py-1 text-xs font-semibold text-black hover:bg-[#0EA5E9] cursor-pointer"
                                >
                                  Inquire
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleFavoriteService(service.id)}
                                  className="text-xs text-[var(--ink-muted)] transition-colors hover:text-[#DC2626] cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
      </ScrollReveal>
    </div>
  );
}
