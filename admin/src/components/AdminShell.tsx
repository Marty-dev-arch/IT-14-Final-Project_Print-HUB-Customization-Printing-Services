import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Home,
  Inbox,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/messages', label: 'Message Management', icon: Inbox },
  { to: '/clients', label: 'Client Records', icon: Users },
  { to: '/logs', label: 'Logs', icon: ClipboardList },
] as const;

const GUIDE_SECTIONS = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    body: 'Track incoming inquiries, pending queue count, daily/weekly/monthly inquiry flow chart, and newly arrived unseen customer messages.',
  },
  {
    id: 'messages',
    title: 'Message Management',
    body: 'View unread customer inquiries highlighted in bold, accept threads into Client Records with Check, archive finished threads with X to Message History, attach photos, insert emojis, and customize bubble colors.',
  },
  {
    id: 'clients',
    title: 'Client Records',
    body: 'Track Pending client orders, quantity, total PHP price, and reservation fees. Marking an order Done or Cancelled moves it into Logs automatically.',
  },
  {
    id: 'logs',
    title: 'Logs & CSV Export',
    body: 'Review Done and Cancelled orders, filter by exact Date and Time, and export records cleanly as a CSV spreadsheet.',
  },
] as const;

export function AdminShell() {
  const { admin, stage, loading, logout } = useAdminAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [openGuideId, setOpenGuideId] = useState<string>('dashboard');
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setGuideOpen(false);
        setLogoutModalOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] text-sm font-medium text-[#64748B]">
        Verifying administrator session...
      </div>
    );
  }

  if (stage !== 'authenticated' || !admin) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const navLinkClass = (isActive: boolean) =>
    `group flex items-center gap-3.5 rounded-2xl px-4 py-3 text-[15.5px] tracking-tight whitespace-nowrap transition-colors ${
      isActive
        ? 'bg-[#E0F2FE] text-[#0284C7] font-semibold'
        : 'bg-transparent text-[#475569] font-normal hover:bg-[#F1F5F9] hover:text-[#0F172A] active:bg-[#E0F2FE] active:text-[#0284C7]'
    }`;

  async function confirmLogout() {
    setLogoutModalOpen(false);
    await logout();
  }

  const renderSidebarInner = () => (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
          <img
            src="/rj-logo-mark.jpg"
            alt="Print HUB"
            className="h-12 w-auto shrink-0 object-contain mix-blend-multiply"
          />
          <span className="truncate text-[21px] font-bold tracking-tight text-[#0F172A]">
            Print HUB
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse navigation bar"
          className="hidden lg:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:bg-[#E0F2FE] active:text-[#0284C7] transition-colors cursor-pointer"
        >
          <PanelLeftClose className="h-5 w-5 stroke-[1.8]" />
        </button>
      </div>

      <nav aria-label="Administrator navigation" className="mt-5 flex-1 space-y-1.5 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-5 w-5 shrink-0 stroke-[1.8] ${
                      isActive ? 'text-[#0284C7]' : 'text-[#64748B] group-hover:text-[#0F172A]'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Minimal Footer: User Guide + Log Out */}
      <div className="mt-auto px-3 pt-3 space-y-1">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setGuideOpen(true);
          }}
          className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-[15.5px] font-normal tracking-tight text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] active:bg-[#E0F2FE] active:text-[#0284C7] transition-colors cursor-pointer"
        >
          <HelpCircle className="h-5 w-5 shrink-0 stroke-[1.8]" aria-hidden="true" />
          <span>User guide</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setLogoutModalOpen(true);
          }}
          className="flex w-full items-center gap-3.5 px-4 py-3 text-[15.5px] font-normal tracking-tight text-[#475569] bg-transparent hover:bg-transparent hover:text-[#DC2626] hover:font-medium active:bg-transparent active:text-[#B91C1C] transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5 shrink-0 stroke-[1.8]" aria-hidden="true" />
          <span>Log out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="flex items-center justify-between border-b border-[#EAE6DF] bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <img
            src="/rj-logo-mark.jpg"
            alt="Print HUB"
            className="h-10 w-auto object-contain mix-blend-multiply"
          />
          <span className="text-lg font-bold tracking-tight text-[#0F172A]">Print HUB</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle admin navigation"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#0F172A] hover:bg-[#F1F5F9] active:bg-[#E0F2FE] cursor-pointer"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Crisp Full-Height Left Navigation Sidebar */}
      {!collapsed && (
        <aside className="hidden lg:flex lg:flex-col shrink-0 w-[290px] border-r border-[#EAE6DF] bg-white py-5 sticky top-0 h-screen">
          {renderSidebarInner()}
        </aside>
      )}

      {/* Mobile Drawer */}
      {mobileOpen && (
        <aside className="border-b border-[#EAE6DF] bg-white py-4 lg:hidden">
          {renderSidebarInner()}
        </aside>
      )}

      {/* Open Cream-White Main Workspace (zero outer card border) */}
      <main className="min-w-0 flex-1 flex flex-col bg-[#FAF8F5] px-5 py-6 sm:px-8 sm:py-7">
        {collapsed && (
          <div className="mb-4 hidden lg:flex items-center">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand navigation bar"
              title="Open navigation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] active:border-[#38BDF8] cursor-pointer"
            >
              <PanelLeftOpen className="h-5 w-5 stroke-[1.8]" />
            </button>
          </div>
        )}
        <Outlet />
      </main>

      {/* Left Slide-Over User Guide Modal */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/30 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-modal-title"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-xl flex-col bg-white border-r border-[#EAEAEA] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#EAEAEA] px-6 py-5">
              <div>
                <h2 id="guide-modal-title" className="text-2xl font-bold tracking-tight text-[#0F172A]">
                  User guide
                </h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Step-by-step instructions for Print HUB inquiries and client management.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close user guide"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="divide-y divide-[#EAEAEA]">
                {GUIDE_SECTIONS.map((sec) => {
                  const isOpen = openGuideId === sec.id;
                  return (
                    <div key={sec.id} className="py-4">
                      <button
                        type="button"
                        onClick={() => setOpenGuideId(isOpen ? '' : sec.id)}
                        className="flex w-full items-center justify-between gap-3 text-left text-base font-semibold text-[#0F172A] cursor-pointer"
                      >
                        <span>{sec.title}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform ${
                            isOpen ? 'rotate-180 text-[#0284C7]' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <p className="mt-2.5 text-sm leading-relaxed text-[#64748B]">{sec.body}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onClick={() => setLogoutModalOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[24px] border border-[#EAEAEA] bg-white p-6 sm:p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="logout-modal-title" className="text-xl font-bold tracking-tight text-[#0F172A]">
              Log out?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
              You&apos;ll need to sign in again with your security PIN to get back to your session.
            </p>
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmLogout()}
                className="rounded-xl bg-[#DC2626] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
