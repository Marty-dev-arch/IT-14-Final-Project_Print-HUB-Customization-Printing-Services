import { useRef, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ImagePlus, MessageSquare, Send, X } from 'lucide-react';

interface ChatComposerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  imageDataUrl?: string | null;
  onImageChange?: (dataUrl: string | null) => void;
  allowImageUpload?: boolean;
  placeholder?: string;
  error?: string | null;
  leftToolbar?: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
}

export function ChatComposer({
  id = 'chat-composer-input',
  value,
  onChange,
  onSubmit,
  imageDataUrl = null,
  onImageChange,
  allowImageUpload = true,
  placeholder = 'Send a message here...',
  error,
  leftToolbar,
  submitLabel = 'Send message',
  disabled = false,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(value.trim() || imageDataUrl);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && canSend) onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && canSend) onSubmit();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/') || !onImageChange) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImageChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleClearImage() {
    onImageChange?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const uploadInputId = `${id}-image-upload`;

  return (
    <form onSubmit={handleFormSubmit} noValidate>
      <div
        className={`rounded-2xl border bg-white p-3.5 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.08)] transition-colors focus-within:border-[#3898ec] ${
          error ? 'border-[#C8004B]' : 'border-[#EAEAEA]'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <MessageSquare
            className="mt-1 h-4 w-4 shrink-0 text-[#858585]"
            aria-hidden="true"
          />
          <textarea
            id={id}
            rows={3}
            maxLength={2000}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-invalid={Boolean(error)}
            placeholder={placeholder}
            className="w-full resize-none border-0 bg-transparent text-sm leading-6 text-black placeholder:text-[#858585] focus:border-0 focus:outline-none"
          />
        </div>

        {imageDataUrl && (
          <div className="mt-3 relative inline-block">
            <img
              src={imageDataUrl}
              alt="Pending picture upload preview"
              className="h-20 w-auto rounded-xl border border-[#EAEAEA] object-cover"
            />
            <button
              type="button"
              onClick={handleClearImage}
              aria-label="Remove attached picture"
              className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#EAEAEA] bg-white text-[#676767] shadow-sm transition-colors hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F2F2F2] pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {allowImageUpload && onImageChange && (
              <>
                <input
                  ref={fileInputRef}
                  id={uploadInputId}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <label
                  htmlFor={uploadInputId}
                  aria-label="Attach picture"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] px-2.5 text-xs font-medium text-[#444444] transition-colors hover:border-[#BAE6FD] hover:text-black cursor-pointer"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Photo</span>
                </label>
              </>
            )}
            {leftToolbar}
          </div>

          <button
            type="submit"
            disabled={disabled || !canSend}
            aria-label={submitLabel}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#38BDF8] text-black transition-colors hover:bg-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <p className="mt-1.5 text-xs font-medium text-[#A3003D]">{error}</p>}
    </form>
  );
}
