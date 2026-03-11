import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Payment } from '@/types/payment';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

type RequestedByUserRow = { name: string | null } | { name: string | null }[] | null;

function mapRowToPayment(row: {
  id: string;
  amount: number;
  status: string;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  requested_by_user?: RequestedByUserRow;
}): Payment {
  const user = Array.isArray(row.requested_by_user) ? row.requested_by_user[0] : row.requested_by_user;
  const statusMap: Record<string, Payment['status']> = {
    requested: 'pending',
    completed: 'completed',
  };
  return {
    id: row.id,
    userId: row.requested_by ?? '',
    userName: user?.name ?? '',
    type: 'property_unlock',
    amount: Number(row.amount),
    method: 'bank_transfer',
    status: statusMap[row.status] ?? 'pending',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const status = searchParams.get('status');

  let query = supabase
    .from('partner_payment_requests')
    .select(
      `
      id, amount, status, requested_by, created_at, updated_at,
      requested_by_user:users!partner_payment_requests_requested_by_fkey (name)
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
    console.error('admin payments list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const data = (rows ?? []).map(mapRowToPayment);

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
