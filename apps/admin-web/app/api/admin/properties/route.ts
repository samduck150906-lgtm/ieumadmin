import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Property } from '@/types/property';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/** DB row → Property 매핑 (실제 스키마: property_type, address_short, complex_name, price_display 등) */
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
  created_at: string;
}): Property {
  const address = [row.address_short, row.address_detail].filter(Boolean).join(' ') ||
    [row.region_level1, row.region_level2, row.region_level3].filter(Boolean).join(' ');
  const title = row.complex_name || row.address_short || address || '-';
  return {
    id: row.id,
    title,
    address: address || '-',
    price: Number(row.price_display ?? 0),
    type: (row.property_type as Property['type']) ?? 'apartment',
    status: 'available',
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
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase client init failed' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim();
  const type = searchParams.get('type')?.trim();

  let query = supabase
    .from('properties')
    .select('id, property_type, address_short, address_detail, complex_name, price_display, area_sqm, region_level1, region_level2, region_level3, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    const term = `%${search}%`;
    query = query.or(`complex_name.ilike.${term},address_short.ilike.${term},address_detail.ilike.${term},region_level1.ilike.${term},region_level2.ilike.${term},region_level3.ilike.${term}`);
  }
  if (type && type !== 'all') {
    query = query.eq('property_type', type);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    console.error('admin properties list error', error);
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

export interface CreatePropertyBody {
  complex_name?: string | null;
  address_short?: string | null;
  address_detail?: string | null;
  price_display?: number | null;
  area_sqm?: number | null;
  property_type?: string | null;
  image_url?: string | null;
  contact_phone?: string | null;
  seller_info?: string | null;
  region_level1?: string | null;
  region_level2?: string | null;
  region_level3?: string | null;
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase client init failed' }, { status: 500 });

  let body: CreatePropertyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const insertRow = {
    complex_name: body.complex_name?.trim() || null,
    address_short: body.address_short?.trim() || null,
    address_detail: body.address_detail?.trim() || null,
    price_display: body.price_display != null ? Number(body.price_display) : null,
    area_sqm: body.area_sqm != null ? Number(body.area_sqm) : null,
    property_type: body.property_type?.trim() || null,
    image_url: body.image_url?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
    seller_info: body.seller_info?.trim() || null,
    region_level1: body.region_level1?.trim() || null,
    region_level2: body.region_level2?.trim() || null,
    region_level3: body.region_level3?.trim() || null,
  };

  const { data: row, error } = await supabase
    .from('properties')
    .insert(insertRow)
    .select('id, property_type, address_short, address_detail, complex_name, price_display, area_sqm, region_level1, region_level2, region_level3, created_at')
    .single();

  if (error) {
    console.error('admin properties create error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const property = mapRowToProperty(row as Parameters<typeof mapRowToProperty>[0]);
  return NextResponse.json(property);
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
