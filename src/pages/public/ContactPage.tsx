import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { InquiryForm } from '../../components/InquiryForm';
import { ReviewSlider } from '../../components/ReviewSlider';
import { ScrollReveal } from '../../components/ScrollReveal';
import { PENDING_OWNER_VERIFICATION_TEXT, SHOP_LOCATION } from '../../data/services';

const CONTACT_CARDS = [
  {
    id: 'phone',
    label: 'Give us a call',
    value: PENDING_OWNER_VERIFICATION_TEXT,
    icon: Phone,
  },
  {
    id: 'email',
    label: 'Send us Email',
    value: PENDING_OWNER_VERIFICATION_TEXT,
    icon: Mail,
  },
  {
    id: 'address',
    label: 'Our Location',
    value: SHOP_LOCATION,
    icon: MapPin,
  },
] as const;

export function ContactPage() {
  return (
    <div>
      <section className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          {/*Top Row: Left 3D Green Phone Image + Wide Right Studio Banner */}
          <div className="printula-rise flex flex-col gap-5 md:flex-row md:items-start">
            <div className="hidden overflow-hidden rounded-[10px] border border-[var(--line)] bg-[#DCDCDC] md:block md:w-[297px] md:h-[11.25rem] shrink-0">
              <img
                src="/contact-phone.png"
                alt="Green studio handset for RJ HUB Printing inquiries"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] h-48 sm:h-56 md:h-[16rem] md:flex-1">
              <img
                src="/rjhub-shop-exterior.jpg"
                alt="RJ HUB Printing storefront in Purok 4, Andili, Mawab, Davao de Oro"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* Printula Bottom Split: Contact Info Cards on Left, Overlapping Form Card on Right */}
          <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-12 lg:items-start lg:gap-14">
            <div className="lg:col-span-5">
              <h1 className="heading-style-h2 printula-rise">Contact Us</h1>
              <p className="text-size-regular printula-rise printula-delay-1 mt-4 max-w-sm">
                Visit our print studio in Mawab or send your custom printing inquiry directly using
                the form.
              </p>

              <div className="mt-8 space-y-4">
                {CONTACT_CARDS.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <ScrollReveal key={card.id} delayMs={idx * 70}>
                      <div className="group flex items-center justify-between gap-4 rounded-[10px] border border-[var(--line)] bg-[var(--paper)] p-5 transition-colors duration-200 hover:border-[#BAE6FD]">
                        <div className="flex items-center gap-4 min-w-0">
                          <span className="inline-flex h-[3.125rem] w-[3.125rem] shrink-0 items-center justify-center rounded-[10px] bg-[var(--line)] text-black transition-colors duration-200 group-hover:bg-[#38BDF8]">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-size-small">{card.label}</p>
                            <p className="text-size-regular is-black-900 mt-1 break-words">
                              {card.value}
                            </p>
                          </div>
                        </div>
                        <span
                          className="inline-flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-[10px] bg-[var(--line)] text-black transition-colors duration-200 group-hover:bg-[#38BDF8]"
                          aria-hidden="true"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </ScrollReveal>
                  );
                })}
              </div>
            </div>

            <div className="printula-scale-in printula-delay-2 lg:col-span-7 lg:-mt-20 relative z-10">
              <InquiryForm mode="contact" />
            </div>
          </div>
        </div>
      </section>

      <ReviewSlider />
    </div>
  );
}
