import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Settlement } from '@/types/settlement';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(_request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });

  const { id } = await context.params;

  const { data: row, error } = await supabase
    .from('withdrawal_requests')
    .select(
      `
      id, realtor_id, amount, bank_name, account_number, account_holder,
      status, processed_at, reject_reason, created_at, updated_at,
      realtor:realtors!withdrawal_requests_realtor_id_fkey (business_name)
    `
    )
    .eq('id', id)
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? 'Not found' },
      { status: error?.code === 'PGRST116' ? 404 : 500 }
    );
  }

  const dateStr = (row as { created_at: string }).created_at.slice(0, 10);
  const realtorRaw = (row as { realtor?: { business_name: string | null } | { business_name: string | null }[] }).realtor;
  const realtor = Array.isArray(realtorRaw) ? realtorRaw[0] : realtorRaw;
  const statusMap: Record<string, Settlement['status']> = {
    requested: 'pending',
    approved: 'processing',
    completed: 'completed',
    rejected: 'cancelled',
  };

  const settlement: Settlement = {
    id: (row as { id: string }).id,
    partnerId: (row as { realtor_id: string }).realtor_id,
    partnerName: realtor?.business_name ?? '',
    amount: Number((row as { amount: number }).amount),
    fee: 0,
    netAmount: Number((row as { amount: number }).amount),
    status: statusMap[(row as { status: string }).status] ?? 'pending',
    period: { startDate: dateStr, endDate: dateStr },
    commissionIds: [],
    bankInfo: {
      bankName: (row as { bank_name: string | null }).bank_name ?? '',
      accountNumber: (row as { account_number: string | null }).account_number ?? '',
      accountHolder: (row as { account_holder: string | null }).account_holder ?? '',
    },
    processedAt: (row as { processed_at: string | null }).processed_at ?? undefined,
    failedReason: (row as { reject_reason: string | null }).reject_reason ?? undefined,
    idempotencyKey: (row as { id: string }).id,
    createdAt: (row as { created_at: string }).created_at,
    updatedAt: (row as { updated_at: string }).updated_at,
  };

  return NextResponse.json(settlement);
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);
