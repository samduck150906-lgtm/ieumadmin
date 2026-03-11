/**
 * 리드관리 - 수익금 정산내역 (일별/월별)
 * - 전환 수익금: conversion + consultation (상담요청/전체완료 건별 수익)
 * - 추천 수익금: referral (추천인 5% 적립 — DB에 이미 적립된 금액)
 * - 총 수익금 = 전환 수익금 + 추천 수익금
 * - 추천인 지급금 = DB의 referral 합계 (화면 데이터와 동일)
 * - 정산수익금 = 총 수익금 − 추천인 지급금
 */
import { getSupabaseOrServer } from '../supabase';

export interface DailySettlementRow {
  date: string; // YYYY-MM-DD
  conversionAmount: number;
  referralAmount: number;
  totalAmount: number;
}

export interface MonthlySettlementRow {
  month: string; // YYYY-MM
  totalRevenue: number;
  referrerPayout: number; // DB에 적립된 추천 수익금(referral) 합계 (피추천인 수익의 5%)
  settlementRevenue: number;
}

export async function getSettlementRevenueDaily(
  year: number,
  month: number
): Promise<DailySettlementRow[]> {
  const supabase = getSupabaseOrServer();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  const startStr = start.toISOString().replace('T', ' ').slice(0, 19);
  const endStr = end.toISOString().replace('T', ' ').slice(0, 19);

  const { data, error } = await supabase
    .from('commissions')
    .select('commission_type, amount, created_at')
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  if (error) throw error;

  const byDay = new Map<string, { conversion: number; referral: number }>();

  for (const row of data || []) {
    const d = (row.created_at as string).slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, { conversion: 0, referral: 0 });
    const cur = byDay.get(d)!;
    const amt = Number(row.amount ?? 0);
    if (row.commission_type === 'conversion' || row.commission_type === 'consultation') cur.conversion += amt;
    else if (row.commission_type === 'referral') cur.referral += amt;
  }

  const daysInMonth = end.getDate();
  const rows: DailySettlementRow[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cur = byDay.get(dateStr) ?? { conversion: 0, referral: 0 };
    rows.push({
      date: dateStr,
      conversionAmount: cur.conversion,
      referralAmount: cur.referral,
      totalAmount: cur.conversion + cur.referral,
    });
  }
  return rows.reverse(); // 최근 일자 먼저
}

export async function getSettlementRevenueMonthly(
  year: number,
  month?: number
): Promise<MonthlySettlementRow[]> {
  const supabase = getSupabaseOrServer();
  const start = new Date(year, 0, 1);
  const end = month
    ? new Date(year, month, 0, 23, 59, 59)
    : new Date(year, 11, 31, 23, 59, 59);
  const startStr = start.toISOString().replace('T', ' ').slice(0, 19);
  const endStr = end.toISOString().replace('T', ' ').slice(0, 19);

  const { data, error } = await supabase
    .from('commissions')
    .select('commission_type, amount, created_at')
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  if (error) throw error;

  const byMonth = new Map<string, { conversion: number; referral: number }>();

  for (const row of data || []) {
    const m = (row.created_at as string).slice(0, 7); // YYYY-MM
    if (!byMonth.has(m)) byMonth.set(m, { conversion: 0, referral: 0 });
    const cur = byMonth.get(m)!;
    const amt = Number(row.amount ?? 0);
    if (row.commission_type === 'conversion' || row.commission_type === 'consultation') cur.conversion += amt;
    else if (row.commission_type === 'referral') cur.referral += amt;
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
  if (month) {
    const single = `${year}-${String(month).padStart(2, '0')}`;
    if (!months.includes(single)) months.unshift(single);
  }

  return months.map((m) => {
    const cur = byMonth.get(m) ?? { conversion: 0, referral: 0 };
    const totalRevenue = cur.conversion + cur.referral;
    // 추천인 지급금 = DB에 이미 적립된 referral 합계 (건별 5% 적립 로직과 동일)
    const referrerPayout = cur.referral;
    return {
      month: m,
      totalRevenue,
      referrerPayout,
      settlementRevenue: totalRevenue - referrerPayout,
    };
  });
}
