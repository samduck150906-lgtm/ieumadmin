import ExcelJS from 'exceljs';

interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
  format?: (value: any) => string | number;
}

interface ExportOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  data: any[];
  headerStyle?: {
    bgColor?: string;
    fontColor?: string;
    bold?: boolean;
  };
}

/**
 * 데이터를 엑셀 파일로 내보내기 (exceljs 사용 — xlsx 대체, 보안 취약점 해소)
 */
export async function exportToExcel({
  filename,
  sheetName = 'Sheet1',
  columns,
  data,
}: ExportOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName, { properties: {} });

  const headers = columns.map(col => col.header);
  const rows = data.map(item =>
    columns.map(col => {
      const raw = getNestedValue(item, col.key);
      const value = col.format ? col.format(raw) : (raw ?? '');
      // ExcelJS는 셀에 문자열/숫자/Date만 안전하게 씀. 그 외는 문자열로 변환
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (value instanceof Date) return value;
      return String(value);
    })
  );

  worksheet.addRow(headers);
  rows.forEach(row => worksheet.addRow(row));

  columns.forEach((col, i) => {
    worksheet.getColumn(i + 1).width = col.width ?? 15;
  });

  const date = new Date().toISOString().split('T')[0];
  const fullFilename = `${filename}_${date}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fullFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // 브라우저가 다운로드를 시작할 시간을 준 후 정리
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * 중첩 객체에서 값 가져오기
 * 예: getNestedValue(obj, 'user.name') -> obj.user.name
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ============================================
// 미리 정의된 내보내기 함수들
// ============================================

/**
 * 공인중개사 목록 내보내기
 */
export function exportRealtors(data: any[]) {
  return exportToExcel({
    filename: '공인중개사_목록',
    sheetName: '공인중개사',
    columns: [
      { key: 'business_name', header: '업체명', width: 20 },
      { key: 'address', header: '주소', width: 40 },
      { key: 'contact_name', header: '담당자', width: 12 },
      { key: 'contact_phone', header: '연락처', width: 15 },
      { key: 'qr_code_url', header: 'QR코드 URL', width: 40 },
      { key: 'user.email', header: '이메일', width: 25 },
      { key: 'referrer.business_name', header: '추천인 업체', width: 20, format: (v) => v ?? '-' },
      { key: 'referrer.contact_name', header: '추천인 담당자', width: 12, format: (v) => v ?? '-' },
      {
        key: 'account_verified',
        header: '계좌인증',
        width: 10,
        format: (v) => (v ? 'O' : 'X'),
      },
      {
        key: 'user.status',
        header: '상태',
        width: 10,
        format: (v) => (v === 'active' ? '활성' : v === 'inactive' ? '비활성' : v || ''),
      },
      {
        key: 'created_at',
        header: '가입일',
        width: 12,
        format: (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : ''),
      },
      {
        key: 'last_excel_downloaded_at',
        header: '엑셀 다운로드 여부',
        width: 14,
        format: (v) => (v ? '다운로드 완료' : '미다운로드'),
      },
      {
        key: 'last_excel_downloaded_at',
        header: '최종 다운로드 날짜',
        width: 18,
        format: (v) => (v ? new Date(v).toLocaleString('ko-KR') : '-'),
      },
    ],
    data,
  });
}

/**
 * 제휴업체 목록 내보내기
 */
export function exportPartners(data: any[]) {
  const categoryLabels: Record<string, string> = {
    moving: '이사',
    cleaning: '청소',
    internet_tv: '인터넷/TV',
    interior: '인테리어',
    appliance_rental: '가전렌탈',
    kiosk: '무인택배',
  };

  return exportToExcel({
    filename: '제휴업체_목록',
    sheetName: '제휴업체',
    columns: [
      { key: 'business_name', header: '업체명', width: 20 },
      { key: 'manager_name', header: '담당자', width: 12 },
      { key: 'manager_phone', header: '연락처', width: 15 },
      {
        key: 'service_categories',
        header: '서비스',
        width: 25,
        format: (v) => (v || []).map((c: string) => categoryLabels[c] || c).join(', '),
      },
      {
        key: 'avg_rating',
        header: '평점',
        width: 8,
        format: (v) => (v ? Number(v).toFixed(1) : '-'),
      },
      { key: 'total_reviews', header: '리뷰수', width: 8 },
      {
        key: 'user.status',
        header: '상태',
        width: 10,
        format: (v) => (v === 'active' ? '활성' : '비활성'),
      },
      {
        key: 'created_at',
        header: '등록일',
        width: 12,
        format: (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : ''),
      },
    ],
    data,
  });
}

/**
 * 서비스 요청 목록 내보내기
 */
export function exportServiceRequests(data: any[]) {
  if (!data || data.length === 0) return Promise.resolve();
  const categoryLabels: Record<string, string> = {
    moving: '이사',
    cleaning: '청소',
    internet_tv: '인터넷/TV',
    interior: '인테리어',
    appliance_rental: '가전렌탈',
    kiosk: '무인택배',
  };

  const statusLabels: Record<string, string> = {
    unread: '미배정',
    read: '열람',
    assigned: '배정완료',
    settlement_check: '정산확인',
    settlement_done: '정산완료',
    hq_review_needed: '본사확인필요',
    cancelled: '취소',
  };

  return exportToExcel({
    filename: '서비스요청_목록',
    sheetName: '서비스요청',
    columns: [
      { key: 'customer.name', header: '고객명', width: 12 },
      { key: 'customer.phone', header: '연락처', width: 15 },
      {
        key: 'category',
        header: '카테고리',
        width: 12,
        format: (v) => categoryLabels[v] || v,
      },
      {
        key: 'hq_status',
        header: '상태',
        width: 10,
        format: (v) => statusLabels[v] || v,
      },
      { key: 'assigned_partner.business_name', header: '배정업체', width: 20 },
      { key: 'customer.moving_date', header: '이사일', width: 12 },
      { key: 'customer.moving_address', header: '이사주소', width: 35 },
      { key: 'customer.source_realtor.business_name', header: '출처', width: 20 },
      {
        key: 'created_at',
        header: '신청일',
        width: 12,
        format: (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : ''),
      },
    ],
    data,
  });
}

/**
 * 정산 내역 내보내기
 */
export function exportSettlements(data: any[]) {
  return exportToExcel({
    filename: '정산내역',
    sheetName: '정산',
    columns: [
      { key: 'realtor.business_name', header: '공인중개사', width: 20 },
      {
        key: 'amount',
        header: '금액',
        width: 15,
        format: (v) => (v ? Number(v).toLocaleString() + '원' : ''),
      },
      { key: 'service_request.category', header: '서비스', width: 12 },
      { key: 'service_request.customer.name', header: '고객명', width: 12 },
      {
        key: 'is_paid',
        header: '지급여부',
        width: 10,
        format: (v) => (v ? '지급완료' : '미지급'),
      },
      {
        key: 'paid_at',
        header: '지급일',
        width: 12,
        format: (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : '-'),
      },
      {
        key: 'created_at',
        header: '생성일',
        width: 12,
        format: (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : ''),
      },
    ],
    data,
  });
}

/**
 * 출금 신청 목록 내보내기
 * API 응답의 realtor가 null이거나 배열인 경우에도 안전하게 처리
 */
export function exportWithdrawals(data: any[]) {
  const statusLabels: Record<string, string> = {
    requested: '신청',
    approved: '승인',
    completed: '완료',
    rejected: '반려',
  };

  const normalized = data.map((row) => {
    const realtor =
      row.realtor != null
        ? Array.isArray(row.realtor)
          ? row.realtor[0]
          : row.realtor
        : {};
    return { ...row, realtor };
  });

  return exportToExcel({
    filename: '출금신청_목록',
    sheetName: '출금신청',
    columns: [
      { key: 'realtor.business_name', header: '공인중개사', width: 20 },
      {
        key: '_account_type_label',
        header: '계좌유형',
        width: 10,
        format: (v: string) => v || '-',
      },
      {
        key: '_tax_type',
        header: '원천세/부가세',
        width: 14,
        format: (v: string) => v || '-',
      },
      {
        key: 'amount',
        header: '신청금액',
        width: 15,
        format: (v: number) => (v ? Number(v).toLocaleString() + '원' : ''),
      },
      {
        key: '_net_amount',
        header: '실지급액',
        width: 15,
        format: (v: number) => (v != null ? Number(v).toLocaleString() + '원' : '-'),
      },
      { key: 'bank_name', header: '은행', width: 12 },
      { key: 'account_number', header: '계좌번호', width: 18 },
      { key: 'account_holder', header: '예금주', width: 12 },
      {
        key: 'status',
        header: '상태',
        width: 10,
        format: (v: string) => statusLabels[v] || v,
      },
      { key: 'reject_reason', header: '반려사유', width: 25 },
      {
        key: 'created_at',
        header: '신청일',
        width: 12,
        format: (v: string) => (v ? new Date(v).toLocaleDateString('ko-KR') : ''),
      },
      {
        key: 'processed_at',
        header: '완료일',
        width: 12,
        format: (v: string) => (v ? new Date(v).toLocaleDateString('ko-KR') : '-'),
      },
    ],
    data: normalized.map((row) => {
      const realtor =
        row.realtor != null ? (Array.isArray(row.realtor) ? row.realtor[0] : row.realtor) : {};
      const isIndividual = realtor?.account_type !== 'business';
      const amount = Number(row.amount) || 0;
      const netAmount = isIndividual ? Math.floor(amount * 0.967) : amount;
      return {
        ...row,
        _account_type_label: isIndividual ? '개인' : '사업자',
        _tax_type: isIndividual ? '원천세 3.3% 공제' : '부가세 10% 세금계산서',
        _net_amount: netAmount,
      };
    }),
  });
}
