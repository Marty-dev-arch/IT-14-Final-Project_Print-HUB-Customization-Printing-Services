import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Quote, Star } from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';
import type { CustomerReview } from '../types/domain';
import { ScrollReveal } from './ScrollReveal';

const REVIEWS_STORAGE_KEY = 'rjhub_reviews_v1';

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'RJ';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function readStoredReviews(): CustomerReview[] {
  try {
    const raw = window.localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is CustomerReview => Boolean(r && !r.isSample));
  } catch {
    return [];
  }
}

export function ReviewSlider() {
  const { customerSession } = useAppStore();
  const [reviews, setReviews] = useState<CustomerReview[]>(() => readStoredReviews());
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [author, setAuthor] = useState(() => customerSession?.fullName ?? '');
  const [quote, setQuote] = useState('');
  const [rating, setRating] = useState(5);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (customerSession?.fullName) {
      setAuthor(customerSession.fullName);
    }
  }, [customerSession]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom')) return;
    fetch('/api/reviews')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { reviews?: CustomerReview[] } | null) => {
        if (data?.reviews) {
          setReviews(data.reviews);
          try {
            window.localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(data.reviews));
          } catch {
            // Ignore storage errors
          }
        }
      })
      .catch(() => {
        // Keep local cache when backend is unreachable
      });
  }, []);

  const total = reviews.length;

  function handlePrev() {
    if (total === 0) return;
    setSelectedId(null);
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }

  function handleNext() {
    if (total === 0) return;
    setSelectedId(null);
    setActiveIndex((prev) => (prev + 1) % total);
  }

  async function handleAddReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanAuthor = author.trim();
    const cleanQuote = quote.trim();
    if (cleanAuthor.length < 2) {
      setFormError('Please enter your name.');
      return;
    }
    if (cleanQuote.length < 8) {
      setFormError('Please write a short review message.');
      return;
    }

    const roleLabel = 'Verified Customer';
    let created: CustomerReview = {
      id: `rev-${Date.now()}`,
      author: cleanAuthor,
      initials: computeInitials(cleanAuthor),
      role: roleLabel,
      quote: cleanQuote,
      rating,
      avatarUrl: customerSession?.avatarDataUrl,
      createdAt: new Date().toISOString(),
    };

    if (!(typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))) {
      setSubmitting(true);
      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: cleanAuthor,
            role: roleLabel,
            quote: cleanQuote,
            rating,
            avatarUrl: customerSession?.avatarDataUrl,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { review?: CustomerReview };
          if (data.review) created = data.review;
        }
      } catch {
        // Fallback to local state when offline
      } finally {
        setSubmitting(false);
      }
    }

    const nextReviews = [created, ...reviews];
    setReviews(nextReviews);
    try {
      window.localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(nextReviews));
    } catch {
      // Ignore storage quota errors in restricted contexts
    }

    setActiveIndex(0);
    setSelectedId(created.id);
    setAuthor(customerSession?.fullName ?? '');
    setQuote('');
    setRating(5);
    setFormError(null);
    setIsAdding(false);
  }

  const defaultLeadId = reviews[activeIndex]?.id ?? '';
  const highlightedId = hoveredId ?? selectedId ?? defaultLeadId;
  const selectedIndex = selectedId ? reviews.findIndex((item) => item.id === selectedId) : -1;
  const currentNumber = total > 0 ? Math.max(1, (selectedIndex >= 0 ? selectedIndex : activeIndex) + 1) : 0;
  const progressWidth = total > 0 ? `${(currentNumber / total) * 100}%` : '0%';

  return (
    <section className="bg-[var(--paper)] py-14 sm:py-16 lg:py-[4.375rem]">
      <ScrollReveal>
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-end">
            <h2 className="heading-style-h2 max-w-lg text-center sm:text-left">
              Customer reviews and success stories
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsAdding((prev) => {
                  const next = !prev;
                  if (next && customerSession?.fullName) {
                    setAuthor(customerSession.fullName);
                  }
                  return next;
                });
                setFormError(null);
              }}
              className="btn-printula shrink-0"
            >
              {isAdding ? 'Close Form' : 'Add a Review'}
            </button>
          </div>

          {isAdding && (
            <form
              onSubmit={handleAddReview}
              noValidate
              className="mt-8 rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] p-6 sm:p-[1.875rem]"
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="review-author" className="text-size-regular is-black-900">
                  Your Name
                </label>
                <input
                  id="review-author"
                  type="text"
                  maxLength={80}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your full name"
                  className="h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-5 py-2 text-base text-black placeholder:text-[var(--ink-subtle)]"
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-size-regular is-black-900">Rating</span>
                <div className="flex items-center gap-1" role="group" aria-label="Select star rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                      aria-pressed={rating === value}
                      className="rounded-md p-1 cursor-pointer"
                    >
                      <Star
                        className={`h-5 w-5 transition-colors ${
                          value <= rating
                            ? 'fill-[#FFB731] text-[#FFB731]'
                            : 'fill-[#E2E2E2] text-[#E2E2E2]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <label htmlFor="review-quote" className="text-size-regular is-black-900">
                  Your Review
                </label>
                <textarea
                  id="review-quote"
                  rows={3}
                  maxLength={400}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  placeholder="Share your experience with RJ HUB Printing..."
                  className="w-full rounded-[10px] border border-[var(--line)] bg-[var(--paper)] px-5 py-3 text-base text-black placeholder:text-[var(--ink-subtle)]"
                />
              </div>

              {formError && <p className="mt-3 text-xs font-medium text-[#A3003D]">{formError}</p>}

              <div className="mt-5">
                <button type="submit" disabled={submitting} className="btn-printula">
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          )}

          {total === 0 ? (
            <div className="mt-10 rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] px-6 py-12 text-center">
              <p className="text-base font-medium text-black">No customer reviews yet.</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Click Add a Review above to publish your feedback.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {reviews.slice(0, Math.min(3, total)).map((_, offset) => {
                  const itemIndex = (activeIndex + offset) % total;
                  const review = reviews[itemIndex];
                  if (!review) return null;
                  const isHighlighted = review.id === highlightedId;
                  const starCount = review.rating ?? 5;

                  return (
                    <button
                      key={`${review.id}-${itemIndex}`}
                      type="button"
                      data-active={isHighlighted ? 'true' : 'false'}
                      aria-pressed={isHighlighted}
                      onMouseEnter={() => setHoveredId(review.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedId(review.id)}
                      className="printula-review-card group flex min-h-[270px] w-full flex-col justify-between p-7 text-left cursor-pointer"
                    >
                      <span className="block">
                        <span className="flex items-center gap-1" aria-label={`${starCount} out of 5 stars`}>
                          {Array.from({ length: 5 }).map((__, starIdx) => (
                            <Star
                              key={starIdx}
                              className={`h-4 w-4 ${
                                starIdx < starCount
                                  ? 'printula-review-star'
                                  : 'fill-[#EFEFEF] text-[#EFEFEF]'
                              }`}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                        <span className="text-size-regular mt-5 block">{review.quote}</span>
                      </span>

                      <span className="mt-8 flex w-full items-end justify-between gap-3">
                        <span className="flex items-center gap-3">
                          {(() => {
                            const displayAvatar =
                              review.avatarUrl ||
                              (customerSession?.avatarDataUrl &&
                              review.author.trim().toLowerCase() ===
                                customerSession.fullName.trim().toLowerCase()
                                ? customerSession.avatarDataUrl
                                : undefined);
                            return displayAvatar ? (
                              <img
                                src={displayAvatar}
                                alt={review.author}
                                className="h-11 w-11 shrink-0 rounded-full border border-[var(--line)] object-cover"
                              />
                            ) : (
                              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-soft)] text-xs font-semibold text-black">
                                {review.initials}
                              </span>
                            );
                          })()}
                          <span className="block">
                            <span className="heading-style-h6 block">{review.author}</span>
                            <span className="block text-[11px] text-[var(--ink-subtle)]">
                              {review.role === 'Google Signed-In Client'
                                ? 'Verified Customer'
                                : review.role}
                            </span>
                          </span>
                        </span>
                        <Quote className="printula-review-quote h-7 w-7 shrink-0" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {total > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous review"
                    className="inline-flex h-9 w-16 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] transition-colors duration-200 hover:border-[#BAE6FD] hover:bg-[#38BDF8] hover:text-black cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="flex items-center gap-2.5">
                    <span className="font-sans text-sm font-medium text-black tabular-nums">
                      {String(currentNumber).padStart(2, '0')}
                    </span>
                    <div className="h-[2px] w-16 overflow-hidden bg-[var(--line)]">
                      <div
                        className="h-full bg-[#CBA3FF] transition-all duration-300"
                        style={{ width: progressWidth }}
                      />
                    </div>
                    <span className="font-sans text-sm font-medium text-[var(--ink-subtle)] tabular-nums">
                      {String(total).padStart(2, '0')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next review"
                    className="inline-flex h-9 w-16 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] transition-colors duration-200 hover:border-[#BAE6FD] hover:bg-[#38BDF8] hover:text-black cursor-pointer"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
}
