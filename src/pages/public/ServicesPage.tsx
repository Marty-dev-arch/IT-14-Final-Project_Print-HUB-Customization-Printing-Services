import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProductMockup3DStudio } from '../../components/ProductMockup3DStudio';
import { ScrollReveal } from '../../components/ScrollReveal';
import { PrintulaServiceCard } from '../../components/ServiceArtwork';
import { useAppStore } from '../../context/AppStoreContext';
import type { ServiceCategory } from '../../types/domain';

type CategoryFilter = 'all' | 'favorites' | ServiceCategory;

export function ServicesPage() {
  const { services, favoriteServiceIds } = useAppStore();
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [studioServiceId, setStudioServiceId] = useState<string>(
    () => searchParams.get('service') ?? services[0]?.id ?? 'sintra-board',
  );
  const studioRef = useRef<HTMLDivElement>(null);

  const requestedService = searchParams.get('service');
  useEffect(() => {
    if (requestedService && services.some((item) => item.id === requestedService)) {
      setStudioServiceId(requestedService);
    }
  }, [requestedService, services]);

  const handleCustomizeCard = (serviceId: string) => {
    setStudioServiceId(serviceId);
    studioRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const categoryTabs: readonly { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'print-paper', label: 'Print & Paper' },
    { id: 'keepsakes-gifts', label: 'Keepsakes & Gifts' },
    { id: 'engraving-signage', label: 'Engraving & Signage' },
    { id: 'favorites', label: `Favorites (${favoriteServiceIds.length})` },
  ];

  const filteredServices =
    category === 'all'
      ? services
      : category === 'favorites'
        ? services.filter((service) => favoriteServiceIds.includes(service.id))
        : services.filter((service) => service.category === category);

  return (
    <div className="py-14 sm:py-16 lg:py-[4.375rem]">
      <div className="mx-auto max-w-[75rem] px-4 sm:px-6 space-y-12">
        <div className="printula-rise mx-auto max-w-2xl text-center">
          <h1 className="heading-style-h1">
            Exceptional services for custom prints
          </h1>
          <p className="text-size-regular mt-3">
            Select any service to check PHP rates, preview 3D mockups, or open an inquiry chat.
          </p>
        </div>

        {/* Interactive 3D Customization Studio */}
        <div ref={studioRef} className="printula-scale-in printula-delay-1 scroll-mt-24">
          <ProductMockup3DStudio
            selectedServiceId={studioServiceId}
            onSelectService={setStudioServiceId}
          />
        </div>

        <div>
          <div
            className="printula-rise printula-delay-1 flex flex-wrap justify-center gap-2"
            role="tablist"
            aria-label="Filter services by category"
          >
            {categoryTabs.map((tab) => {
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(tab.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                    active
                      ? 'border-transparent bg-[#38BDF8] text-black'
                      : 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink-muted)] hover:border-[#BAE6FD] hover:text-black'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {filteredServices.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-6 py-12 text-center">
              <p className="text-size-regular">
                Tap the heart icon on any printing service card to save it to your favorites.
              </p>
              <button
                type="button"
                onClick={() => setCategory('all')}
                className="btn-printula mt-5"
              >
                View All Services
              </button>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredServices.map((service, idx) => (
                <ScrollReveal key={service.id} delayMs={(idx % 3) * 70}>
                  <PrintulaServiceCard service={service} onCustomize={handleCustomizeCard} />
                </ScrollReveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
