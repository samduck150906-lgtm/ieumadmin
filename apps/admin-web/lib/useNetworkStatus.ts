/**
 * 브라우저 네트워크 연결 상태 — navigator.onLine + online/offline 이벤트
 * 오프라인 시 상태 변경 버튼 비활성화, pending badge 표시용
 */
'use client';

import { useState, useEffect } from 'react';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
