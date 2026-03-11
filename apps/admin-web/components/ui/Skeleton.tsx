'use client';

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  /** 여러 줄 스켈레톤 */
  lines?: number;
  /** 카드 형태 (header + body) */
  variant?: 'line' | 'card' | 'kpi' | 'table-row';
};

export function Skeleton({
  className = '',
  width = '100%',
  height = 14,
  lines = 1,
  variant = 'line',
}: SkeletonProps) {
  const baseClasses =
    'rounded-md bg-primary/15 animate-pulse overflow-hidden';
  const style = { width, height: typeof height === 'number' ? height : undefined };

  if (variant === 'card') {
    return (
      <div
        className={`bg-surface rounded-xl border border-primary/20 overflow-hidden shadow-sm ${className}`}
      >
        <div className="px-5 py-4 border-b border-primary/20">
          <div className="h-5 w-32 rounded-md bg-primary/20 animate-pulse" />
        </div>
        <div className="p-5 space-y-3">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded-md bg-primary/20 animate-pulse"
              style={{ width: i === 0 ? '80%' : '100%' }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'kpi') {
    return (
      <div
        className={`bg-surface rounded-xl border border-primary/20 p-5 ${baseClasses} ${className}`}
        style={{ ...style, minHeight: 100 }}
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/20 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 w-16 rounded bg-primary/20 animate-pulse" />
            <div className="h-6 w-24 rounded bg-primary/20 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'table-row') {
    return (
      <div className="flex gap-4 py-4 border-b border-primary/20 last:border-0">
        {[1, 2, 3, 4, 5].map((w) => (
          <div
            key={w}
            className="h-4 rounded-md bg-primary/20 animate-pulse flex-1"
            style={{ maxWidth: w === 1 ? 120 : undefined }}
          />
        ))}
      </div>
    );
  }

  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} animate-pulse`}
            style={{
              width: i === 0 ? width : '100%',
              height: typeof height === 'number' ? height : 14,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} animate-pulse ${className}`}
      style={style}
      aria-hidden
    />
  );
}

/** 대시보드용 스켈레톤 그리드 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="kpi" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton variant="card" lines={4} className="lg:col-span-2" />
        <Skeleton variant="card" lines={5} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton variant="card" lines={6} />
        <Skeleton variant="card" lines={6} />
      </div>
    </div>
  );
}
