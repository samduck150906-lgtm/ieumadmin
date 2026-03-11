import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const patchInquirySchema = z.object({
  admin_memo: z.string().optional(),
  status: z.string().optional(),
});

/** 문의 답변 등록 (admin_memo 업데이트) */
async function patchHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('Supabase client init failed', 500);
  }

  const { id } = await context.params;
  if (!id) {
    throw new ApiError('id required', 400);
  }

  const parsed = await parseBody(request, patchInquirySchema);
  if (!parsed.ok) return parsed.response;
  const { admin_memo, status } = parsed.data;

  const updates: Record<string, unknown> = { handled_by: session.userId };
  if (admin_memo !== undefined) updates.admin_memo = admin_memo;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from('inquiries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return NextResponse.json(data);
}

export const PATCH = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => patchHandler(req as NextRequest, context))(request);
