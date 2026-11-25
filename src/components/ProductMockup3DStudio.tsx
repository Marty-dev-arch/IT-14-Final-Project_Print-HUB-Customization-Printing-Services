import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Minus,
  Paperclip,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../context/AppStoreContext';
import { removeImageBackground, renderMockupSnapshot } from '../lib/mockupCanvas';
import type {
  Studio3DConfig,
  TextOrientation,
  TextPlacementSide,
} from '../lib/studio3dTextures';
import type { ServiceItem } from '../types/domain';
import { Studio3DCanvas, type Studio3DCanvasHandle } from './Studio3DCanvas';

interface ProductMockup3DStudioProps {
  selectedServiceId: string;
  onSelectService: (serviceId: string) => void;
}

interface SizeOption {
  id: string;
  label: string;
  dimLabel: string;
}

const SIZE_OPTIONS_BY_SERVICE: Record<string, readonly SizeOption[]> = {
  lamination: [
    { id: 'a4', label: 'A4 Laminate', dimLabel: '210 × 297 mm · 250 mic' },
    { id: 'short', label: 'Short Bond', dimLabel: '8.5 × 11 in · 250 mic' },
    { id: 'id', label: 'ID Card', dimLabel: '54 × 86 mm · Heavy Seal' },
  ],
  'souvenir-making': [
    { id: 'medal', label: '2.5 in Medal', dimLabel: '6.3 cm Face · Ribbon' },
    { id: 'box', label: 'Favor Box', dimLabel: '10 × 10 cm · Keepsake' },
  ],
  'document-printing': [
    { id: '2x2', label: '2×2 ID', dimLabel: '2 × 2 in · 6 pcs / sheet' },
    { id: '4x4', label: '4×4 Photo', dimLabel: '4 × 4 in · Glossy / Matte' },
    { id: '8x8', label: '8×8 Square', dimLabel: '8 × 8 in · Gallery Print' },
    { id: 'a4', label: 'A4 Paper', dimLabel: '210 × 297 mm · Bond Print' },
    { id: 'short', label: 'Short Bond', dimLabel: '8.5 × 11 in · Letter' },
  ],
  'sintra-board': [
    { id: 'a4', label: 'A4 Board', dimLabel: '210 × 297 mm · 5 mm Sintra' },
    { id: '8x10', label: '8×10 in', dimLabel: '8 × 10 in · Rigid Display' },
    { id: 'a3', label: 'A3 Board', dimLabel: '297 × 420 mm · Wall Size' },
  ],
  'laser-engraving': [
    { id: 'pen', label: 'Bamboo Pen', dimLabel: '14 × 1.1 cm · Etched' },
    { id: 'plaque', label: 'Wood Plaque', dimLabel: '6 × 8 in · Laser Etched' },
    { id: 'brush', label: 'Bamboo Brush', dimLabel: '20 × 6.5 cm · Handle' },
  ],
  'mug-customization': [
    { id: '11oz', label: '11 oz Mug', dimLabel: '8 × 9.5 cm · Ceramic' },
    { id: '15oz', label: '15 oz Mug', dimLabel: '8.5 × 11.5 cm · Ceramic' },
  ],
  'custom-keychains': [
    { id: 'rect', label: '3.2 × 8.2 cm', dimLabel: 'Acrylic Insert · 2 Sides' },
    { id: 'square', label: '4 × 4 cm', dimLabel: 'Clear Acrylic · Split Ring' },
  ],
  'a4-calendar': [
    { id: 'a4', label: 'A4 Wall', dimLabel: '210 × 297 mm · Photo Top' },
    { id: 'a3', label: 'A3 Wall', dimLabel: '297 × 420 mm · Wall Grid' },
  ],
  'refrigerator-magnets': [
    { id: 'standard', label: '2.7 × 3.5 in', dimLabel: 'Clear Acrylic · Magnet Back' },
    { id: 'medium', label: '3 × 4 in', dimLabel: 'Full-Color Magnet Block' },
  ],
};

const FONT_STYLES = [
  'Inter',
  'Georgia',
  'Courier New',
  'Trebuchet MS',
  'Impact',
  'Brush Script MT',
] as const;

