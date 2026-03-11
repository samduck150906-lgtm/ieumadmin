/**
 * 제휴업체/공인중개사 내 매물 목록 API
 * realtor: realtor_id로 본인 매물만 조회
 * partner: 매물 메뉴 없음 — 빈 배열 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
import type { Property } from '@/types/property';

export const dynamic = 'force-dynamic';

type PropertyStatus = 'available' | 'reserved' | 'contracted' | 'hidden';

function mapRowToProperty(row: {
  id: string;
  property_type: string | null;
  address_short: string | null;
  address_detail: string | null;
  complex_name: string | null;
  price_display: number | null;
  area_sqm: number | null;
  region_level1: string | null;
  region_level2: string | null;
  region_level3: string | null;
  status?: string | null;
  created_at: string;
}): Property {
  const address =
    [row.address_short, row.address_detail].filter(Boolean).join(' ') ||
    [row.region_level1, row.region_level2, row.region_level3].filter(Boolean).join(' ');
  const title = row.complex_name || row.address_short || address || '-';
  const status = (row.status as PropertyStatus) || 'available';
  return {
    id: row.id,
    title,
    address: address || '-',
    price: Number(row.price_display ?? 0),
    type: (row.property_type as Property['type']) ?? 'apartment',
    status,
    area: Number(row.area_sqm ?? 0),
    createdAt: row.created_at,
    transactionType: 'sale',
    images: [],
    description: '',
    partnerId: '',
    partnerName: '',
    viewCount: 0,
    inquiryCount: 0,
    isMosaic: false,
    updatedAt: row.created_at,
  };
}

async function getHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const realtorId = session.realtorId;

  // realtor가 아니면 빈 목록 (partner는 매물 메뉴 없음)
  if (!realtorId) {
    return NextResponse.json({
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim();
  const status = searchParams.get('status')?.trim();

  // realtor_id가 본인인 매물 + realtor_id가 null인 미할당 매물 모두 표시
  let query = supabase
    .from('properties')
    .select('id, property_type, address_short, address_detail, complex_name, price_display, area_sqm, region_level1, region_level2, region_level3, status, created_at', {
      count: 'exact',
    })
    .or(`realtor_id.eq.${realtorId},realtor_id.is.null`)
    .order('created_at', { ascending: false });

  if (search) {
    const term = `%${search}%`;
    query = query.or(
      `complex_name.ilike.${term},address_short.ilike.${term},address_detail.ilike.${term},region_level1.ilike.${term},region_level2.ilike.${term},region_level3.ilike.${term}`
    );
  }
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    // realtor_id 컬럼 미존재 시(마이그레이션 미적용) 빈 목록 반환
    if (error.message?.includes('realtor_id') || error.code === '42703') {
      return NextResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit, totalPages: 0, hasNext: false, hasPrev: false },
      });
    }
    console.error('[partner/properties] list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const data = (rows ?? []).map(mapRowToProperty);

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
