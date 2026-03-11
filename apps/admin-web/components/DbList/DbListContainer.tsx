'use client';

import { useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export interface DbListContainerProps {
  children?: React.ReactNode;
  /** Sticky filter bar - always at top when scrolling */
  filterBar: React.ReactNode;
  /** Callback when user pulls to refresh or clicks refresh */
  onRefresh: () => void | Promise<void>;
  /** Whether refresh is in progress */
  refreshing?: boolean;
  /** Callback when user scrolls near bottom (infinite scroll) */
  onLoadMore?: () => void | Promise<void>;
  /** Whether more data is loading */
  loadingMore?: boolean;
  /** Whether there is more data to load */
  hasMore?: boolean;
  /** Threshold (px from bottom) to trigger onLoadMore */
  loadMoreThreshold?: number;
  className?: string;
  /** Optional: render virtualized list with scroll ref (use instead of children) */
  renderVirtualized?: (scrollRef: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
}

export function DbListContainer({
  children,
  renderVirtualized,
  filterBar,
  onRefresh,
  refreshing = false,
  onLoadMore,
  loadingMore = false,
  hasMore = false,
  loadMoreThreshold = 200,
  className = '',
}: DbListContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!onLoadMore || !hasMore || loadingMore || loadingRef.current) return;
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;

    const rect = sentinel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (rect.bottom <= containerRect.bottom + loadMoreThreshold) {
      loadingRef.current = true;
      Promise.resolve(onLoadMore()).finally(() => {
        loadingRef.current = false;
      });
    }
  }, [onLoadMore, hasMore, loadingMore, loadMoreThreshold]);

  return (
    <div className={className}>
      {/* Sticky Filter Bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm -mx-6 px-6 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">{filterBar}</div>
          <button
            type="button"
            onClick={() => Promise.resolve(onRefresh())}
            disabled={refreshing}
            className="shrink-0 flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-brand-primary hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* Scroll area with infinite scroll - min-h for virtualized lists */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0" style={{ minHeight: 400 }} onScroll={handleScroll}>
        {renderVirtualized ? renderVirtualized(scrollRef) : children}

        {/* Infinite scroll sentinel */}
        {onLoadMore && hasMore && (
          <div ref={sentinelRef} className="h-4 flex items-center justify-center py-6">
            {loadingMore && <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />}
          </div>
        )}
      </div>
    </div>
  );
}
