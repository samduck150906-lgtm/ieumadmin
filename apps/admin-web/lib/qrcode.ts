import QRCode from 'qrcode';
import { getSupabase } from './supabase';

/** 고객 신청 폼 URL — 공인중개사 전용 링크/QR는 고객 사이트(ieum-customer)로 연결 */
const CUSTOMER_FORM_BASE = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_LANDING_URL || 'https://ieum-customer.netlify.app';
const BASE_URL = CUSTOMER_FORM_BASE;
const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://ieum.in';

/**
 * QR코드 생성 및 저장
 */
export async function generateQRCode(realtorId: string): Promise<string | null> {
  const supabase = getSupabase();
  try {
    // QR코드에 들어갈 URL
    const formUrl = `${BASE_URL}/form/${realtorId}`;

    // QR코드 생성 (PNG 데이터 URL)
    const qrDataUrl = await QRCode.toDataURL(formUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: '#1e40af', // 파란색
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });

    // Base64 데이터 추출
    const base64Data = qrDataUrl.split(',')[1];
    const blob = base64ToBlob(base64Data, 'image/png');

    // Supabase Storage에 업로드
    const fileName = `${realtorId}.png`;
    const { data, error } = await supabase.storage
      .from('qrcodes')
      .upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true, // 기존 파일 덮어쓰기
      });

    if (error) throw error;

    // 공개 URL 가져오기
    const { data: urlData } = supabase.storage
      .from('qrcodes')
      .getPublicUrl(fileName);

    // realtors 테이블 업데이트
    await supabase
      .from('realtors')
      .update({ qr_code_url: urlData.publicUrl })
      .eq('id', realtorId);

    return urlData.publicUrl;
  } catch (error) {
    console.error('QR코드 생성 오류:', error);
    return null;
  }
}

/**
 * 여러 공인중개사의 QR코드 일괄 생성
 */
export async function generateBulkQRCodes(realtorIds: string[]): Promise<{
  success: string[];
  failed: string[];
}> {
  const success: string[] = [];
  const failed: string[] = [];

  for (const id of realtorIds) {
    const result = await generateQRCode(id);
    if (result) {
      success.push(id);
    } else {
      failed.push(id);
    }
  }

  return { success, failed };
}

/**
 * QR코드 삭제
 */
export async function deleteQRCode(realtorId: string): Promise<boolean> {
  const supabase = getSupabase();
  try {
    const fileName = `${realtorId}.png`;

    await supabase.storage.from('qrcodes').remove([fileName]);

    await supabase
      .from('realtors')
      .update({ qr_code_url: null })
      .eq('id', realtorId);

    return true;
  } catch (error) {
    console.error('QR코드 삭제 오류:', error);
    return false;
  }
}

/**
 * QR코드 다운로드 URL 생성 (with 로고)
 */
export async function generateQRCodeWithLogo(
  realtorId: string,
  businessName: string
): Promise<string | null> {
  try {
    const formUrl = `${BASE_URL}/form/${realtorId}`;

    // SVG 형태로 생성 (더 고품질)
    const qrSvg = await QRCode.toString(formUrl, {
      type: 'svg',
      width: 400,
      margin: 2,
      color: {
        dark: '#1e40af',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });

    // SVG에 업체명 추가
    const svgWithText = qrSvg.replace(
      '</svg>',
      `<text x="200" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#1e40af" font-weight="bold">${businessName}</text>
       <text x="200" y="445" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">이음에서 이사 서비스를 신청하세요</text>
      </svg>`
    ).replace('height="400"', 'height="460"');

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgWithText)))}`;
  } catch (error) {
    console.error('QR코드 생성 오류:', error);
    return null;
  }
}

/**
 * Base64를 Blob으로 변환
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * QR코드 PNG 다운로드 트리거
 */
export function downloadQRCode(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${filename}-qrcode.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- PHASE 5: 공인중개사 폼/추천 URL 및 QR Base64/업로드 ---

/** 공인중개사 전용 폼 URL — 고객이 신청하는 사이트(ieum-customer)로 연결 */
export function generateRealtorFormUrl(realtorId: string): string {
  return `${CUSTOMER_FORM_BASE}/form/${realtorId}`;
}

export function generateReferralUrl(realtorId: string): string {
  return `${LANDING_URL}/realtor/apply?ref=${realtorId}`;
}

export async function generateQRCodeBase64(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#1e40af', light: '#ffffff' },
  });
}

export async function uploadQRCode(realtorId: string, qrBase64: string): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const base64Data = qrBase64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `qr-codes/${realtorId}.png`;

    const { error } = await supabase.storage
      .from('public')
      .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

    if (error) {
      console.error('QR 업로드 실패:', error);
      return null;
    }

    const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}
