export interface UnderlineTabOption<T extends string> {
  id: T;
  label: string;
}

export function UnderlineTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: ReadonlyArray<UnderlineTabOption<T>>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-6 border-b border-[#EAE6DF]"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors cursor-pointer ${
              isActive
                ? 'border-[#0EA5E9] font-semibold text-[#0F172A]'
                : 'border-transparent font-medium text-[#64748B] hover:border-[#BAE6FD] hover:text-[#0F172A]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TablePaginationFooter({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#F1F5F9] px-5 py-3.5 text-xs text-[#64748B]">
      <span className="font-medium tabular-nums">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#38BDF8] hover:bg-[#F8FAFC] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#38BDF8] hover:bg-[#F8FAFC] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
