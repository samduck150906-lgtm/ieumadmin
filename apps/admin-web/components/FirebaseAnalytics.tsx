'use client';

import { useEffect } from 'react';
import { getFirebaseAnalytics } from '@/lib/firebase';

/**
 * 루트 레이아웃에 한 번만 두면 Firebase Analytics가 활성화됩니다.
 */
export function FirebaseAnalytics() {
  useEffect(() => {
    getFirebaseAnalytics();
  }, []);
  return null;
}
