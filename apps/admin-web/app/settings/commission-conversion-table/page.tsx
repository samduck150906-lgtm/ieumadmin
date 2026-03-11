'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowRight, Printer } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import type { RealtorRevenueShareDefault } from '@/lib/api/settings';
import { AREA_SIZE_LABELS, MOVING_TYPE_LABELS, AREA_SIZE_MOVING_TIERS } from '@/types/database';
import type { AreaSize, MovingType } from '@/types/database';
import Link from 'next/link';

interface ConversionFeeRow {
  label: string;
  consultationFee: number;
  completionFee: number;
}

interface ConversionFeeTable {
  moving: ConversionFeeRow[];
  cleaning: ConversionFeeRow;
  internet: ConversionFeeRow[];
}

const AREA_SIZES: AreaSize[] = AREA_SIZE_MOVING_TIERS;
const MOVING_TYPES: MovingType[] = ['general', 'full_pack', 'half_pack'];

const REVENUE_SHARE_CATEGORIES = [
  { key: 'moving', label: '이사' },
  { key: 'cleaning', label: '입주청소' },
  { key: 'internet_tv', label: '인터넷/TV' },
  { key: 'interior', label: '인테리어' },
  { key: 'appliance_rental', label: '가전렌탈' },
  { key: 'kiosk', label: '키오스크' },
] as const;

