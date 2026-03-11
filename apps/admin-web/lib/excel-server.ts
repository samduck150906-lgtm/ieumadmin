import ExcelJS from 'exceljs';

function cellToScalar(v: ExcelJS.CellValue): string | number {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'richText' in v) {
    const rt = (v as { richText?: { text: string }[] }).richText;
    return rt ? rt.map((t) => t.text).join('') : '';
  }
  if (typeof v === 'object' && v !== null && 'text' in v) return (v as { text: string }).text;
  return v as string | number;
}

/**
 * 엑셀 파일 버퍼를 배열의 배열(헤더+데이터 행)로 파싱.
 * API 라우트에서 업로드된 xlsx 파싱용 (exceljs 사용 — xlsx 취약점 회피).
 * @throws 엑셀 파싱 실패 시 구체적인 오류 메시지와 함께 Error
 */
export async function parseXlsxToRows(buffer: ArrayBuffer): Promise<(string | number)[][]> {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('엑셀 파일이 비어 있습니다.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not a valid|corrupt|invalid|unexpected end|parse/i.test(msg)) {
      throw new Error('엑셀 파일이 손상되었거나 형식이 올바르지 않습니다. xlsx 파일인지 확인해 주세요.');
    }
    throw new Error(`엑셀 파싱 실패: ${msg}`);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: (string | number)[][] = [];
  let maxCols = 0;
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const raw = (row.values as ExcelJS.CellValue[]) ?? [];
    const values = raw.slice(1).map(cellToScalar);
    maxCols = Math.max(maxCols, values.length);
    rows.push(values);
  });
  return rows.map((r) => {
    while (r.length < maxCols) r.push('');
    return r;
  });
}
