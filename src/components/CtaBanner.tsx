import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
        <div className="group grid items-center gap-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-7 py-10 sm:px-14 sm:py-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <h2 className="heading-style-h2">
              Start your custom print inquiry today
            </h2>
            <div className="mt-7">
              <Link to="/services" className="btn-printula">
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Angled RJ HUB Gift Bag & Custom Print Mockup (inspired by Printula CTA artwork) */}
          <div className="flex justify-center md:col-span-6 md:justify-end">
            <svg
              viewBox="0 0 380 250"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="cta-mockup-tilt w-full max-w-[340px] h-auto"
              role="img"
              aria-hidden="true"
            >
              {/* Back gift bag silhouette */}
              <g transform="translate(115 110) rotate(-32)">
                <rect x="0" y="0" width="165" height="145" rx="4" fill="#ECEEF0" stroke="#D4D4D4" strokeWidth="1.5" />
                <path d="M46 18c-16-24-30-16-24 2" stroke="#9AA0A6" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              </g>

              {/* Foreground angled RJ HUB custom print bag */}
              <g transform="translate(50 96) rotate(-36)">
                <rect x="0" y="0" width="190" height="165" rx="6" fill="#FFFFFF" stroke="#151515" strokeWidth="1.75" />
                {/* Diagonal pocket fold */}
                <path d="M0 95 L190 30 L190 165 L0 165 Z" fill="#F4F5F6" stroke="#D4D4D4" strokeWidth="1.4" />
                {/* Geometric print pattern */}
                <circle cx="122" cy="48" r="24" fill="#38BDF8" />
                <circle cx="96" cy="64" r="32" fill="#8BF2FF" fillOpacity="0.85" />
                <circle cx="148" cy="60" r="22" fill="#CBA3FF" fillOpacity="0.9" />
                {/* Crisp custom brand print */}
                <text
                  x="20"
                  y="56"
                  fill="#151515"
                  fontFamily="Inter, sans-serif"
                  fontSize="13"
                  fontWeight="700"
                  letterSpacing="0.02em"
                >
                  RJ HUB
                </text>
                <text
                  x="20"
                  y="73"
                  fill="#151515"
                  fontFamily="Inter, sans-serif"
                  fontSize="12"
                  fontWeight="600"
                >
                  CUSTOM PRINT
                </text>
                {/* Bag cord handle */}
                <path
                  d="M36 22 C16 -10, 82 -14, 72 22"
                  stroke="#EC008C"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="36" cy="22" r="3" fill="#151515" />
                <circle cx="72" cy="22" r="3" fill="#151515" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
