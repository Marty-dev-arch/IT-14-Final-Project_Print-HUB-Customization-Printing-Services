import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CtaBanner } from '../../components/CtaBanner';
import { ScrollReveal } from '../../components/ScrollReveal';
import { ServiceArtwork } from '../../components/ServiceArtwork';
import { StudioModal } from '../../components/StudioModal';
import { useAppStore } from '../../context/AppStoreContext';
import { PRINT_GUIDES, type GuideCategory, type PrintGuide } from '../../data/guides';
import { SERVICE_BY_ID } from '../../data/services';

type FilterTab = 'All Blog' | GuideCategory;

const BLOG_TABS: readonly FilterTab[] = ['All Blog', 'Design', 'Printing', 'Keepsakes'];

export function BlogPage() {
  const { openInquiryChat, isAuthenticated, openSignInPrompt } = useAppStore();
  const [activeTab, setActiveTab] = useState<FilterTab>('All Blog');
  const [selectedGuide, setSelectedGuide] = useState<PrintGuide | null>(null);

  const visibleGuides =
    activeTab === 'All Blog'
      ? PRINT_GUIDES
      : PRINT_GUIDES.filter((guide) => guide.category === activeTab);

  function openGuide(guide: PrintGuide) {
    if (!isAuthenticated) {
      openSignInPrompt();
      return;
    }
    setSelectedGuide(guide);
  }

  function closeGuide() {
    setSelectedGuide(null);
  }

  return (
    <div>
      <div className="py-14 sm:py-16 lg:py-[4.375rem]">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          <div className="printula-rise mx-auto max-w-xl text-center">
            <h1 className="heading-style-h1">
              Insights from the print studio
            </h1>

            <div
              className="printula-rise printula-delay-1 mt-7 flex flex-wrap items-center justify-center gap-2"
              role="tablist"
              aria-label="Filter print guides by topic"
            >
              {BLOG_TABS.map((tab) => {
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-transparent bg-[#38BDF8] text-black'
                        : 'border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink-muted)] hover:border-[#BAE6FD] hover:text-black'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          <ScrollReveal>
            <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {visibleGuides.map((guide, idx) => {
                const service = SERVICE_BY_ID[guide.serviceId];
                return (
                  <ScrollReveal key={guide.id} delayMs={(idx % 3) * 70}>
                    <article className="group flex flex-col">
                      <button
                        type="button"
                        onClick={() => openGuide(guide)}
                        className="text-left cursor-pointer"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] transition-colors group-hover:border-[#BAE6FD]">
                          {guide.photoSrc ? (
                            <img
                              src={guide.photoSrc}
                              alt={guide.photoAlt ?? guide.title}
                              className="printula-card-media h-full w-full object-cover"
                            />
                          ) : (
                            <div className="printula-card-media flex h-full w-full items-center justify-center p-4">
                              <ServiceArtwork
                                serviceId={guide.serviceId}
                                pastelHex={service?.pastelHex}
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                          <span className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-1 font-medium text-[var(--ink-muted)] transition-colors group-hover:border-[#BAE6FD] group-hover:bg-[#38BDF8] group-hover:text-black">
                            {guide.category}
                          </span>
                          <span className="text-[var(--ink-muted)]">{guide.readTime}</span>
                        </div>

                        <h2 className="heading-style-h6 mt-3 group-hover:underline">
                          {guide.title}
                        </h2>
                      </button>
                    </article>
                  </ScrollReveal>
                );
              })}
            </div>
          </ScrollReveal>
        </div>
      </div>

      <ScrollReveal>
        <CtaBanner />
      </ScrollReveal>

      {/* Print Guide Modal */}
      <StudioModal
        open={Boolean(selectedGuide)}
        onClose={closeGuide}
        title={selectedGuide?.title ?? 'Print Guide'}
        variant="drawer"
        widthClass="max-w-[32rem]"
      >
        {selectedGuide && (
          <div className="space-y-5">
            <span className="inline-block text-xs font-medium text-[var(--ink-muted)]">
              {selectedGuide.category} · {selectedGuide.readTime}
            </span>

            <p className="text-sm leading-6 text-[var(--ink-muted)]">
              {selectedGuide.summary}
            </p>

            <ul className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-black">
              {selectedGuide.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 leading-6">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#38BDF8]" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const sid = selectedGuide.serviceId;
                  closeGuide();
                  openInquiryChat(sid);
                }}
                className="btn-lime-clean flex-1"
              >
                Inquire About {SERVICE_BY_ID[selectedGuide.serviceId]?.serviceName ?? 'Service'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={closeGuide} className="btn-printula-soft">
                Close
              </button>
            </div>
          </div>
        )}
      </StudioModal>
    </div>
  );
}
