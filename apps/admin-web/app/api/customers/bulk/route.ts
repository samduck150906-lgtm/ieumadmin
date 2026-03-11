import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { parseXlsxToRows } from '@/lib/excel-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 고객 엑셀 대량 등록 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file?.size) {
      return NextResponse.json({ error: '엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const rows = await parseXlsxToRows(buf);

    if (!rows || rows.length < 2) {
      return NextResponse.json({ error: '헤더와 최소 1건의 데이터가 필요합니다.' }, { status: 400 });
    }

    const headers = (rows[0] as string[]).map((h) => String(h ?? '').trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h === '이름' || h === 'name');
    const phoneIdx = headers.findIndex((h) => h === '휴대번호' || h === '전화번호' || h === 'phone');
    const memoIdx = headers.findIndex((h) => h === '메모' || h === 'memo');

    if (nameIdx < 0 || phoneIdx < 0) {
      return NextResponse.json(
        { error: '엑셀에 "이름", "휴대번호"(또는 "전화번호") 컬럼이 필요합니다.' },
        { status: 400 }
      );
    }

    const toInsert: {
      source_realtor_id: string;
      name: string;
      phone: string;
      status: string;
      memo: string | null;
    }[] = [];
    const seenPhones = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as (string | number)[];
      const name = String(row[nameIdx] ?? '').trim();
      const phone = String(row[phoneIdx] ?? '')
        .replace(/\s/g, '')
        .replace(/-/g, '');
      if (!name || !phone || phone.length < 10) continue;
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      toInsert.push({
        source_realtor_id: session.realtorId,
        name,
        phone,
        status: 'consulting',
        memo: memoIdx >= 0 && row[memoIdx] ? String(row[memoIdx]).trim() || null : null,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ error: '등록 가능한 유효한 데이터가 없습니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    let imported = 0;
    let duplicates = 0;
    for (const row of toInsert) {
      const { error } = await supabase.from('customers').insert(row).select('id').single();
      if (error) {
        const isDuplicate =
          error.code === '23505' ||
          String(error.message).includes('unique') ||
          String(error.message).includes('중복');
        if (isDuplicate) duplicates += 1;
        else throw error;
      } else {
        imported += 1;
      }
    }

    return NextResponse.json({
      success: true,
      count: imported,
      imported,
      duplicates,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '대량 등록 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
