'use client';

import Link from 'next/link';

type Tab = 'payments' | 'receivables';

interface PaymentsTabsProps {
  activeTab: Tab;
}

const tabs: { key: Tab; label: string; href: string }[] = [
  { key: 'payments', label: '결제 요청', href: '/payments' },
  { key: 'receivables', label: '미수', href: '/payments/receivables' },
];

export function PaymentsTabs({ activeTab }: PaymentsTabsProps) {
  return (
    <nav className="flex gap-0 border-b border-gray-200 mb-6" aria-label="결제·미수 탭">
      {tabs.map(({ key, label, href }) => {
        const isActive = activeTab === key;
        return (
          <Link
            key={key}
            href={href}
            className={`
              px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
              ${isActive
                ? 'border-amber-600 text-amber-700 bg-amber-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }
            `}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
