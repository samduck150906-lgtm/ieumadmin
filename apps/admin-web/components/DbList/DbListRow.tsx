'use client';

import { useState, useCallback, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Phone, RefreshCw, MoreHorizontal, WifiOff } from 'lucide-react';
import { hapticImpactMedium } from '@/lib/haptics';
import { useNetworkStatus } from '@/lib/useNetworkStatus';

export interface DbListRowAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface DbListRowProps {
  children: React.ReactNode;
  /** Swipe LEFT → 상태변경 */
  onStatusChange?: () => void;
  /** Swipe RIGHT → 전화 */
  onCall?: () => void;
  phone?: string | null;
  quickActions?: DbListRowAction[];
  className?: string;
  /** 긴급 DB 카드일 때 border glow */
  urgent?: boolean;
}

const SWIPE_WIDTH = 72;

export function DbListRow({
  children,
  onStatusChange,
  onCall,
  phone,
  quickActions = [],
  className = '',
  urgent = false,
}: DbListRowProps) {
  const isOnline = useNetworkStatus();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const canCall = (phone && phone.trim()) || onCall;
  const canStatus = !!onStatusChange && isOnline;
  const showPendingBadge = !!onStatusChange && !isOnline;

  const handleCall = useCallback(() => {
    hapticImpactMedium();
    if (phone) window.location.href = `tel:${phone}`;
    else onCall?.();
  }, [phone, onCall]);

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (e.deltaX > 0 && canStatus && isOnline) {
        setTranslateX(Math.min(e.deltaX, SWIPE_WIDTH));
      } else if (e.deltaX < 0 && canCall) {
        setTranslateX(Math.max(e.deltaX, -SWIPE_WIDTH));
      }
    },
    onSwiped: () => {
      setTranslateX(0);
    },
    onSwipedRight: () => {
      if (canStatus && isOnline) onStatusChange?.();
      setTranslateX(0);
    },
    onSwipedLeft: () => {
      if (canCall) {
        hapticImpactMedium();
        handleCall();
      }
      setTranslateX(0);
    },
    trackMouse: false,
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (quickActions.length > 0 || canStatus || canCall) {
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [quickActions.length, canStatus, canCall]
  );

  const closeContextMenu = () => setContextMenu(null);

  const allActions: DbListRowAction[] = [
    ...(canStatus && onStatusChange ? [{ id: 'status', label: '상태 변경', icon: <RefreshCw className="w-4 h-4" />, onClick: onStatusChange }] : []),
    ...(!!onStatusChange && !isOnline ? [{ id: 'offline', label: '연결 대기중 (오프라인)', icon: <WifiOff className="w-4 h-4" />, onClick: () => {} }] : []),
    ...(canCall ? [{ id: 'call', label: '전화하기', icon: <Phone className="w-4 h-4" />, onClick: handleCall }] : []),
    ...quickActions,
  ];

  return (
    <div className={`group relative overflow-hidden rounded-2xl ${className}`} {...handlers}>
      {/* Left action: 상태변경 (shows when swiping right) */}
      {canStatus && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[72px] flex items-center justify-center bg-blue-100 text-blue-700 z-0"
          aria-hidden
        >
          <span className="text-xs font-medium">상태변경</span>
        </div>
      )}

      {/* Right action: 전화 (shows when swiping left) */}
      {canCall && (
        <div
          className="absolute right-0 top-0 bottom-0 w-[72px] flex items-center justify-center bg-green-100 text-green-700 z-0"
          aria-hidden
        >
          <Phone className="w-5 h-5" />
        </div>
      )}

      {/* Main content */}
      <div
        className={`relative z-10 bg-white shadow-card p-5 rounded-2xl border hover:shadow-card-hover transition-all ${
          urgent ? 'border-amber-400 animate-urgent-glow' : 'border-gray-100'
        }`}
        style={{ transform: `translateX(${translateX}px)` }}
        onContextMenu={handleContextMenu}
      >
          <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">{children}</div>
          <div className="flex items-center gap-1 shrink-0">
            {showPendingBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium" title="오프라인 — 연결 후 상태 변경 가능">
                <WifiOff className="w-3.5 h-3.5" />
                대기중
              </span>
            )}
            {canStatus && (
              <button
                type="button"
                onClick={onStatusChange}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg opacity-70 group-hover:opacity-100 transition-opacity"
                title="상태 변경"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {canCall && (
              <a
                href={phone ? `tel:${phone}` : '#'}
                onClick={(e) => {
                  hapticImpactMedium();
                  if (!phone) {
                    e.preventDefault();
                    onCall?.();
                  }
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg opacity-70 group-hover:opacity-100 transition-opacity"
                title="전화"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            {quickActions.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  setContextMenu({ x: rect.left, y: rect.bottom });
                }}
                className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg"
                title="더보기"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {contextMenu && allActions.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={closeContextMenu} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {allActions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (a.id !== 'offline') {
                    a.onClick();
                    closeContextMenu();
                  }
                }}
                disabled={a.id === 'offline'}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm ${
                  a.id === 'offline' ? 'text-amber-600 bg-amber-50 cursor-not-allowed' : 'hover:bg-gray-50'
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
