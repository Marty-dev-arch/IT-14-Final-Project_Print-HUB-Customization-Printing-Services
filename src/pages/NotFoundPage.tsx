import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4 py-16 text-black">
      <div className="max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-8 text-center">
        <p className="font-mono-code text-sm font-medium text-[var(--ink-muted)]">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-black">Page Not Found</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
          The page you requested does not exist.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn-printula-lime">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Return Home
          </Link>
          <Link to="/inquiry" className="btn-printula-soft">
            Send an Inquiry
          </Link>
        </div>
      </div>
    </div>
  );
}