export function ProductMockup3DStudio({
  selectedServiceId,
  onSelectService,
}: ProductMockup3DStudioProps) {
  const { services, openInquiryChat, isAuthenticated, openSignInPrompt } = useAppStore();

  const activeIndex = Math.max(
    0,
    services.findIndex((item) => item.id === selectedServiceId),
  );
  const activeService: ServiceItem = services[activeIndex] ?? services[0]!;
  const sizeOptions =
    SIZE_OPTIONS_BY_SERVICE[activeService.id] ?? SIZE_OPTIONS_BY_SERVICE['sintra-board']!;

  const [sizeId, setSizeId] = useState(sizeOptions[0]!.id);
  const [viewTarget, setViewTarget] = useState<'front' | 'back' | 'reset'>('reset');
  const [viewNonce, setViewNonce] = useState(0);
  const [isShowingBack, setIsShowingBack] = useState(false);

  const [uploadedSrc, setUploadedSrc] = useState<string | null>(null);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  const [zoom, setZoom] = useState(100);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);

  // Universal text & free placement customization across all services
  const [customText, setCustomText] = useState('');
  const [fontStyle, setFontStyle] = useState<string>(FONT_STYLES[0]);
  const [textSize, setTextSize] = useState(18);
  const [textColor, setTextColor] = useState<'#151515' | '#FFFFFF'>('#151515');
  const [textX, setTextX] = useState(0);
  const [textY, setTextY] = useState(28);
  const [textOrientation, setTextOrientation] = useState<TextOrientation>('horizontal');
  const [textSide, setTextSide] = useState<TextPlacementSide>('both');

  // Product-specific finish modes
  const [printColorMode, setPrintColorMode] = useState<'color' | 'bw'>('color');
  const [photoBordered, setPhotoBordered] = useState(true);
  const [laminationFinish, setLaminationFinish] = useState<'Glossy' | 'Matte'>('Glossy');
  const [quantity, setQuantity] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvas3dRef = useRef<Studio3DCanvasHandle>(null);

  useEffect(() => {
    const nextSizes = SIZE_OPTIONS_BY_SERVICE[activeService.id] ?? [];
    if (nextSizes.length > 0) {
      setSizeId(nextSizes[0]!.id);
    }
    setViewTarget('reset');
    setViewNonce((n) => n + 1);
    setIsShowingBack(false);
    setPosX(0);
    setPosY(0);
    setZoom(100);
  }, [activeService.id]);

  const selectedSize = useMemo(
    () => sizeOptions.find((item) => item.id === sizeId) ?? sizeOptions[0]!,
    [sizeOptions, sizeId],
  );

  const goPrevService = () => {
    const prevIdx = (activeIndex - 1 + services.length) % services.length;
    onSelectService(services[prevIdx]!.id);
  };

  const goNextService = () => {
    const nextIdx = (activeIndex + 1) % services.length;
    onSelectService(services[nextIdx]!.id);
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedSrc(reader.result);
        setProcessedSrc(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBackground = async () => {
    const source = uploadedSrc ?? activeService.imageSrc;
    if (!source) return;
    setIsRemovingBg(true);
    try {
      const cleaned = await removeImageBackground(source, 'transparent');
      setProcessedSrc(cleaned);
    } finally {
      setIsRemovingBg(false);
    }
  };

  const activeArtwork = processedSrc ?? uploadedSrc ?? activeService.imageSrc;

  const studio3dConfig = useMemo<Studio3DConfig>(
    () => ({
      serviceId: activeService.id,
      sizeId: selectedSize.id,
      artworkSrc: activeArtwork,
      zoom,
      posX,
      posY,
      customText,
      fontStyle,
      textSize,
      textColor,
      textX,
      textY,
      textOrientation,
      textSide,
      printColorMode,
      photoBordered,
      laminationFinish,
    }),
    [
      activeService.id,
      selectedSize.id,
      activeArtwork,
      zoom,
      posX,
      posY,
      customText,
      fontStyle,
      textSize,
      textColor,
      textX,
      textY,
      textOrientation,
      textSide,
      printColorMode,
      photoBordered,
      laminationFinish,
    ],
  );

  const buildSpecDraft = (): { text: string; summaryLine: string } => {
    const parts: string[] = [`Size: ${selectedSize.label} (${selectedSize.dimLabel})`];
    if (customText.trim() || activeService.id === 'laser-engraving') {
      parts.push(`Text: "${customText.trim() || 'RJ HUB'}"`);
      parts.push(`Font: ${fontStyle} ${textSize}pt`);
    }
    if (activeService.id === 'document-printing') {
      if (sizeId === '4x4' || sizeId === '8x8') {
        parts.push(photoBordered ? 'White border' : 'Borderless');
      } else if (sizeId !== '2x2') {
        parts.push(printColorMode === 'color' ? 'Full color' : 'Black & white');
      }
    } else if (activeService.id === 'lamination') {
      parts.push(`${laminationFinish} film`);
    }
    if (quantity > 1) {
      parts.push(`Qty: ${quantity} pcs`);
    }

    const summaryLine = parts.join(' · ');
    return {
      summaryLine,
      text: `3D Customizer Draft — ${activeService.serviceName} (${summaryLine}). Ready for review.`,
    };
  };

  const handleSendToChat = async () => {
    setIsExporting(true);
    try {
      const { text, summaryLine } = buildSpecDraft();
      const webglSnapshot = canvas3dRef.current?.captureSnapshot();
      const snapshot =
        webglSnapshot ??
        (await renderMockupSnapshot({
          serviceName: activeService.serviceName,
          sizeLabel: selectedSize.label,
          summaryLine,
          artworkSrc: activeArtwork,
          customText:
            activeService.id === 'laser-engraving'
              ? customText.trim() || 'RJ HUB'
              : customText.trim() || undefined,
          bgColor: '#FFFFFF',
          isIdSheet: activeService.id === 'document-printing' && sizeId === '2x2',
        }));
      openInquiryChat(activeService.id, {
        text,
        imageDataUrl: snapshot,
        quantity,
        serviceNames: [activeService.serviceName],
      });
    } finally {
      setIsExporting(false);
    }
  };

  const guardAuth = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!isAuthenticated) {
      event.preventDefault();
      event.stopPropagation();
      openSignInPrompt();
    }
  };

  return (
    <section
      aria-labelledby="studio-3d-heading"
      onClickCapture={guardAuth}
      onPointerDownCapture={guardAuth}
      onChangeCapture={guardAuth}
      className="rounded-2xl border border-[#EAEAEA] bg-[#FEFEFE] p-5 sm:p-7"
    >
      <div className="border-b border-[#EAEAEA] pb-4">
        <h2 id="studio-3d-heading" className="heading-style-h4 text-[#151515]">
          Customization Studio
        </h2>
        <p className="mt-1 text-sm text-[#525252]">
          Pick an item, choose size and print finish, then send to chat.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Expanded Solid Daylight Interactive WebGL 3D Stage */}
        <div className="lg:col-span-8">
          <div className="relative flex min-h-[30rem] sm:min-h-[34rem] lg:min-h-[38rem] flex-col justify-between overflow-hidden rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-4 sm:p-6">
            {/* Top Bar */}
            <div className="z-20 flex flex-wrap items-center justify-between gap-2 w-full">
              <div className="rounded-full border border-[#EAEAEA] bg-white px-3.5 py-1.5 text-xs font-medium text-[#151515]">
                {activeService.serviceName} · {selectedSize.dimLabel}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setViewTarget('front');
                    setViewNonce((n) => n + 1);
                  }}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    !isShowingBack
                      ? 'border-transparent bg-[#151515] text-white'
                      : 'border-[#EAEAEA] bg-white text-[#525252] hover:border-[#BAE6FD]'
                  }`}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewTarget('back');
                    setViewNonce((n) => n + 1);
                  }}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    isShowingBack
                      ? 'border-transparent bg-[#151515] text-white'
                      : 'border-[#EAEAEA] bg-white text-[#525252] hover:border-[#BAE6FD]'
                  }`}
                >
                  Back
                </button>
                <button
                  type="button"
                  aria-label="Reset 3D view"
                  onClick={() => {
                    setViewTarget('reset');
                    setViewNonce((n) => n + 1);
                    setZoom(100);
                    setPosX(0);
                    setPosY(0);
                    setTextX(0);
                    setTextY(28);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[#EAEAEA] bg-white text-[#525252] hover:border-[#BAE6FD] hover:text-black cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Middle Stage: Flanking Arrows + Real Three.js 3D Object */}
            <div className="relative flex flex-1 items-center justify-between gap-2 py-2">
              <button
                type="button"
                aria-label="Previous service"
                onClick={goPrevService}
                className="z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EAEAEA] bg-white text-[#151515] shadow-sm transition-colors hover:border-[#BAE6FD] hover:bg-[#38BDF8] cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="min-w-0 flex-1">
                <Studio3DCanvas
                  ref={canvas3dRef}
                  config={studio3dConfig}
                  viewTarget={viewTarget}
                  viewNonce={viewNonce}
                  onSideChange={setIsShowingBack}
                />
              </div>

              <button
                type="button"
                aria-label="Next service"
                onClick={goNextService}
                className="z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EAEAEA] bg-white text-[#151515] shadow-sm transition-colors hover:border-[#BAE6FD] hover:bg-[#38BDF8] cursor-pointer"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Bottom Stage Bar */}
            <div className="z-20 flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5">
                {services.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Select ${item.serviceName}`}
                    onClick={() => onSelectService(item.id)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      item.id === activeService.id
                        ? 'w-5 bg-[#151515]'
                        : 'w-2 bg-[#D4D4D4] hover:bg-[#858585]'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[11px] font-medium text-[#676767]">
                Drag to rotate 360° Front &amp; Back in 3D
              </p>
            </div>
          </div>
        </div>

        {/* Right: Minimal Direct Controls */}
        <div className="lg:col-span-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="heading-style-h5 text-[#151515]">{activeService.serviceName}</p>
              <span className="text-xs font-semibold text-[#525252] tabular-nums">
                {activeService.reservationFeePhp}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#151515] tabular-nums">
              {activeService.pricePhp}
            </p>
          </div>

          {/* Size Selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#525252]">Size</p>
            <div role="group" aria-label="Select print size" className="mt-2 flex flex-wrap gap-1.5">
              {sizeOptions.map((option) => {
                const active = option.id === selectedSize.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSizeId(option.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-transparent bg-[#38BDF8] text-black'
                        : 'border-[#EAEAEA] bg-[#FAFAFA] text-[#525252] hover:border-[#BAE6FD] hover:text-black'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Service Options */}
          {activeService.id === 'document-printing' && sizeId !== '2x2' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#525252]">
                Print Finish
              </p>
              {sizeId === 'a4' || sizeId === 'short' ? (
                <div className="mt-2 flex gap-2">
                  {(['color', 'bw'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPrintColorMode(mode)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        printColorMode === mode
                          ? 'border-transparent bg-[#151515] text-white'
                          : 'border-[#EAEAEA] bg-[#FAFAFA] text-[#525252]'
                      }`}
                    >
                      {mode === 'color' ? 'Full Color' : 'B&W'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  {[
                    { label: 'White Border', val: true },
                    { label: 'Borderless', val: false },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setPhotoBordered(opt.val)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        photoBordered === opt.val
                          ? 'border-transparent bg-[#151515] text-white'
                          : 'border-[#EAEAEA] bg-[#FAFAFA] text-[#525252]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeService.id === 'lamination' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#525252]">
                Film Finish
              </p>
              <div className="mt-2 flex gap-2">
                {(['Glossy', 'Matte'] as const).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    onClick={() => setLaminationFinish(finish)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                      laminationFinish === finish
                        ? 'border-transparent bg-[#151515] text-white'
                        : 'border-[#EAEAEA] bg-[#FAFAFA] text-[#525252]'
                    }`}
                  >
                    {finish}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Universal Add Text + Free Placement Controls */}
          <div className="space-y-3 rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-4">
            <div>
              <label htmlFor="custom-text-input" className="block text-xs font-semibold text-[#151515]">
                Add Text
              </label>
              <input
                id="custom-text-input"
                type="text"
                value={customText}
                maxLength={32}
                onChange={(event) => setCustomText(event.target.value)}
                placeholder={
                  activeService.id === 'laser-engraving'
                    ? 'Enter engraved name...'
                    : 'Optional label or name...'
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-sm text-[#151515]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="custom-font-select" className="block text-xs font-semibold text-[#151515]">
                  Font Style
                </label>
                <select
                  id="custom-font-select"
                  value={fontStyle}
                  onChange={(event) => setFontStyle(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#EAEAEA] bg-white px-2.5 text-xs text-[#151515]"
                >
                  {FONT_STYLES.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>
              <label className="text-xs font-semibold text-[#151515]">
                Text Size ({textSize}px)
                <input
                  type="range"
                  min={12}
                  max={44}
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="mt-2.5 w-full accent-[#151515]"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(['horizontal', 'vertical'] as const).map((orient) => (
                  <button
                    key={orient}
                    type="button"
                    aria-pressed={textOrientation === orient}
                    onClick={() => setTextOrientation(orient)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize cursor-pointer ${
                      textOrientation === orient
                        ? 'border-transparent bg-[#151515] text-white'
                        : 'border-[#EAEAEA] bg-white text-[#525252]'
                    }`}
                  >
                    {orient}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(['front', 'back', 'both'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={textSide === side}
                    onClick={() => setTextSide(side)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize cursor-pointer ${
                      textSide === side
                        ? 'border-transparent bg-[#38BDF8] text-black'
                        : 'border-[#EAEAEA] bg-white text-[#525252]'
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-[#525252]">
                Text X ({textX}%)
                <input
                  type="range"
                  aria-label="Text horizontal position"
                  min={-42}
                  max={42}
                  value={textX}
                  onChange={(e) => setTextX(Number(e.target.value))}
                  className="mt-1 w-full accent-[#151515]"
                />
              </label>
              <label className="text-[11px] font-medium text-[#525252]">
                Text Y ({textY}%)
                <input
                  type="range"
                  aria-label="Text vertical position"
                  min={-42}
                  max={42}
                  value={textY}
                  onChange={(e) => setTextY(Number(e.target.value))}
                  className="mt-1 w-full accent-[#151515]"
                />
              </label>
            </div>

            {activeService.id !== 'laser-engraving' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#525252]">Text Ink:</span>
                {[
                  { label: 'Dark', val: '#151515' as const },
                  { label: 'White', val: '#FFFFFF' as const },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setTextColor(c.val)}
                    className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium cursor-pointer ${
                      textColor === c.val
                        ? 'border-transparent bg-[#151515] text-white'
                        : 'border-[#EAEAEA] bg-white text-[#525252]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Photo Artwork Controls */}
          <div className="space-y-3 rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadChange}
                className="sr-only"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-white px-3 py-1.5 text-xs font-semibold text-[#151515] hover:bg-[#38BDF8] cursor-pointer"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                {uploadedSrc ? 'Replace Photo' : 'Upload Photo'}
              </button>
              <button
                type="button"
                disabled={isRemovingBg}
                onClick={handleRemoveBackground}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#151515] hover:border-[#BAE6FD] cursor-pointer disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                {isRemovingBg ? 'Removing...' : 'Remove BG'}
              </button>
              {(uploadedSrc || processedSrc) && (
                <button
                  type="button"
                  aria-label="Clear custom photo"
                  onClick={() => {
                    setUploadedSrc(null);
                    setProcessedSrc(null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[#525252] hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <label className="text-[11px] font-medium text-[#525252]">
                Zoom ({zoom}%)
                <input
                  type="range"
                  min={60}
                  max={180}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="mt-1 w-full accent-[#151515]"
                />
              </label>
              <label className="text-[11px] font-medium text-[#525252]">
                Offset X
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={posX}
                  onChange={(e) => setPosX(Number(e.target.value))}
                  className="mt-1 w-full accent-[#151515]"
                />
              </label>
              <label className="text-[11px] font-medium text-[#525252]">
                Offset Y
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={posY}
                  onChange={(e) => setPosY(Number(e.target.value))}
                  className="mt-1 w-full accent-[#151515]"
                />
              </label>
            </div>
          </div>

          {/* Quantity Control */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3">
            <div>
              <span className="block text-xs font-semibold text-[#151515]">Quantity</span>
              <span className="text-[11px] text-[#64748B] tabular-nums">{activeService.pricePhp}</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[#151515] hover:bg-[#F1F5F9] active:bg-[#E0F2FE] cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <input
                type="number"
                aria-label="Quantity"
                min={1}
                max={999}
                value={quantity}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setQuantity(Number.isFinite(v) && v >= 1 ? Math.min(999, Math.round(v)) : 1);
                }}
                className="h-8 w-14 rounded-lg border border-[#EAEAEA] bg-white text-center text-xs font-semibold text-[#151515] tabular-nums"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EAEAEA] bg-white text-[#151515] hover:bg-[#F1F5F9] active:bg-[#E0F2FE] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={handleSendToChat}
            className="btn-lime-clean w-full border border-transparent font-semibold disabled:opacity-60"
          >
            {isExporting ? 'Preparing Draft...' : 'Send to Inquiry Chat'}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
