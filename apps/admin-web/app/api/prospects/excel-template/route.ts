import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import ExcelJS from 'exceljs';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 엑셀 템플릿 다운로드 */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor') {
    return unauthorizedResponse();
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('가망고객');
  const headers = ['분류', '이름', '휴대번호', '이메일', '메모'];
  const sample = [['일반', '홍길동', '01012345678', 'example@email.com', '이사 예정 고객']];
  ws.addRow(headers);
  sample.forEach((row) => ws.addRow(row));
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 25;
  ws.getColumn(5).width = 30;

  const buf = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prospect_template_${dateStr}.xlsx"`,
    },
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
