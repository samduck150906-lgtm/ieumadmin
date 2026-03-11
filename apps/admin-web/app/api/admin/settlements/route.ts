import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Settlement } from '@/types/settlement';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

type RealtorRow = { business_name: string | null } | { business_name: string | null }[] | null;

function mapWithdrawalToSettlement(row: {
  id: string;
  realtor_id: string;
  amount: number;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  realtor?: RealtorRow;
}): Settlement {
  const realtor = Array.isArray(row.realtor) ? row.realtor[0] : row.realtor;
  const statusMap: Record<string, Settlement['status']> = {
    requested: 'pending',
    approved: 'processing',
    completed: 'completed',
    rejected: 'cancelled',
  };
  const dateStr = row.created_at.slice(0, 10);
  return {
    id: row.id,
    partnerId: row.realtor_id,
    partnerName: realtor?.business_name ?? '',
    amount: Number(row.amount),
    fee: 0,
    netAmount: Number(row.amount),
    status: statusMap[row.status] ?? 'pending',
    period: { startDate: dateStr, endDate: dateStr },
    commissionIds: [],
    bankInfo: {
      bankName: row.bank_name ?? '',
      accountNumber: row.account_number ?? '',
      accountHolder: row.account_holder ?? '',
    },
    processedAt: row.processed_at ?? undefined,
    idempotencyKey: row.id,
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
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const status = searchParams.get('status');

  let query = supabase
    .from('withdrawal_requests')
    .select(
      `
      id, realtor_id, amount, bank_name, account_number, account_holder,
      status, processed_at, created_at, updated_at,
      realtor:realtors!withdrawal_requests_realtor_id_fkey (business_name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    console.error('admin settlements list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const data = (rows ?? []).map(mapWithdrawalToSettlement);

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
