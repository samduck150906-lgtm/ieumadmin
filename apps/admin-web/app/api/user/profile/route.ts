import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

/** 공인중개사 본인 프로필 수정 — 이름, 휴대번호, 공인중개사 사무소 명 (모바일 앱 회원정보/가입 후 반영) */
async function putHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, contact_phone, business_name, gender, birth_date } = body as {
    name?: string;
    contact_phone?: string;
    business_name?: string;
    gender?: string;
    birth_date?: string;
  };

  const updates: { name?: string; contact_phone?: string; business_name?: string; contact_name?: string; gender?: string; birth_date?: string } = {};
  if (name !== undefined) updates.name = typeof name === 'string' ? name.trim() || undefined : undefined;
  const phoneNorm = typeof contact_phone === 'string' ? contact_phone.replace(/\D/g, '').trim() : '';
  if (contact_phone !== undefined) updates.contact_phone = phoneNorm.length >= 10 ? phoneNorm : undefined;
  if (business_name !== undefined) updates.business_name = typeof business_name === 'string' ? business_name.trim() || undefined : undefined;
  if (updates.name !== undefined) updates.contact_name = updates.name;
  if (gender !== undefined) updates.gender = typeof gender === 'string' && /^(male|female|man|woman|남|여|남자|여자)$/i.test(gender.trim()) ? gender.trim().toLowerCase().replace(/^(남|남자)$/i, 'male').replace(/^(여|여자)$/i, 'female') : undefined;
  if (birth_date !== undefined) {
    const d = typeof birth_date === 'string' ? birth_date.trim() : '';
    updates.birth_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  }

  try {
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    const userId = session.userId;

    if (updates.name !== undefined) {
      const { error: userErr } = await supabase
        .from('users')
        .update({ name: updates.name })
        .eq('id', userId);
      if (userErr) {
        return NextResponse.json({ error: userErr.message }, { status: 400 });
      }
    }

    const realtorPayload: Record<string, string | null> = {};
    if (updates.contact_phone !== undefined) realtorPayload.contact_phone = updates.contact_phone ?? null;
    if (updates.business_name !== undefined) realtorPayload.business_name = updates.business_name ?? null;
    if (updates.contact_name !== undefined) realtorPayload.contact_name = updates.contact_name ?? null;
    if (updates.gender !== undefined) realtorPayload.gender = updates.gender ?? null;
    if (updates.birth_date !== undefined) realtorPayload.birth_date = updates.birth_date ?? null;
    if (Object.keys(realtorPayload).length > 0) {
      const { error: realtorErr } = await supabase
        .from('realtors')
        .update(realtorPayload)
        .eq('id', session.realtorId);
      if (realtorErr) {
        return NextResponse.json({ error: realtorErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '수정 실패' },
      { status: 500 }
    );
  }
}

export const PUT = withCors(withErrorHandler((request: Request) => putHandler(request as NextRequest)));
