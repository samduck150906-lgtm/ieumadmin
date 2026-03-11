/**
 * 서버 전용 QR코드 생성 유틸
 * 공인중개사 가입 시 자동 생성에 사용
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

/** 공인중개사 전용 폼/QR — 고객 사이트(ieum-customer)로 연결 */
const CUSTOMER_FORM_BASE = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_LANDING_URL || 'https://ieum-customer.netlify.app';
const QR_COLOR_DARK = '#1e40af';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = Buffer.from(base64, 'base64');
  return new Uint8Array(binaryStr);
}

/**
 * 공인중개사용 QR코드 이미지 생성 후 Storage 업로드 및 realtors.qr_code_url 업데이트
 * @param realtorId realtors.id (UUID)
 * @param supabase service role 클라이언트 (또는 null이면 내부 생성)
 * @returns 생성된 QR 이미지 공개 URL, 실패 시 null
 */
export async function generateRealtorQRCodeServer(
  realtorId: string,
  supabase?: SupabaseClient | null
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const client =
    supabase ??
    (supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null);

  if (!client) {
    console.error('[qrcode-server] Supabase 클라이언트 없음');
    return null;
  }

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
    if (!base64Data) return null;

    const fileBuffer = base64ToUint8Array(base64Data);
    const fileName = `${realtorId}.png`;

    const { error: uploadError } = await client.storage
      .from('qrcodes')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[qrcode-server] QR 업로드 실패 (${realtorId}):`, uploadError.message);
      return null;
    }

    const { data: urlData } = client.storage.from('qrcodes').getPublicUrl(fileName);

    const { error: updateError } = await client
      .from('realtors')
      .update({ qr_code_url: urlData.publicUrl })
      .eq('id', realtorId);

    if (updateError) {
      console.error(`[qrcode-server] QR URL 저장 실패 (${realtorId}):`, updateError.message);
      return null;
    }

    return urlData.publicUrl;
  } catch (err) {
    console.error(`[qrcode-server] QR 생성 중 오류 (${realtorId}):`, err);
    return null;
  }
}
