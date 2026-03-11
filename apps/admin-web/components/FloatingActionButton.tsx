'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { hapticImpactMedium } from '@/lib/haptics';

interface FloatingActionButtonProps {
  href: string;
  ariaLabel?: string;
}

export function FloatingActionButton({ href, ariaLabel = '주요 액션' }: FloatingActionButtonProps) {
  return (
    <div
      className="fixed right-4 sm:right-6 md:right-8 z-50"
      style={{ bottom: 'max(4.5rem, calc(env(safe-area-inset-bottom, 0px) + 4.5rem))' }}
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        onClick={hapticImpactMedium}
        className="block"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 hover:bg-primary-700 active:bg-primary-800 hover:scale-105 active:scale-95 transition-all duration-250 ease-in-out">
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </span>
      </Link>
    </div>
  );
}