export default function CommissionConversionTablePage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feeTable, setFeeTable] = useState<ConversionFeeTable | null>(null);
  const [movingRows, setMovingRows] = useState<Record<string, unknown>[]>([]);
  const [revenueShareDefaults, setRevenueShareDefaults] = useState<RealtorRevenueShareDefault[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/settings/commission-conversion-data', {
        credentials: 'include',
      });
      const body = await res.json();

      if (!res.ok) {
        setLoadError(body?.error ?? '데이터를 불러올 수 없습니다.');
        return;
      }

      const moving = (body.moving ?? []) as Record<string, unknown>[];
      const cleaningData = body.cleaning as Record<string, unknown> | null;
      const internet = (body.internet ?? []) as Record<string, unknown>[];
      const revenueDefaults = (body.revenueShareDefaults ?? []) as RealtorRevenueShareDefault[];

      setMovingRows(moving);
      setRevenueShareDefaults(revenueDefaults);

      const movingFees: ConversionFeeRow[] = moving.map((r) => ({
        label: `${AREA_SIZE_LABELS[r.area_size as string] ?? r.area_size} ${MOVING_TYPE_LABELS[r.moving_type as MovingType] ?? r.moving_type}`,
        consultationFee: Number(r.consultation_fee) || 0,
        completionFee: Number(r.price_per_pyeong) || 0,
      }));

      const cleaningFee: ConversionFeeRow = cleaningData
        ? {
            label: '입주청소',
            consultationFee: Number(cleaningData.consultation_fee) || 0,
            completionFee: Number(cleaningData.price_per_pyeong) || 0,
          }
        : { label: '입주청소', consultationFee: 0, completionFee: 0 };

      const internetFees: ConversionFeeRow[] = internet.map((r) => {
        const typeLabels: Record<string, string> = {
          internet_only: '인터넷만',
          internet_tv: '인터넷+TV',
        };
        return {
          label: typeLabels[r.internet_type as string] ?? (r.internet_type as string),
          consultationFee: Number(r.consultation_fee) || 0,
          completionFee: Number(r.price_per_pyeong) || 0,
        };
      });

      setFeeTable({ moving: movingFees, cleaning: cleaningFee, internet: internetFees });
    } catch (error) {
      const message = error instanceof Error ? error.message : '데이터를 불러올 수 없습니다.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        {/* 헤더 */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">수수료 전환표</h1>
            <p className="mt-1 text-sm text-gray-500">
              공인중개사에게 지급되는 수수료 요약표입니다. 모바일 앱에서도 동일하게 노출됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Printer className="w-4 h-4" />
              인쇄
            </button>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
            <Link
              href="/settings/db-prices"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              가격 설정 수정
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">로딩 중...</div>
        ) : !feeTable ? (
          <div className="p-12 text-center">
            <p className="text-gray-700 font-medium">데이터를 불러올 수 없습니다.</p>
            {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}
            <p className="mt-4 text-sm text-gray-500">새로고침 버튼을 눌러 다시 시도해 주세요.</p>
          </div>
        ) : (
          <>
            {/* 전환 수익금표 (모바일 앱 동일) */}
            <section className="bg-white rounded-xl border border-gray-200 p-6 print:border-0 print:shadow-none print:p-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                전환 수익금표
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                서비스 카테고리별 상담요청 시 / 전체완료 시 공인중개사 수수료
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b w-1/3">구분</th>
                      <th className="px-4 py-3 text-right font-semibold text-blue-700 border-b w-1/3">상담요청 시</th>
                      <th className="px-4 py-3 text-right font-semibold text-emerald-700 border-b w-1/3">전체완료 시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 이사 */}
                    {feeTable.moving.length > 0 && (
                      <>
                        <tr className="bg-blue-50/50">
                          <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-blue-700 border-b">
                            이사
                          </td>
                        </tr>
                        {feeTable.moving.map((row, i) => (
                          <tr key={`m-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                              {row.consultationFee.toLocaleString()}원
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                              {row.completionFee.toLocaleString()}원
                            </td>
                          </tr>
                        ))}
                      </>
                    )}

                    {/* 청소 */}
                    <tr className="bg-green-50/50">
                      <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-green-700 border-b border-t">
                        입주청소
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">{feeTable.cleaning.label}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                        {feeTable.cleaning.consultationFee.toLocaleString()}원
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                        평당 {feeTable.cleaning.completionFee.toLocaleString()}원
                      </td>
                    </tr>

                    {/* 인터넷 */}
                    {feeTable.internet.length > 0 && (
                      <>
                        <tr className="bg-purple-50/50">
                          <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-purple-700 border-b border-t">
                            인터넷 & TV
                          </td>
                        </tr>
                        {feeTable.internet.map((row, i) => (
                          <tr key={`i-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                              {row.consultationFee.toLocaleString()}원
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-medium tabular-nums">
                              평당 {row.completionFee.toLocaleString()}원
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 업종별 수익쉐어 요약 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6 print:border-0 print:shadow-none print:p-0 print:mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                업종별 수익쉐어 설정 현황
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                업종별로 설정된 중개사 수익쉐어 금액 및 추천수익 정책 요약
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">업종</th>
                      <th className="px-4 py-3 text-right font-semibold text-blue-700 border-b">
                        상담요청 시<br />
                        <span className="text-xs font-normal text-blue-500">중개사 수익 (원)</span>
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-emerald-700 border-b">
                        전체완료 시<br />
                        <span className="text-xs font-normal text-emerald-500">중개사 수익 (원)</span>
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-violet-700 border-b">
                        추천수익<br />
                        <span className="text-xs font-normal text-violet-500">요율 / 기간</span>
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-orange-700 border-b">
                        업체 과금<br />
                        <span className="text-xs font-normal text-orange-500">완료가 기본 (원)</span>
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-500 border-b">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REVENUE_SHARE_CATEGORIES.map(({ key, label }) => {
                      const row = revenueShareDefaults.find((r) => r.category === key);
                      return (
                        <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row?.realtor_commission_amount != null
                              ? <span className="text-gray-900 font-medium">{row.realtor_commission_amount.toLocaleString()}원</span>
                              : <span className="text-gray-400">미설정</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row?.realtor_commission_complete_amount != null
                              ? <span className="text-gray-900 font-medium">{row.realtor_commission_complete_amount.toLocaleString()}원</span>
                              : <span className="text-gray-400">미설정</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <span className="text-gray-900">{row?.referral_pct ?? 5}%</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-gray-900">{row?.referral_duration_months ?? 12}개월</span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row?.partner_payment_request_amount != null
                              ? <span className="text-gray-900 font-medium">{row.partner_payment_request_amount.toLocaleString()}원</span>
                              : <span className="text-gray-400">미설정</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[160px] truncate">
                            {row?.memo || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 이사 상세 매트릭스 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6 print:border-0 print:shadow-none print:p-0 print:mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                이사 — 평수별 상세 매트릭스
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                평수 x 이사형태별 열람가(업체 과금) / 상담 수익(중개사) / 완료 수익(중개사) 현황
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th rowSpan={2} className="px-4 py-2 text-left font-semibold text-gray-700 border-b border-r">평수</th>
                      {MOVING_TYPES.map((mt) => (
                        <th key={mt} colSpan={3} className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                          {MOVING_TYPE_LABELS[mt]}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-gray-50 text-xs">
                      {MOVING_TYPES.flatMap((mt) => [
                        <th key={`${mt}-v`} className="px-2 py-1.5 text-center border-b border-r">
                          <span className="text-orange-600 font-semibold">열람가</span>
                        </th>,
                        <th key={`${mt}-q`} className="px-2 py-1.5 text-center border-b">
                          <span className="text-blue-600 font-semibold">상담 수익</span>
                        </th>,
                        <th key={`${mt}-c`} className="px-2 py-1.5 text-center border-b border-r">
                          <span className="text-emerald-600 font-semibold">계약시 평당</span>
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {AREA_SIZES.map((areaSize) => (
                      <tr key={areaSize} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-700 border-r">{AREA_SIZE_LABELS[areaSize]}</td>
                        {MOVING_TYPES.flatMap((movingType) => {
                          const cell = movingRows.find(
                            (r) => r.area_size === areaSize && r.moving_type === movingType
                          );
                          const viewPrice = Number((cell as Record<string, unknown>)?.view_price ?? 0);
                          const consultationFee = Number((cell as Record<string, unknown>)?.consultation_fee ?? 0);
                          const pricePerPyeong = Number((cell as Record<string, unknown>)?.price_per_pyeong ?? 0);
                          return [
                            <td key={`${areaSize}-${movingType}-v`} className="px-2 py-2.5 text-center tabular-nums border-r">
                              {viewPrice > 0
                                ? <span className="text-orange-700 font-medium">{viewPrice.toLocaleString()}</span>
                                : <span className="text-gray-300">0</span>}
                            </td>,
                            <td key={`${areaSize}-${movingType}-q`} className="px-2 py-2.5 text-center tabular-nums">
                              {consultationFee > 0
                                ? <span className="text-blue-700 font-medium">{consultationFee.toLocaleString()}</span>
                                : <span className="text-gray-300">0</span>}
                            </td>,
                            <td key={`${areaSize}-${movingType}-c`} className="px-2 py-2.5 text-center tabular-nums border-r">
                              {pricePerPyeong > 0
                                ? <span className="text-emerald-700 font-medium">{pricePerPyeong.toLocaleString()}원/평</span>
                                : <span className="text-gray-300">0</span>}
                            </td>,
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-400">단위: 원 (KRW)</p>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
