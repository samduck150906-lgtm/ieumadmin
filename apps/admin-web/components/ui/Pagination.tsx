'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const showPages = 5;
  let start = Math.max(1, page - Math.floor(showPages / 2));
  const end = Math.min(totalPages, start + showPages - 1);
  if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
  const pages = Array.from(
    { length: end - start + 1 },
    (_, i) => start + i
  );

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-center gap-1 sm:gap-2', className)}
      aria-label="페이지 네비게이션"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="touch-target rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      {start > 1 && (
        <>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            1
          </button>
          {start > 2 && <span className="px-1 text-gray-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            p === page
              ? 'bg-brand-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="touch-target rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="다음 페이지"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </nav>
  );
}
