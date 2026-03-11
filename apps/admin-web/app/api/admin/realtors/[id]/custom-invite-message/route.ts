/**
 * 공인중개사별 전용 폼메일 문구 관리 (관리자 전용)
 * - PATCH: custom_invite_message 업데이트
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function patchHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'realtor id 필요' }, { status: 400 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const { custom_invite_message } = body as { custom_invite_message?: string | null };

  const { error } = await supabase
    .from('realtors')
    .update({ custom_invite_message: custom_invite_message ?? null })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => patchHandler(req as NextRequest, context))(request);
