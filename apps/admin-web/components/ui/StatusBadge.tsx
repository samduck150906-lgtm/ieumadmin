'use client';

const variantClasses: Record<string, string> = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/20',
  green: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20',
  yellow: 'bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-600/20',
  gray: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/20',
  orange: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/20',
};

const dotClasses: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  gray: 'bg-gray-400',
  orange: 'bg-amber-500',
  purple: 'bg-purple-500',
};

/** 상태값 → 한국어 라벨 + variant (명세용) */
const statusMap: Record<string, { label: string; variant: keyof typeof variantClasses }> = {
  pending: { label: '대기', variant: 'yellow' },
  processing: { label: '처리중', variant: 'blue' },
  completed: { label: '완료', variant: 'green' },
  confirmed: { label: '확정', variant: 'green' },
  settled: { label: '정산완료', variant: 'green' },
  failed: { label: '실패', variant: 'red' },
  cancelled: { label: '취소', variant: 'gray' },
  in_progress: { label: '상담중', variant: 'blue' },
  active: { label: '활성', variant: 'green' },
  inactive: { label: '비활성', variant: 'gray' },
  suspended: { label: '정지', variant: 'red' },
  deleted: { label: '삭제됨', variant: 'gray' },
  pending_verification: { label: '인증대기', variant: 'yellow' },
  terminated: { label: '해지', variant: 'gray' },
  disputed: { label: '분쟁', variant: 'red' },
  refunded: { label: '환불됨', variant: 'gray' },
  available: { label: '거래가능', variant: 'green' },
  reserved: { label: '예약중', variant: 'yellow' },
  contracted: { label: '계약완료', variant: 'green' },
  hidden: { label: '숨김', variant: 'gray' },
};

type StatusBadgeProps =
  | { label: string; variant?: keyof typeof variantClasses; status?: never; type?: never }
  | {
      status: string;
      type?: 'settlement' | 'partner' | 'user' | 'property' | 'commission' | 'payment';
      label?: never;
      variant?: never;
    };

export function StatusBadge(props: StatusBadgeProps) {
  let label: string;
  let variant: keyof typeof variantClasses = 'gray';

  if ('status' in props && props.status) {
    const mapped = statusMap[props.status] ?? { label: props.status, variant: 'gray' as const };
    label = mapped.label;
    variant = mapped.variant;
  } else {
    label = props.label ?? '';
    variant = props.variant ?? 'gray';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium whitespace-nowrap ${variantClasses[variant] ?? variantClasses.gray}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClasses[variant] ?? dotClasses.gray}`} aria-hidden />
      {label}
    </span>
  );
}
