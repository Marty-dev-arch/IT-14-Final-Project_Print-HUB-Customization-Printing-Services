import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Gem, Target } from 'lucide-react';
import { CtaBanner } from '../../components/CtaBanner';
import { PrintSpotlightCircle } from '../../components/PrintSpotlightCircle';
import { ScrollReveal } from '../../components/ScrollReveal';
import { useAppStore } from '../../context/AppStoreContext';
import { SHOP_LOCATION } from '../../data/services';

const VALUE_ITEMS = [
  'Integrity',
  'Customer Focus',
  'Reliability',
  'Craftsmanship',
  'Responsibility',
  'Excellence',
] as const;

export function AboutPage() {
  const { openInquiryChat, publicInquiryCount } = useAppStore();
  const studioStats = [
    { value: '2023', label: 'Started in Mawab' },
    { value: '3 Years', label: 'Years Experience' },
    { value: String(publicInquiryCount), label: 'Inquiries Received' },
    { value: '3', label: 'Skilled Members' },
  ] as const;

  return (
    <div>
      {/* Printula About Hero with Animated Circular Mockup Crossfade */}
      <section className="bg-[var(--paper)] py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto grid max-w-[75rem] gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-5">
            <h1 className="heading-style-h1 printula-rise">
             Transforming ideas into printed perfection.
            </h1>

            <p className="text-size-regular printula-rise printula-delay-1 mt-5 max-w-md">
              Local printing and customization studio in {SHOP_LOCATION}.
            </p>

            <div className="printula-rise printula-delay-2 mt-8">
              <button type="button" onClick={() => openInquiryChat()} className="btn-printula">
                Send an Inquiry
              </button>
            </div>
          </div>

          <div className="printula-scale-in printula-delay-2 flex justify-center lg:col-span-7 lg:justify-end">
            <PrintSpotlightCircle />
          </div>
        </div>
      </section>

      {/* Printula 4-Column Lime-Divider Stats Bar */}
      <ScrollReveal>
        <section aria-label="Studio milestones" className="bg-[var(--paper)] py-10 sm:py-14">
          <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {studioStats.map((stat) => (
                <div key={stat.label} className="flex items-stretch gap-5 py-2">
                  <span className="w-[2px] shrink-0 bg-[#38BDF8]" aria-hidden="true" />
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-black sm:text-4xl tabular-nums">
                      {stat.value}
                    </p>
                    <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Studio Story Split (Two real shop photos only — third picture removed) */}
      <ScrollReveal delayMs={60}>
        <section className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto grid max-w-[75rem] gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)]">
              <img
                src="/rjhub-shop-exterior.jpg"
                alt="RJ HUB Printing storefront in Purok 4, Andili, Mawab, Davao de Oro"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)]">
              <img
                src="/rjhub-shop-interior.jpg"
                alt="Inside RJ HUB Printing workstation in Andili, Mawab"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-6">
            <h2 className="heading-style-h2">
              Rooted in {SHOP_LOCATION}
            </h2>
            <p className="text-size-regular mt-4 max-w-lg">
              Founded as a neighborhood startup in 2023, our 3-family member shop handles everyday document
              printing, lamination, souvenirs, magnets, laser engraving, and custom mugs with
              personal care.
            </p>
            <div className="mt-7">
              <Link to="/services" className="btn-printula">
                Explore Services
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Value / Mission / Vision */}
      <ScrollReveal delayMs={80}>
        <section className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          <h2 className="heading-style-h2 mx-auto max-w-lg text-center">
            Driven by purpose, powered by vision
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
            <ScrollReveal delayMs={0} className="h-full">
              <div className="flex h-full flex-col items-center px-6 py-10 text-center">
                <Gem className="h-14 w-14 text-black stroke-[1.5]" aria-hidden="true" />
                <h3 className="heading-style-h5 mt-7">Value</h3>
                <div className="my-5 h-px w-56 max-w-full bg-[var(--line)]" />
                <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-left text-sm text-[var(--ink-muted)]">
                  {VALUE_ITEMS.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={70} className="h-full">
              <div className="flex h-full flex-col items-center rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-8 py-12 text-center">
                <Target className="h-14 w-14 text-black stroke-[1.5]" aria-hidden="true" />
                <h3 className="heading-style-h5 mt-7">Mission</h3>
                <div className="my-5 h-px w-56 max-w-full bg-[var(--line)]" />
                <p className="text-size-small max-w-xs">
                  Deliver reliable custom prints and keepsakes through clear communication and careful
                  craft for every local inquiry.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delayMs={140} className="h-full">
              <div className="flex h-full flex-col items-center px-6 py-10 text-center">
                <Eye className="h-14 w-14 text-black stroke-[1.5]" aria-hidden="true" />
                <h3 className="heading-style-h5 mt-7">Vision</h3>
                <div className="my-5 h-px w-56 max-w-full bg-[var(--line)]" />
                <p className="text-size-small max-w-xs">
                  Grow as Mawab&apos;s trusted printing partner where community events, schools, and
                  families bring ideas to print.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={60}>
        <CtaBanner />
      </ScrollReveal>
    </div>
  );
}
