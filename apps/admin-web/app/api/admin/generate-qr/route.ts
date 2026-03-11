import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 공인중개사 전용 폼/QR — 고객 사이트(ieum-customer)로 연결 */
const CUSTOMER_FORM_BASE = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_LANDING_URL || 'https://ieum-customer.netlify.app';
const QR_COLOR_DARK = '#1e40af';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = Buffer.from(base64, 'base64');
  return new Uint8Array(binaryStr);
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: '서버 설정 오류: Supabase 환경변수 누락' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { realtorIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  const { realtorIds } = body;

  if (!Array.isArray(realtorIds) || realtorIds.length === 0) {
    return NextResponse.json({ error: 'realtorIds 배열이 필요합니다' }, { status: 400 });
  }

  if (realtorIds.length > 500) {
    return NextResponse.json({ error: '한 번에 최대 500건까지 생성 가능합니다' }, { status: 400 });
  }

  const validIds = realtorIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (validIds.length === 0) {
    return NextResponse.json({ error: '유효한 공인중개사 ID가 없습니다' }, { status: 400 });
  }

  const success: string[] = [];
  const failed: string[] = [];

  for (const realtorId of validIds) {
    try {
      const formUrl = `${CUSTOMER_FORM_BASE}/form/${realtorId}`;

      const qrDataUrl = await QRCode.toDataURL(formUrl, {
        width: 512,
        margin: 2,
        color: {
          dark: QR_COLOR_DARK,
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });

      const base64Data = qrDataUrl.split(',')[1];
      if (!base64Data) {
        failed.push(realtorId);
        continue;
      }

      const fileBuffer = base64ToUint8Array(base64Data);
      const fileName = `${realtorId}.png`;

      const { error: uploadError } = await supabase.storage
        .from('qrcodes')
        .upload(fileName, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`QR 업로드 실패 (${realtorId}):`, uploadError.message);
        failed.push(realtorId);
        continue;
      }

      const { data: urlData } = supabase.storage.from('qrcodes').getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('realtors')
        .update({ qr_code_url: urlData.publicUrl })
        .eq('id', realtorId);

      if (updateError) {
        console.error(`QR URL 저장 실패 (${realtorId}):`, updateError.message);
        failed.push(realtorId);
        continue;
      }

      success.push(realtorId);
    } catch (err) {
      console.error(`QR 생성 중 오류 (${realtorId}):`, err);
      failed.push(realtorId);
    }
  }

  return NextResponse.json({
    success,
    failed,
    total: validIds.length,
  });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
