import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { parseXlsxToRows } from '@/lib/excel-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 엑셀 대량 등록 */
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

    const headers = (rows[0] as string[]).map(h => String(h || '').trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h === '이름' || h === 'name');
    const phoneIdx = headers.findIndex(h => h === '휴대번호' || h === '전화번호' || h === 'phone');
    const categoryIdx = headers.findIndex(h => h === '분류' || h === 'category');
    const emailIdx = headers.findIndex(h => h === '이메일' || h === 'email');
    const memoIdx = headers.findIndex(h => h === '메모' || h === 'memo');

    if (nameIdx < 0 || phoneIdx < 0) {
      return NextResponse.json(
        { error: '엑셀에 "이름", "휴대번호"(또는 "전화번호") 컬럼이 필요합니다.' },
        { status: 400 }
      );
    }

    const total = rows.length - 1; // 데이터 행 수 (헤더 제외)
    const toInsert: { realtor_id: string; category: string; name: string; phone: string; email: string | null; memo: string | null }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[];
      const name = String(row[nameIdx] ?? '').trim();
      const phone = String(row[phoneIdx] ?? '').replace(/\s/g, '').replace(/-/g, '');
      if (!name || !phone || phone.length < 10) continue;
      toInsert.push({
        realtor_id: session.realtorId,
        category: categoryIdx >= 0 ? String(row[categoryIdx] ?? '').trim() || '일반' : '일반',
        name,
        phone,
        email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() || null : null,
        memo: memoIdx >= 0 && row[memoIdx] ? String(row[memoIdx]).trim() || null : null,
      });
    }

    const successCount = toInsert.length;
    const errorCount = total - successCount;

    if (toInsert.length > 0) {
      const supabase = createServerClient();
      if (!supabase) {
        return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
      }
      const { error } = await supabase.from('realtor_prospects').insert(toInsert);
      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      total,
      successCount,
      errorCount,
      count: successCount, // 하위 호환
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '대량 등록 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
