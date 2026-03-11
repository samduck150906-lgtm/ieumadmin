export interface Assignment {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  installation_date: string | null;
  partner_memo: string | null;
  reserved_price: number | null;
  subsidy_amount: number | null;
  subsidy_payment_date: string | null;
  cancel_reason: string | null;
  source: 'assigned' | 'purchased';
  memos?: { id: string; memo: string; status_at_time: string | null; created_at: string }[];
  service_request: {
    id: string;
    category: string;
    customer: {
      name: string;
      phone: string;
      moving_address: string;
      current_address: string;
      area_size: string;
      moving_type: string;
      moving_date: string;
    };
  };
}

/** 주소 대분류만 표기 — 시·도 단위 (예: 서울특별시, 경기도) */
export function addressToMajorRegion(addr: string): string {
  if (!addr) return '-';
  const t = addr.trim();
  if (!t) return '-';
  const matchDo = t.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|제주)?(특별시|광역시|특별자치시|도|특별자치도)?/);
  if (matchDo && matchDo[0]) {
    const doPart = matchDo[0].replace(/\s/g, '');
    if (doPart) return doPart;
  }
  const upper = ['수도권', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  for (const u of upper) {
    if (t.startsWith(u)) return u;
  }
  const first = t.split(/\s+/)[0];
  return first || '-';
}

export function normalizeAssignment(raw: unknown): Assignment | null {
  const row = raw as Record<string, unknown>;
  const sr = row.service_request as Record<string, unknown> | unknown[] | undefined;
  const srObj = Array.isArray(sr) ? sr[0] : sr;
  if (!srObj || typeof srObj !== 'object') return null;
  const s = srObj as Record<string, unknown>;
  const cust = s.customer as Record<string, unknown> | unknown[] | undefined;
  const custObj = Array.isArray(cust) ? cust[0] : cust;
  const c = custObj && typeof custObj === 'object' ? (custObj as Record<string, string>) : {};
  return {
    id: String(row.id ?? ''),
    status: String(row.status ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    installation_date: row.installation_date != null ? String(row.installation_date) : null,
    partner_memo: row.partner_memo != null ? String(row.partner_memo) : null,
    reserved_price: row.reserved_price != null ? Number(row.reserved_price) : null,
    subsidy_amount: row.subsidy_amount != null ? Number(row.subsidy_amount) : null,
    subsidy_payment_date: row.subsidy_payment_date != null ? String(row.subsidy_payment_date) : null,
    cancel_reason: row.cancel_reason != null ? String(row.cancel_reason) : null,
    source: (row.source as 'assigned' | 'purchased') || 'assigned',
    service_request: {
      id: s.id != null ? String(s.id) : '',
      category: String(s.category ?? ''),
      customer: {
        name: String(c.name ?? ''),
        phone: String(c.phone ?? ''),
        moving_address: String(c.moving_address ?? ''),
        current_address: String(c.current_address ?? ''),
        area_size: String(c.area_size ?? ''),
        moving_type: String(c.moving_type ?? ''),
        moving_date: String(c.moving_date ?? ''),
      },
    },
  };
}
