'use client';

import { useRef, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  getItemKey?: (item: T, index: number) => string;
  className?: string;
  /** Use external scroll container (parent must have overflow-y-auto and fixed height) */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 120,
  overscan = 5,
  getItemKey,
  className = '',
  scrollRef: externalScrollRef,
}: VirtualListProps<T>) {
  'use no memo'; // TanStack Virtual + useSyncExternalStore 호환 (bk.snapshot is not a function 방지)
  const ownRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? ownRef;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const content = (
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={getItemKey ? getItemKey(item, virtualRow.index) : virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
  );

  if (externalScrollRef) {
    return <div className={className}>{content}</div>;
  }
  return (
    <div ref={ownRef} className={`overflow-auto ${className}`} style={{ height: '100%', minHeight: 400 }}>
      {content}
    </div>
  );
}
