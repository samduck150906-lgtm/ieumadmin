/**
 * 고객 민원 관리 - 일괄 상태변경 (처리완료/대기)
 * - 메모·follow_up_at 미변경 시 업체 불만 횟수(complaint_count)는 증가하지 않음
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession } from '@/lib/auth-middleware';
import { parseBody } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

const bulkStatusSchema = z.object({
  items: z.array(z.object({
    sourceType: z.enum(['low_rating', 'complaint']),
    id: z.string().min(1),
    service_request_id: z.string().uuid().optional(),
  })).min(1, '항목이 없습니다'),
  status: z.enum(['pending', 'processing', 'resolved']),
});

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const parsed = await parseBody(request, bulkStatusSchema);
  if (!parsed.ok) return parsed.response;

  const { items, status } = parsed.data;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let success = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      if (item.sourceType === 'complaint') {
        const { error } = await supabase
          .from('complaint_logs')
          .update({ status })
          .eq('id', item.id);
        if (error) {
          errors.push(`${item.id}: ${error.message}`);
          continue;
        }
        success += 1;
        continue;
      }

      // low_rating: service_request_id 기준 complaint_logs 조회 후 업데이트 또는 생성
      const reviewId = item.id;
      const { data: review } = await supabase
        .from('reviews')
        .select('id, comment, service_request_id')
        .eq('id', reviewId)
        .single();
      if (!review?.service_request_id) {
        errors.push(`${reviewId}: 리뷰/서비스요청 없음`);
        continue;
      }

      const { data: sr } = await supabase
        .from('service_requests')
        .select('id, assigned_partner_id, customer_id')
        .eq('id', review.service_request_id)
        .single();
      if (!sr) {
        errors.push(`${reviewId}: 서비스 요청 없음`);
        continue;
      }

      const { data: existing } = await supabase
        .from('complaint_logs')
        .select('id')
        .eq('service_request_id', review.service_request_id)
        .eq('type', 'low_rating')
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('complaint_logs')
          .update({ status })
          .eq('id', existing.id);
        if (error) {
          errors.push(`${reviewId}: ${error.message}`);
          continue;
        }
      } else {
        const { error } = await supabase
          .from('complaint_logs')
          .insert({
            service_request_id: review.service_request_id,
            partner_id: sr.assigned_partner_id,
            customer_id: sr.customer_id,
            type: 'low_rating',
            content: review.comment || null,
            status,
          });
        if (error) {
          errors.push(`${reviewId}: ${error.message}`);
          continue;
        }
      }
      success += 1;
    } catch (e) {
      errors.push(`${item.id}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    updated: success,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
