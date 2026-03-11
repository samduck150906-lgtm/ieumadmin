import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Commission } from '@/types/commission';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

type RealtorRow = { business_name: string | null } | { business_name: string | null }[] | null;

function mapRowToCommission(row: {
  id: string;
  realtor_id: string;
  commission_type: string;
  service_request_id: string | null;
  amount: number;
  is_settled: boolean;
  withdrawal_id: string | null;
  created_at: string;
  updated_at: string;
  realtor?: RealtorRow;
}): Commission {
  const realtor = Array.isArray(row.realtor) ? row.realtor[0] : row.realtor;
  const typeMap: Record<string, Commission['type']> = {
    conversion: 'contract',
    consultation: 'consultation',
    referral: 'referral',
  };
  return {
    id: row.id,
    partnerId: row.realtor_id,
    partnerName: realtor?.business_name ?? '',
    customerId: row.service_request_id ?? '',
    customerName: '',
    type: typeMap[row.commission_type] ?? 'referral',
    amount: Number(row.amount),
    rate: 0,
    status: row.is_settled ? 'settled' : 'confirmed',
    settlementId: row.withdrawal_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase client init failed' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const partnerId = searchParams.get('partnerId');
  const status = searchParams.get('status');

  let query = supabase
    .from('commissions')
    .select(
      `
      id, realtor_id, commission_type, service_request_id, amount, is_settled, withdrawal_id, created_at, updated_at,
      realtor:realtors!commissions_realtor_id_fkey (business_name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (partnerId) query = query.eq('realtor_id', partnerId);
  if (status === 'settled') query = query.eq('is_settled', true);
  if (status === 'pending' || status === 'confirmed') query = query.eq('is_settled', false);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    console.error('admin commissions list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const data = (rows ?? []).map(mapRowToCommission);

  return NextResponse.json({
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
