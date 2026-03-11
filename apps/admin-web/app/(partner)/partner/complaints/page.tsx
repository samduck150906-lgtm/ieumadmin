import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { MessageSquareWarning } from 'lucide-react';
import { createServerClient } from '@/lib/supabase';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import ComplaintsTable, { type ComplaintRow } from './ComplaintsTable';

/** 동적 렌더링 (세션/쿠키 의존) */
export const dynamic = 'force-dynamic';

/** Supabase complaint_logs 테이블에서 현재 로그인한 partner_id와 매칭되는 민원만 조회 */
async function fetchPartnerComplaints(): Promise<{ data: ComplaintRow[]; error?: string }> {
  try {
    const headersList = await headers();
    const req = new NextRequest('http://localhost', { headers: headersList });
    const session = await verifyPartnerSession(req);
    const partnerId = session?.partnerId;
    if (!partnerId) return { data: [] };

    const supabase = createServerClient();
    if (!supabase) return { data: [], error: '연결을 초기화할 수 없습니다.' };

    const { data, error } = await supabase
      .from('complaint_logs')
      .select('id, type, content, status, follow_up_memo, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[complaints] fetchPartnerComplaints error:', error.message);
      return { data: [], error: '데이터 처리 중 문제가 발생했습니다.' };
    }
    return { data: (data ?? []) as ComplaintRow[] };
  } catch (e) {
    console.error('[complaints] fetchPartnerComplaints exception:', e);
    return { data: [], error: '데이터 처리 중 문제가 발생했습니다.' };
  }
}

export default async function PartnerComplaintsPage() {
  const { data: complaints, error } = await fetchPartnerComplaints();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">고객 민원 관리</h1>
        <p className="text-sm text-text-secondary mt-1">
          배정된 고객의 민원 내역을 확인하고 처리하는 공간입니다.
        </p>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="border-b bg-gray-50/80 px-4 py-3 flex items-center gap-2 text-sm font-medium text-gray-600">
          <MessageSquareWarning className="w-4 h-4 shrink-0" />
          민원 목록
        </div>
        <div className="p-4">
          {error ? (
            <div className="py-8 px-4 rounded-xl bg-red-50 border border-red-200 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-xs text-red-500 mt-1">페이지를 새로고침해 주세요.</p>
            </div>
          ) : (
            <ComplaintsTable data={complaints} />
          )}
        </div>
      </div>
    </div>
  );
}
