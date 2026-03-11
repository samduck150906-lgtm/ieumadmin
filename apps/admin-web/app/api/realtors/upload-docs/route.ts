import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

const BUCKET = 'realtor-docs';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function validateFile(file: File | null, fieldName: string): string | null {
  if (!file || !file.size) return null;
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${fieldName}: 파일 크기는 5MB 이하여야 합니다. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `${fieldName}: 허용되지 않는 파일 형식입니다. (JPG·PNG·WebP·PDF만 허용)`;
  }
  return null;
}

/** 공인중개사 서류 업로드 (신분증·통장사본·사업자등록증) → 계좌인증.
 * 버킷은 private이며, 조회 시 /api/realtors/[id]/document-urls에서 createSignedUrl로 일회성 URL 발급.
 * 서버사이드: 최대 5MB, JPG/PNG/WebP/PDF만 허용. */
async function postHandler(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session || session.role !== 'realtor' || !session.realtorId) {
      return unauthorizedResponse('공인중개사 로그인이 필요합니다.');
    }
    const realtorId = session.realtorId;

    const formData = await request.formData();
    const accountType = (formData.get('account_type') as string) || 'personal';
    const idCard = formData.get('id_card') as File | null;
    const bankbook = formData.get('bankbook') as File | null;
    const businessLicense = formData.get('business_license') as File | null;

    // 서버사이드 파일 크기·MIME 타입 검증
    for (const [file, label] of [
      [idCard, '신분증'],
      [bankbook, '통장사본'],
      [businessLicense, '사업자등록증'],
    ] as [File | null, string][]) {
      const err = validateFile(file, label);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const serverSupabase = createServerClient();
    if (!serverSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const updates: Record<string, string | null> = {};
    const prefix = `realtors/${realtorId}`;

    // private 버킷: DB에는 storage path만 저장. 조회 시 document-urls API에서 createSignedUrl로 일회성 URL 발급
    const uploadFile = async (file: File, key: string): Promise<string | null> => {
      if (!file?.size) return null;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${prefix}/${key}-${Date.now()}.${ext}`;
      const { error } = await serverSupabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) return null;
      return path;
    };

    if (idCard) {
      const url = await uploadFile(idCard, 'id_card');
      if (url) updates.id_card_url = url;
    }
    if (bankbook) {
      const url = await uploadFile(bankbook, 'bankbook');
      if (url) updates.bankbook_url = url;
    }
    if (businessLicense) {
      const url = await uploadFile(businessLicense, 'business_license');
      if (url) updates.business_license_url = url;
    }

    if (Object.keys(updates).length > 0) {
      updates.account_type = accountType;
      const requiredForPersonal = ['id_card_url', 'bankbook_url'];
      const requiredForBusiness = ['bankbook_url', 'business_license_url'];
      const { data: current } = await serverSupabase
        .from('realtors')
        .select('id_card_url, bankbook_url, business_license_url')
        .eq('id', realtorId)
        .single();

      const merged = { ...current, ...updates } as Record<string, string>;
      const hasPersonal = requiredForPersonal.every((k) => merged[k]);
      const hasBusiness = requiredForBusiness.every((k) => merged[k]);
      const accountVerified = accountType === 'business' ? hasBusiness : hasPersonal;
      await serverSupabase
        .from('realtors')
        .update({
          ...updates,
          account_verified: accountVerified,
          updated_at: new Date().toISOString(),
        })
        .eq('id', realtorId);
    }

    const { data: realtor } = await serverSupabase
      .from('realtors')
      .select('id_card_url, bankbook_url, business_license_url, account_verified, account_type')
      .eq('id', realtorId)
      .single();

    return NextResponse.json({
      success: true,
      account_verified: realtor?.account_verified ?? false,
      realtor: realtor,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '업로드 실패' },
      { status: 500 }
    );
  }
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
