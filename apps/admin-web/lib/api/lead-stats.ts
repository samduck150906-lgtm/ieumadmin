/** 가망고객 DB 리드통계 API (본사 전용) */

export interface LeadStatsDailyItem {
  id: string;
  registeredAt: string;
  name: string;
  phone: string;
}

export interface LeadStatsDailyResult {
  data: LeadStatsDailyItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeadStatsMonthlyItem {
  yearMonth: string;
  newCount: number;
  cumulativeCount: number;
}

export interface LeadStatsMonthlyResult {
  data: LeadStatsMonthlyItem[];
}

export async function getLeadStatsDaily(params: {
  year: number;
  month: number;
  page?: number;
  limit?: number;
}): Promise<LeadStatsDailyResult> {
  const { year, month, page = 1, limit = 20 } = params;
  const q = new URLSearchParams({
    year: String(year),
    month: String(month),
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(`/api/lead-stats/daily?${q}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || '일별 조회 실패');
  }
  return res.json();
}

export async function getLeadStatsMonthly(params: { year: number }): Promise<LeadStatsMonthlyResult> {
  const q = new URLSearchParams({ year: String(params.year) });
  const res = await fetch(`/api/lead-stats/monthly?${q}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || '월별 조회 실패');
  }
  return res.json();
}
