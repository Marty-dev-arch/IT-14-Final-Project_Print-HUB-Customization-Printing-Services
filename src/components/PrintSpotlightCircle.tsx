import { useEffect, useState } from 'react';
import { SERVICES } from '../data/services';
import { ServiceArtwork } from './ServiceArtwork';

const SPOTLIGHT_IDS = new Set([
  'lamination',
  'souvenir-making',
  'document-printing',
  'refrigerator-magnets',
  'laser-engraving',
  'mug-customization',
]);

const SPOTLIGHT_SERVICES = SERVICES.filter((service) => SPOTLIGHT_IDS.has(service.id));

const CIRCLE_SWATCHES = ['#BAE6FD', '#E0F2FE', '#FFE73D', '#E0F2FE', '#BAE6FD', '#E0F2FE'] as const;

/**
 * Printula-style 1-second circular hero showcase:
 * crossfades studio product mockups every 1000ms with no text overlay.
 */
export function PrintSpotlightCircle({ className = '' }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || SPOTLIGHT_SERVICES.length === 0) return;
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % SPOTLIGHT_SERVICES.length);
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const activeCircleBg = CIRCLE_SWATCHES[index % CIRCLE_SWATCHES.length] ?? '#BAE6FD';

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`relative mx-auto flex h-[19.5rem] w-[19.5rem] items-center justify-center rounded-full transition-colors duration-500 sm:h-[25rem] sm:w-[25rem] lg:h-[28.125rem] lg:w-[28.125rem] ${className}`}
      style={{ backgroundColor: activeCircleBg }}
      aria-label="Animated custom print product showcase"
      role="img"
    >
      {SPOTLIGHT_SERVICES.map((service, itemIndex) => {
        const isActive = itemIndex === index;
        return (
          <div
            key={service.id}
            aria-hidden={!isActive}
            className={`absolute inset-0 flex items-center justify-center p-10 transition-[opacity,transform] duration-500 ease-out sm:p-12 ${
              isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <ServiceArtwork
              serviceId={service.id}
              pastelHex={service.pastelHex}
              className="h-full max-h-[260px] w-auto object-contain"
            />
          </div>
        );
      })}
    </div>
  );
}
