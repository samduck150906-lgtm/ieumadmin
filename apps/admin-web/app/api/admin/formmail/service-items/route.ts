/**
 * 폼메일 서비스 항목 관리 API (관리자 전용)
 * - GET: 전체 목록 (비활성 포함)
 * - POST: 신규 추가
 * - PATCH: 수정 (label, emoji, display_order, is_active)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export interface FormServiceItem {
  id: string;
  category_key: string;
  label: string;
  emoji: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const { data, error } = await supabase
    .from('form_service_items')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const { category_key, label, emoji, display_order } = body as {
    category_key?: string;
    label?: string;
    emoji?: string;
    display_order?: number;
  };

  if (!category_key?.trim() || !label?.trim()) {
    return NextResponse.json({ error: 'category_key, label 필수' }, { status: 400 });
  }

  const key = category_key.trim().toLowerCase().replace(/\s+/g, '_');
  const maxOrder = await supabase
    .from('form_service_items')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const order = display_order ?? (maxOrder.data?.display_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('form_service_items')
    .insert({
      category_key: key,
      label: label.trim(),
      emoji: (emoji ?? '📋').trim(),
      display_order: order,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 존재하는 category_key입니다.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    item: data,
    migrationHint: `신규 카테고리 추가 시 Supabase SQL Editor에서 실행:\nALTER TYPE service_category ADD VALUE IF NOT EXISTS '${key}';`,
  });
}

async function patchHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const { id, label, emoji, display_order, is_active, order_updates } = body as {
    id?: string;
    label?: string;
    emoji?: string;
    display_order?: number;
    is_active?: boolean;
    order_updates?: { id: string; display_order: number }[];
  };

  for (const upd of order_updates ?? []) {
    await supabase
      .from('form_service_items')
      .update({ display_order: upd.display_order })
      .eq('id', upd.id);
  }

  if (id) {
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (emoji !== undefined) updates.emoji = emoji;
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('form_service_items').update(updates).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data } = await supabase.from('form_service_items').select('*').order('display_order', { ascending: true });
  return NextResponse.json({ items: data ?? [] });
}

export const GET = withErrorHandler((req: Request) => getHandler(req as NextRequest));
export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
export const PATCH = withErrorHandler((req: Request) => patchHandler(req as NextRequest));
