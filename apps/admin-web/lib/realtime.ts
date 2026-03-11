'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';
import toast from 'react-hot-toast';

interface RealtimeConfig {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onEvent: (payload: any) => void;
}

/**
 * Supabase Realtime 구독 훅
 */
export function useRealtimeSubscription(configs: RealtimeConfig[]) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel = supabase.channel('realtime-changes');

    configs.forEach((config) => {
      channel.on(
        'postgres_changes' as any,
        {
          event: config.event,
          schema: 'public',
          table: config.table,
          filter: config.filter,
        },
        (payload) => {
          config.onEvent(payload);
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [configs]);
}

/**
 * 새 서비스 요청 실시간 감지
 */
export function useNewRequestsRealtime() {
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel('new-requests')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests',
        },
        (payload) => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('새 서비스 요청 ID:', (payload as any)?.new?.id);
          }
          setNewCount((prev) => prev + 1);
          
          // 토스트 알림
          toast('새로운 서비스 요청이 접수되었습니다!', {
            icon: '🔔',
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resetCount = useCallback(() => {
    setNewCount(0);
  }, []);

  return { newCount, resetCount };
}

/**
 * 출금 신청 실시간 감지
 */
export function useNewWithdrawalsRealtime() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel('new-withdrawals')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'withdrawal_requests',
        },
        (payload) => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('새 출금 신청 ID:', (payload as any)?.new?.id);
          }
          setPendingCount((prev) => prev + 1);
          
          toast('새로운 출금 신청이 있습니다!', {
            icon: '💰',
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { pendingCount };
}

/**
 * 협력업체 신청 실시간 감지
 */
export function useNewPartnerApplicationsRealtime() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel('new-partner-applications')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'partner_applications',
        },
        (payload) => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('새 협력업체 신청 ID:', (payload as any)?.new?.id);
          }
          toast('새로운 협력업체 신청이 있습니다!', {
            icon: '🤝',
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

/**
 * 대시보드용 통합 실시간 구독
 */
export function useDashboardRealtime(onUpdate: () => void) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'service_requests' },
        () => onUpdate()
      )
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'customers' },
        () => onUpdate()
      )
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'withdrawals' },
        () => onUpdate()
      )
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'db_consultations' },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}

/**
 * 특정 서비스 요청의 통합 메모 실시간 구독 — 본사·제휴업체 메모 추가 시 목록 갱신
 * (Realtime은 단일 컬럼 필터만 지원하므로 entity_id로 구독 후 콜백에서 entity_type 검사)
 */
export function useServiceRequestMemosRealtime(
  entityId: string | null,
  onNewMemo: () => void
) {
  useEffect(() => {
    if (!isSupabaseConfigured() || !entityId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`memos-${entityId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'memos',
          filter: `entity_id=eq.${entityId}`,
        },
        (payload: { new?: { entity_type?: string } }) => {
          if (payload?.new?.entity_type === 'service_request') onNewMemo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityId, onNewMemo]);
}
