'use client';

type FilterItem = {
  value: string;
  label: string;
};

type StickyFiltersProps = {
  filters: FilterItem[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
};

export function StickyFilters({
  filters,
  active,
  onChange,
  className = '',
}: StickyFiltersProps) {
  return (
    <div
      className={`sticky top-[57px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-surface-muted/90 backdrop-blur-sm border-b border-primary/20 ${className}`}
    >
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className={`
              px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap
              transition-all duration-250 ease-in-out hover:scale-[1.01] active:scale-[0.99]
              ${active === f.value
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-text-secondary border border-primary/25 hover:bg-primary/10 hover:border-primary-300'
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
