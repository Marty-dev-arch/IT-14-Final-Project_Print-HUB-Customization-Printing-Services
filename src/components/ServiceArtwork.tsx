import { ArrowUpRight, Heart } from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';
import type { ServiceAccent, ServiceItem } from '../types/domain';

interface ServiceArtworkProps {
  serviceId: string;
  accent?: ServiceAccent;
  pastelHex?: string;
  className?: string;
}

const DEFAULT_PASTEL: Record<string, string> = {
  lamination: '#8BF2FF',
  'souvenir-making': '#CBA3FF',
  'document-printing': '#FFE73D',
  'refrigerator-magnets': '#94BDFF',
  'laser-engraving': '#FFB731',
  'mug-customization': '#E0F2FE',
};

export function ServiceArtwork({ serviceId, pastelHex, className = '' }: ServiceArtworkProps) {
  const stageTint = pastelHex ?? DEFAULT_PASTEL[serviceId] ?? '#38BDF8';

  return (
    <svg
      viewBox="0 0 260 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-auto w-full ${className}`}
      role="img"
      aria-hidden="true"
    >
      {/* Lamination: Printula-inspired angled standing poster/certificate frame */}
      {serviceId === 'lamination' && (
        <g>
          <ellipse cx="132" cy="252" rx="72" ry="10" fill="#000000" fillOpacity="0.1" />
          <g transform="translate(48 20)">
            {/* Frame thickness */}
            <polygon points="18,12 162,24 162,226 18,214" fill="#D4D4D4" />
            {/* Front white wood frame */}
            <polygon points="10,12 154,24 154,226 10,214" fill="#FEFEFE" stroke="#E0E0E0" strokeWidth="1.5" />
            {/* Inner sheet */}
            <polygon points="24,28 140,38 140,210 24,200" fill="#FFFFFF" stroke="#ECECEC" strokeWidth="1" />
            <text
              x="82"
              y="98"
              textAnchor="middle"
              fill="#FF6A3D"
              fontFamily="Inter, sans-serif"
              fontSize="30"
              fontWeight="800"
              letterSpacing="-0.03em"
            >
              PRINT
            </text>
            <text
              x="82"
              y="129"
              textAnchor="middle"
              fill="#FF6A3D"
              fontFamily="Inter, sans-serif"
              fontSize="30"
              fontWeight="800"
              letterSpacing="-0.03em"
            >
              SEAL
            </text>
            <text
              x="82"
              y="162"
              textAnchor="middle"
              fill="#151515"
              fontFamily="Inter, sans-serif"
              fontSize="16"
              fontWeight="700"
              letterSpacing="0.04em"
            >
              MOCKUP
            </text>
            {/* Glossy lamination film diagonal sheen */}
            <polygon points="36,30 72,33 44,202 24,200" fill={stageTint} fillOpacity="0.22" />
            <path d="M52 178h60" stroke="#EAEAEA" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* Souvenir Making: Printula-inspired stacked 3D emerald & lime souvenir boxes */}
      {serviceId === 'souvenir-making' && (
        <g>
          <ellipse cx="130" cy="236" rx="88" ry="12" fill="#000000" fillOpacity="0.12" />
          {/* Bottom Lime Gift Box */}
          <g transform="translate(26 146)">
            <polygon points="10,24 104,2 204,26 108,52" fill="#A6F038" />
            <polygon points="10,24 108,52 108,92 10,64" fill="#38BDF8" />
            <polygon points="108,52 204,26 204,66 108,92" fill="#77CA0A" />
            <polygon points="108,52 204,26 204,35 108,61" fill="#5FA306" fillOpacity="0.35" />
            <text
              x="156"
              y="108"
              textAnchor="middle"
              fill="#11382B"
              fontFamily="Inter, sans-serif"
              fontSize="11.5"
              fontWeight="700"
              transform="skewY(-14)"
            >
              RJ HUB
            </text>
          </g>
          {/* Top Emerald Gift Box */}
          <g transform="translate(30 72)">
            <polygon points="12,30 100,4 198,28 110,56" fill="#1F6F54" />
            <polygon points="12,30 110,56 110,104 12,76" fill="#134E3A" />
            <polygon points="110,56 198,28 198,76 110,104" fill="#0C3829" />
            {/* Lid seam */}
            <polyline points="12,42 110,68 198,40" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.65" fill="none" />
            <text
              x="154"
              y="112"
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="Inter, sans-serif"
              fontSize="10.5"
              fontWeight="700"
              letterSpacing="0.03em"
              transform="skewY(-15)"
            >
              SOUVENIR
            </text>
          </g>
        </g>
      )}

      {/* Document Printing: Printula-inspired standing 3D bound reports / booklets */}
      {serviceId === 'document-printing' && (
        <g>
          <ellipse cx="130" cy="248" rx="84" ry="11" fill="#000000" fillOpacity="0.1" />
          {/* Left Standing Cyan Booklet */}
          <g transform="translate(26 36)">
            <rect x="0" y="6" width="96" height="196" rx="4" fill="#FEFEFE" stroke="#E0E0E0" strokeWidth="1.2" />
            <rect x="0" y="6" width="38" height="196" rx="3" fill="#63DDF0" />
            <text
              x="66"
              y="68"
              textAnchor="middle"
              fill="#151515"
              fontFamily="Inter, sans-serif"
              fontSize="15"
              fontWeight="800"
              letterSpacing="-0.02em"
            >
              PRINT
            </text>
            <path d="M50 114h34M50 124h28M50 134h32M50 144h22" stroke="#151515" strokeWidth="2.4" strokeLinecap="round" />
            <text
              x="19"
              y="148"
              textAnchor="middle"
              fill="#0B3B45"
              fontFamily="Inter, sans-serif"
              fontSize="9"
              fontWeight="700"
              transform="rotate(-90 19 148)"
            >
              RJ HUB DOCS
            </text>
          </g>

          {/* Right Perspective Standing Report */}
          <g transform="translate(136 52)">
            {/* Dark side edge */}
            <polygon points="82,12 96,18 96,182 82,186" fill="#2A2A2A" />
            {/* Front angled cover */}
            <polygon points="0,0 82,12 82,186 0,180" fill="#FFFFFF" stroke="#DCDCDC" strokeWidth="1.2" />
            <polygon points="0,0 26,4 26,182 0,180" fill={stageTint} />
            <text
              x="53"
              y="60"
              textAnchor="middle"
              fill="#151515"
              fontFamily="Inter, sans-serif"
              fontSize="13"
              fontWeight="800"
            >
              FOLIO
            </text>
            <path d="M36 96h34M36 106h26M36 116h30" stroke="#676767" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* Refrigerator Magnets: Printula-inspired floating angled purple cards */}
      {serviceId === 'refrigerator-magnets' && (
        <g>
          <ellipse cx="132" cy="240" rx="74" ry="10" fill="#000000" fillOpacity="0.1" />
          {/* Lower lighter lavender magnet */}
          <g transform="translate(46 132) rotate(-14)">
            <rect x="0" y="0" width="150" height="96" rx="10" fill="#A99DF5" />
            <circle cx="122" cy="28" r="24" fill="#FFFFFF" fillOpacity="0.12" />
            <text
              x="16"
              y="66"
              fill="#FFFFFF"
              fontFamily="Inter, sans-serif"
              fontSize="12.5"
              fontWeight="700"
            >
              Fridge Magnet
            </text>
            <text
              x="16"
              y="82"
              fill="#FFFFFF"
              fillOpacity="0.92"
              fontFamily="Inter, sans-serif"
              fontSize="11"
              fontWeight="500"
            >
              Glossy Pack
            </text>
          </g>

          {/* Upper deep violet focal magnet */}
          <g transform="translate(64 46) rotate(8)">
            <rect x="0" y="0" width="154" height="98" rx="10" fill="#6F5CEB" />
            <circle cx="130" cy="74" r="30" fill="#FFFFFF" fillOpacity="0.1" />
            <text
              x="16"
              y="34"
              fill="#FFFFFF"
              fontFamily="Inter, sans-serif"
              fontSize="12.5"
              fontWeight="700"
            >
              Custom Magnet
            </text>
            <text
              x="16"
              y="52"
              fill="#E0F2FE"
              fontFamily="Inter, sans-serif"
              fontSize="11.5"
              fontWeight="600"
            >
              Full Color Print
            </text>
            <rect x="122" y="16" width="18" height="18" rx="4.5" fill="#38BDF8" />
          </g>
        </g>
      )}

      {/* Laser Engraving: Clean 3D engraved walnut plaque + brass keepsake badge */}
      {serviceId === 'laser-engraving' && (
        <g>
          <ellipse cx="132" cy="242" rx="78" ry="11" fill="#000000" fillOpacity="0.12" />
          <g transform="translate(36 42)">
            {/* Depth bevel */}
            <polygon points="18,16 176,30 176,188 18,176" fill="#0A0A0A" />
            {/* Front Slate / Walnut Plaque */}
            <polygon points="10,16 168,30 168,188 10,176" fill="#212121" stroke="#3B3B3B" strokeWidth="1.5" />
            {/* Engraved gold/lime border */}
            <polygon
              points="24,32 154,44 154,172 24,162"
              fill="none"
              stroke={stageTint}
              strokeWidth="1.8"
              strokeOpacity="0.85"
            />
            <circle cx="89" cy="84" r="22" stroke="#38BDF8" strokeWidth="2" />
            <path d="M89 70l12 14-12 14-12-14 12-14z" stroke="#FEFEFE" strokeWidth="1.6" />
            <text
              x="89"
              y="132"
              textAnchor="middle"
              fill="#FEFEFE"
              fontFamily="Inter, sans-serif"
              fontSize="13"
              fontWeight="700"
              letterSpacing="0.06em"
            >
              ENGRAVED
            </text>
            <path d="M58 144h62" stroke={stageTint} strokeWidth="2.4" strokeLinecap="round" />
            {/* Live laser beam highlight */}
            <line x1="126" y1="0" x2="126" y2="54" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="126" cy="54" r="5" fill="#38BDF8" />
          </g>
        </g>
      )}

      {/* Mug Customization: Clean 3D studio ceramic mug & vibrant tote/gift accent */}
      {serviceId === 'mug-customization' && (
        <g>
          <ellipse cx="130" cy="240" rx="76" ry="11" fill="#000000" fillOpacity="0.11" />
          {/* Background Lime Keepsake Pouch */}
          <g transform="translate(120 34) rotate(7)">
            <path d="M24 22c0-24 44-24 44 0" stroke="#188C6F" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <rect x="6" y="22" width="82" height="106" rx="8" fill="#38BDF8" stroke="#151515" strokeWidth="1.4" />
            <circle cx="47" cy="72" r="16" fill="#FFFFFF" fillOpacity="0.45" />
          </g>

          {/* Foreground 3D White Ceramic Mug */}
          <g transform="translate(36 86)">
            {/* Handle */}
            <path
              d="M116 34h20c14 0 23 11 23 28s-9 29-23 29h-20"
              stroke="#151515"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M116 34h20c14 0 23 11 23 28s-9 29-23 29h-20"
              stroke="#F5F5F5"
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Mug body */}
            <path
              d="M12 20h108v96c0 14-12 24-28 24H40c-16 0-28-10-28-24V20z"
              fill="#FFFFFF"
              stroke="#D4D4D4"
              strokeWidth="1.5"
            />
            {/* Top rim opening */}
            <ellipse cx="66" cy="20" rx="54" ry="10" fill="#F0F0F0" stroke="#D4D4D4" strokeWidth="1.5" />
            {/* Full-color custom sublimation wrap */}
            <rect x="18" y="42" width="96" height="68" rx="6" fill="#8BF2FF" fillOpacity="0.32" />
            <circle cx="48" cy="76" r="20" fill="#CBA3FF" fillOpacity="0.88" />
            <circle cx="78" cy="72" r="22" fill={stageTint} fillOpacity="0.92" />
            <text
              x="66"
              y="79"
              textAnchor="middle"
              fill="#151515"
              fontFamily="Inter, sans-serif"
              fontSize="12"
              fontWeight="800"
              letterSpacing="0.03em"
            >
              RJ HUB
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

export function PrintulaServiceCard({
  service,
  onCustomize,
}: {
  service: ServiceItem;
  onCustomize?: (serviceId: string) => void;
}) {
  const { openInquiryChat, favoriteServiceIds, toggleFavoriteService, isAuthenticated, openSignInPrompt } =
    useAppStore();
  const isFavorite = favoriteServiceIds.includes(service.id);

  const handlePrimaryAction = () => {
    if (!isAuthenticated) {
      openSignInPrompt();
      return;
    }
    if (onCustomize) {
      onCustomize(service.id);
    } else {
      openInquiryChat(service.id);
    }
  };

  return (
    <article className="printula-service-card group w-full">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <h3 className="heading-style-h6">
            {service.serviceName}
          </h3>
          <p className="mt-1.5 text-sm font-semibold text-black tabular-nums">
            {service.pricePhp}
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)] tabular-nums">
            {service.reservationFeePhp}
            {service.sizeNote ? ` · ${service.sizeNote}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleFavoriteService(service.id)}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite
              ? `Remove ${service.serviceName} from favorites`
              : `Add ${service.serviceName} to favorites`
          }
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer ${
            isFavorite
              ? 'border-transparent bg-[#38BDF8] text-black'
              : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-muted)] hover:border-[#BAE6FD] hover:text-black'
          }`}
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? 'fill-black text-black' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <button
        type="button"
        onClick={handlePrimaryAction}
        aria-label={
          onCustomize
            ? `Customize ${service.serviceName} in 3D`
            : `Inquire about ${service.serviceName}`
        }
        className="mt-4 flex flex-1 w-full items-center justify-center pt-2 text-left cursor-pointer"
      >
        {service.imageSrc ? (
          <div className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-[#EAEAEA] bg-white">
            <img
              src={service.imageSrc}
              alt={service.serviceName}
              className="printula-card-media h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="printula-card-media w-full max-w-[230px]">
            <ServiceArtwork serviceId={service.id} pastelHex={service.pastelHex} />
          </div>
        )}
      </button>

      {/* Printula signature bottom-right inverted notch + pop-in lime arrow tile */}
      <div className="printula-service-notch" aria-hidden="true">
        <svg
          width="81"
          height="81"
          viewBox="0 0 81 81"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          <path
            d="M10.125 70.875C10.125 76.4669 5.59188 81 0 81H81V0C81 5.59188 76.4669 10.125 70.875 10.125H20.25C14.6581 10.125 10.125 14.6581 10.125 20.25V70.875Z"
            fill="#EAEAEA"
          />
          <path
            d="M11 71C11 76.5229 6.52285 81 1 81H81V1C81 6.52285 76.5229 11 71 11H21C15.4772 11 11 15.4772 11 21V71Z"
            fill="#FEFEFE"
          />
        </svg>
        <span className="printula-service-arrow">
          <ArrowUpRight className="h-7 w-7 stroke-[2]" />
        </span>
      </div>
    </article>
  );
}
