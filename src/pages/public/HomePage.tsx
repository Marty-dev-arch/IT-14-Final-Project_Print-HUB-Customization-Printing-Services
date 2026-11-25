import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  Coffee,
  FileText,
  Gift,
  Layers,
  Magnet,
  MessageSquare,
  Printer,
  Sparkles,
} from 'lucide-react';
import { CtaBanner } from '../../components/CtaBanner';
import { PrintSpotlightCircle } from '../../components/PrintSpotlightCircle';
import { ReviewSlider } from '../../components/ReviewSlider';
import { ScrollReveal } from '../../components/ScrollReveal';
import { PrintulaServiceCard } from '../../components/ServiceArtwork';
import { useAppStore } from '../../context/AppStoreContext';

const MARQUEE_ICONS = {
  lamination: Layers,
  'souvenir-making': Gift,
  'document-printing': FileText,
  'refrigerator-magnets': Magnet,
  'laser-engraving': Sparkles,
  'mug-customization': Coffee,
} as const;

export function HomePage() {
  const { services, openInquiryChat, publicInquiryCount } = useAppStore();
  const reversedServices = [...services.slice(3), ...services.slice(0, 3)];

  return (
    <div>
      {/* Hero */}
      <section className="bg-[var(--paper)] py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto grid max-w-[75rem] gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-6">
            <h1 className="heading-style-h1 printula-rise">
              Your ideas, printed your way.
            </h1>

            <p className="text-size-regular printula-rise printula-delay-1 mt-6 max-w-md">
              Lamination, souvenirs, documents, magnets, laser engraving, and mugs—reviewed directly
              by inquiry.
            </p>

            <div className="printula-rise printula-delay-2 mt-8 flex flex-wrap items-center gap-4">
              <Link id="hero-inquiry-cta" to="/services" className="btn-printula">
                Get Started
              </Link>
              <button
                type="button"
                onClick={() => openInquiryChat()}
                className="btn-printula-soft"
              >
                Inquiry Chat
              </button>
            </div>

            {/* Printula Hero Metrics spaced below CTA like .hero-left-content-wrapper (gap 7.5rem) */}
            <div className="printula-rise printula-delay-3 mt-16 flex flex-wrap items-stretch gap-12 sm:mt-20 sm:gap-16 lg:mt-28">
              <div className="flex items-stretch gap-6">
                <span className="w-[2px] shrink-0 bg-[#38BDF8]" aria-hidden="true" />
                <div className="py-1.5">
                  <p className="heading-style-h3 tabular-nums">85%</p>
                  <p className="text-size-regular mt-2.5">Satisfaction Rate</p>
                </div>
              </div>

              <div className="flex items-stretch gap-6">
                <span className="w-[2px] shrink-0 bg-[#38BDF8]" aria-hidden="true" />
                <div className="py-1.5">
                  <p className="heading-style-h3 tabular-nums">{publicInquiryCount}</p>
                  <p className="text-size-regular mt-2.5">Inquiries Received</p>
                </div>
              </div>
            </div>
          </div>

          <div className="printula-scale-in printula-delay-2 flex justify-center lg:col-span-6 lg:justify-end">
            <PrintSpotlightCircle />
          </div>
        </div>
      </section>

      {/* Printula 2-row opposing big-text & icon marquee */}
      <ScrollReveal>
        <section aria-label="Available printing services" className="bg-[var(--paper)] py-8 sm:py-12">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          <div className="printula-marquee printula-marquee-mask space-y-6">
            {/* Row 1: left scroll */}
            <div className="printula-marquee-track">
              <div className="flex items-center gap-14 sm:gap-20 pr-14 sm:pr-20">
                {services.map((service) => {
                  const Icon = MARQUEE_ICONS[service.id as keyof typeof MARQUEE_ICONS] ?? Layers;
                  return (
                    <button
                      key={`r1a-${service.id}`}
                      type="button"
                      onClick={() => openInquiryChat(service.id)}
                      className="inline-flex items-center gap-3 whitespace-nowrap text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-[#555555] transition-colors hover:text-black cursor-pointer"
                    >
                      <Icon className="h-6 w-6 shrink-0 text-[#444444]" aria-hidden="true" />
                      {service.serviceName}
                    </button>
                  );
                })}
              </div>
              <div
                className="flex items-center gap-14 sm:gap-20 pr-14 sm:pr-20"
                aria-hidden="true"
              >
                {services.map((service) => {
                  const Icon = MARQUEE_ICONS[service.id as keyof typeof MARQUEE_ICONS] ?? Layers;
                  return (
                    <span
                      key={`r1b-${service.id}`}
                      className="inline-flex items-center gap-3 whitespace-nowrap text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-[#555555]"
                    >
                      <Icon className="h-6 w-6 shrink-0 text-[#444444]" />
                      {service.serviceName}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Row 2: reverse scroll */}
            <div className="printula-marquee-track-reverse">
              <div className="flex items-center gap-14 sm:gap-20 pr-14 sm:pr-20">
                {reversedServices.map((service) => {
                  const Icon = MARQUEE_ICONS[service.id as keyof typeof MARQUEE_ICONS] ?? Layers;
                  return (
                    <button
                      key={`r2a-${service.id}`}
                      type="button"
                      onClick={() => openInquiryChat(service.id)}
                      className="inline-flex items-center gap-3 whitespace-nowrap text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-[#555555] transition-colors hover:text-black cursor-pointer"
                    >
                      <Icon className="h-6 w-6 shrink-0 text-[#444444]" aria-hidden="true" />
                      {service.serviceName}
                    </button>
                  );
                })}
              </div>
              <div
                className="flex items-center gap-14 sm:gap-20 pr-14 sm:pr-20"
                aria-hidden="true"
              >
                {reversedServices.map((service) => {
                  const Icon = MARQUEE_ICONS[service.id as keyof typeof MARQUEE_ICONS] ?? Layers;
                  return (
                    <span
                      key={`r2b-${service.id}`}
                      className="inline-flex items-center gap-3 whitespace-nowrap text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-[#555555]"
                    >
                      <Icon className="h-6 w-6 shrink-0 text-[#444444]" />
                      {service.serviceName}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Services Grid (Printula 3-column minimal layout with PHP rates & chat inquiry launch) */}
      <ScrollReveal delayMs={60}>
        <section className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          <div className="mx-auto max-w-lg text-center">
            <h2 className="heading-style-h2">
              Exceptional services for custom prints
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 6).map((service, idx) => (
              <ScrollReveal key={service.id} delayMs={(idx % 3) * 70}>
                <PrintulaServiceCard service={service} />
              </ScrollReveal>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link to="/services" className="btn-printula">
              View all services
            </Link>
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Simple 3-Step Inquiry Process */}
      <ScrollReveal delayMs={80}>
        <section className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto grid max-w-[75rem] gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-4">
            <h2 className="heading-style-h2">
              How inquiries work
            </h2>
            <p className="text-size-regular mt-4">
              Every project is confirmed directly with our shop team before printing begins.
            </p>
            <div className="mt-6">
              <button type="button" onClick={() => openInquiryChat()} className="btn-printula">
                Send an Inquiry
              </button>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3 lg:col-span-8">
            <ScrollReveal delayMs={0} className="h-full">
              <div className="h-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-6">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE73D] text-black">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="heading-style-h5 mt-8">Send specs</h3>
                <p className="text-size-small mt-2">
                  Choose a service and share size, quantity, and finish details.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={70} className="h-full">
              <div className="h-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-6">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#8BF2FF] text-black">
                  <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="heading-style-h5 mt-8">Direct reply</h3>
                <p className="text-size-small mt-2">
                  Our team reviews your message and responds with next steps.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={140} className="h-full">
              <div className="h-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-6">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#E0F2FE] text-black">
                  <Printer className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="heading-style-h5 mt-8">Confirm &amp; print</h3>
                <p className="text-size-small mt-2">
                  Finalize details offline with the owner and start production.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
        </section>
      </ScrollReveal>

      <ReviewSlider />
      <ScrollReveal delayMs={60}>
        <CtaBanner />
      </ScrollReveal>
    </div>
  );
}
