'use client';

import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      {children}
      {mounted && (
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#ffffff',
            color: '#334155',
            boxShadow: '0 8px 24px -10px rgba(37, 99, 235, 0.15)',
            borderRadius: '12px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#22C55E',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
      )}
    </>
  );
}

// 사용법:
// import toast from 'react-hot-toast';
// toast.success('저장되었습니다');
// toast.error('오류가 발생했습니다');
// toast.loading('처리 중...');
// toast.dismiss(); // 로딩 토스트 닫기
