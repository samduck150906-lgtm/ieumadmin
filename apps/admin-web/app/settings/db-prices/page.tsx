'use client';

import { useState, useEffect, useCallback } from 'react';
import { Percent, Save, RefreshCw, Truck, Sparkles, Wifi, DollarSign, Star, Gift, History, CheckCircle2, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';
import { logger } from '@/lib/logger';
import {
  getDbPriceMoving,
  getDbPriceCleaning,
  getDbPriceInternet,
  getDbPriceInterior,
  upsertDbPriceMoving,
  upsertDbPriceCleaning,
  upsertDbPriceInternet,
  upsertDbPriceInterior,
} from '@/lib/api/db-prices';
import {
  getSiteSettings,
  updateSiteSettings,
  getRealtorRevenueShareDefaults,
  upsertRealtorRevenueShareDefault,
  getDbPriceVersions,
  createDbPriceVersion,
} from '@/lib/api/settings';
import type { RealtorRevenueShareDefault, DbPriceVersion } from '@/lib/api/settings';
import { AREA_SIZE_LABELS, MOVING_TYPE_LABELS, AREA_SIZE_MOVING_TIERS, SERVICE_CATEGORY_LABELS } from '@/types/database';
import type { AreaSize, MovingType } from '@/types/database';

const AREA_SIZES: AreaSize[] = AREA_SIZE_MOVING_TIERS;
const MOVING_TYPES: MovingType[] = ['general', 'full_pack', 'half_pack', 'cargo'];

const REVENUE_SHARE_CATEGORIES = [
  { key: 'moving', label: '이사' },
  { key: 'cleaning', label: '입주청소' },
  { key: 'internet_tv', label: '인터넷/TV' },
  { key: 'interior', label: '인테리어' },
  { key: 'appliance_rental', label: '가전렌탈' },
  { key: 'kiosk', label: '키오스크' },
] as const;

export default function DbPricesPage() {
  const [loading, setLoading] = useState(true);
  const [movingRows, setMovingRows] = useState<any[]>([]);
  const [cleaning, setCleaning] = useState<{ view_price?: number; price_per_pyeong?: number; consultation_fee?: number; max_completion_fee?: number | null } | null>(null);
  const [interior, setInterior] = useState<{ view_price?: number; price_per_pyeong?: number; consultation_fee?: number; max_completion_fee?: number | null } | null>(null);
  const [internetRows, setInternetRows] = useState<any[]>([]);
  const [realtorShareConsultationPct, setRealtorShareConsultationPct] = useState<number | ''>('');
  const [realtorShareCompletePct, setRealtorShareCompletePct] = useState<number | ''>('');
  const [revenueShareDefaults, setRevenueShareDefaults] = useState<RealtorRevenueShareDefault[]>([]);
  const [priceVersions, setPriceVersions] = useState<DbPriceVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionAppliedAt, setVersionAppliedAt] = useState(new Date().toISOString().slice(0, 10));
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  // 추천수익 정책
  const [referralCommissionRate, setReferralCommissionRate] = useState<number | ''>('');
  const [referralDurationMonths, setReferralDurationMonths] = useState<number | ''>('');
  // 마일리지 정책
  const [mileageTier1Threshold, setMileageTier1Threshold] = useState<number | ''>('');
  const [mileageTier1Pct, setMileageTier1Pct] = useState<number | ''>('');
  const [mileageTier2Threshold, setMileageTier2Threshold] = useState<number | ''>('');
  const [mileageTier2Pct, setMileageTier2Pct] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [moving, cleaningData, internet, interiorData, siteSettings, revenueDefaults, versions] = await Promise.all([
        getDbPriceMoving(),
        getDbPriceCleaning(),
        getDbPriceInternet(),
        getDbPriceInterior(),
        getSiteSettings(),
        getRealtorRevenueShareDefaults(),
        getDbPriceVersions(10),
      ]);
      setMovingRows(moving);
      setCleaning(cleaningData);
      setInternetRows(internet);
      setInterior(interiorData);
      setRealtorShareConsultationPct(siteSettings?.realtor_share_consultation_pct ?? '');
      setRealtorShareCompletePct(siteSettings?.realtor_share_complete_pct ?? '');
      setReferralCommissionRate(siteSettings?.commission_rate ?? '');
      setReferralDurationMonths(siteSettings?.referral_duration_months ?? '');
      setMileageTier1Threshold(siteSettings?.mileage_tier1_threshold ?? 2000000);
      setMileageTier1Pct(siteSettings?.mileage_tier1_pct ?? 3);
      setMileageTier2Threshold(siteSettings?.mileage_tier2_threshold ?? 5000000);
      setMileageTier2Pct(siteSettings?.mileage_tier2_pct ?? 5);
      setRevenueShareDefaults(revenueDefaults);
      setPriceVersions(versions);
    } catch (error) {
      logger.error('DB 가격 로드 오류', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getMovingCell = (areaSize: AreaSize, movingType: MovingType) => {
    return movingRows.find((r) => r.area_size === areaSize && r.moving_type === movingType);
  };

  const handleSaveMoving = async (
    areaSize: AreaSize,
    movingType: MovingType,
    viewPrice: number,
    pricePerPyeong: number,
    consultationFee: number,
    maxCompletionFee?: number | null
  ) => {
    setSaving(true);
    try {
      await upsertDbPriceMoving(areaSize, movingType, viewPrice, pricePerPyeong, consultationFee, maxCompletionFee);
      toast.success('저장되었습니다.');
      loadData();
    } catch (error: any) {
      const msg = error?.message ?? '';
      toast.error(msg.includes('schema cache') ? '저장 실패: DB 가격 테이블이 적용되지 않았습니다. Supabase SQL Editor에서 supabase/migrations/20260224130000_db_price_tables_ensure.sql 을 실행해 주세요.' : '저장 실패: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInterior = async (viewPrice: number, pricePerPyeong: number, consultationFee: number, maxCompletionFee?: number | null) => {
    setSaving(true);
    try {
      await upsertDbPriceInterior(viewPrice, pricePerPyeong, consultationFee, maxCompletionFee);
      toast.success('저장되었습니다.');
      loadData();
    } catch (error: any) {
      const msg = error?.message ?? '';
      toast.error(msg.includes('schema cache') ? '저장 실패: DB 가격 테이블이 적용되지 않았습니다.' : '저장 실패: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCleaning = async (viewPrice: number, pricePerPyeong: number, consultationFee: number, maxCompletionFee?: number | null) => {
    setSaving(true);
    try {
      await upsertDbPriceCleaning(viewPrice, pricePerPyeong, consultationFee, maxCompletionFee);
      toast.success('저장되었습니다.');
      loadData();
    } catch (error: any) {
      const msg = error?.message ?? '';
      toast.error(msg.includes('schema cache') ? '저장 실패: DB 가격 테이블이 적용되지 않았습니다. Supabase SQL Editor에서 supabase/migrations/20260224130000_db_price_tables_ensure.sql 을 실행해 주세요.' : '저장 실패: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInternet = async (
    internetType: string,
    viewPrice: number,
    pricePerPyeong: number,
    consultationFee: number
  ) => {
    setSaving(true);
    try {
      await upsertDbPriceInternet(
        internetType as 'internet_only' | 'internet_tv',
        viewPrice,
        pricePerPyeong,
        consultationFee
      );
      toast.success('저장되었습니다.');
      loadData();
    } catch (error: any) {
      const msg = error?.message ?? '';
      toast.error(msg.includes('schema cache') ? '저장 실패: DB 가격 테이블이 적용되지 않았습니다. Supabase SQL Editor에서 supabase/migrations/20260224130000_db_price_tables_ensure.sql 을 실행해 주세요.' : '저장 실패: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReferralPolicy = async () => {
    const rate = referralCommissionRate === '' ? null : Number(referralCommissionRate);
    const months = referralDurationMonths === '' ? null : Number(referralDurationMonths);
    if (rate !== null && (rate < 0 || rate > 100)) {
      toast.error('추천수익 요율은 0~100 사이로 입력해 주세요.');
      return;
    }
    if (months !== null && (months < 1 || months > 120)) {
      toast.error('추천 기간은 1~120개월 사이로 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateSiteSettings({
        commission_rate: rate ?? 5,
        referral_duration_months: months ?? 12,
      });
      toast.success('추천수익 정책이 저장되었습니다.');
      loadData();
    } catch (error: any) {
      toast.error('저장 실패: ' + (error?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMileagePolicy = async () => {
    const t1 = mileageTier1Threshold === '' ? null : Number(mileageTier1Threshold);
    const p1 = mileageTier1Pct === '' ? null : Number(mileageTier1Pct);
    const t2 = mileageTier2Threshold === '' ? null : Number(mileageTier2Threshold);
    const p2 = mileageTier2Pct === '' ? null : Number(mileageTier2Pct);
    if (t1 !== null && t1 < 0) { toast.error('1단계 기준금액은 0 이상이어야 합니다.'); return; }
    if (p1 !== null && (p1 < 0 || p1 > 100)) { toast.error('1단계 요율은 0~100 사이로 입력해 주세요.'); return; }
    if (t2 !== null && t2 < 0) { toast.error('2단계 기준금액은 0 이상이어야 합니다.'); return; }
    if (p2 !== null && (p2 < 0 || p2 > 100)) { toast.error('2단계 요율은 0~100 사이로 입력해 주세요.'); return; }
    setSaving(true);
    try {
      await updateSiteSettings({
        mileage_tier1_threshold: t1 ?? 2000000,
        mileage_tier1_pct: p1 ?? 3,
        mileage_tier2_threshold: t2 ?? 5000000,
        mileage_tier2_pct: p2 ?? 5,
      });
      toast.success('마일리지 정책이 저장되었습니다.');
      loadData();
    } catch (error: any) {
      toast.error('저장 실패: ' + (error?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRealtorSharePct = async () => {
    const c = realtorShareConsultationPct === '' ? null : Number(realtorShareConsultationPct);
    const p = realtorShareCompletePct === '' ? null : Number(realtorShareCompletePct);
    if (c !== null && (c < 0 || c > 100)) {
      toast.error('상담요청 비율은 0~100 사이로 입력해 주세요.');
      return;
    }
    if (p !== null && (p < 0 || p > 100)) {
      toast.error('전체완료 비율은 0~100 사이로 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateSiteSettings({
        realtor_share_consultation_pct: c,
        realtor_share_complete_pct: p,
      });
      toast.success('저장되었습니다.');
      loadData();
    } catch (error: any) {
      toast.error('저장 실패: ' + (error?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVersionSnapshot = async () => {
    if (!versionAppliedAt) {
      toast.error('적용일을 입력해 주세요.');
      return;
    }
    setSnapshotSaving(true);
    try {
      const [moving, cleaningData, internet, interiorData, revenueDefaults] = await Promise.all([
        getDbPriceMoving(),
        getDbPriceCleaning(),
        getDbPriceInternet(),
        getDbPriceInterior(),
        getRealtorRevenueShareDefaults(),
      ]);
      const snapshot = {
        saved_at: new Date().toISOString(),
        revenue_share_defaults: revenueDefaults,
        moving: moving,
        cleaning: cleaningData,
        internet: internet,
        interior: interiorData,
      };
      await createDbPriceVersion({
        version_label: versionLabel.trim() || null,
        applied_at: versionAppliedAt,
        snapshot,
      });
      toast.success('가격 버전이 저장되었습니다.');
      setVersionLabel('');
      loadData();
    } catch (e: any) {
      toast.error('저장 실패: ' + (e?.message ?? ''));
    } finally {
      setSnapshotSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* 범례 + 안내 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-3">
          <p className="font-semibold text-gray-800">DB 가격 · 수익쉐어 통합 설정</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2 bg-orange-50 rounded-lg px-3 py-2.5">
              <span className="mt-0.5 inline-block w-3 h-3 rounded-full bg-orange-400 shrink-0" />
              <div>
                <p className="font-semibold text-orange-800">업체 과금 (제휴업체 → 플랫폼)</p>
                <p className="text-xs text-orange-700 mt-0.5">
                  <strong>열람가</strong>: DB 구매 시 업체 결제액<br />
                  <strong>완료가(결제요청)</strong>: 전체완료 후 청구하는 기본 금액
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5">
              <span className="mt-0.5 inline-block w-3 h-3 rounded-full bg-blue-400 shrink-0" />
              <div>
                <p className="font-semibold text-blue-800">중개사 수익 (플랫폼 → 공인중개사)</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  <strong>상담요청 수익</strong>: 고객 DB 상담 신청 시 지급<br />
                  <strong>전체완료 수익</strong>: 제휴업체 서비스 완료 후 지급
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DB 가격 · 수익쉐어 설정</h1>
            <p className="mt-1 text-sm text-gray-500">
              <span className="text-orange-600 font-medium">업체 과금(열람가·완료가)</span>
              &nbsp;+&nbsp;
              <span className="text-blue-600 font-medium">중개사 수익(상담요청·전체완료)</span>
              을 한 화면에서 관리
            </p>
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">로딩 중...</div>
        ) : (
          <>
            {/* 추천수익 정책 */}
            <section className="bg-white rounded-xl border border-blue-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
                <Gift className="w-5 h-5 text-blue-600" />
                추천수익 정책 (공인중개사 추천가입)
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                공인중개사가 다른 중개사를 추천하여 가입한 경우, 추천인에게 지급하는 수익 요율과 유효 기간입니다.
                <br />
                <strong>현재 정책: {referralCommissionRate || 5}% / {referralDurationMonths || 12}개월({Math.round(Number(referralDurationMonths || 12) / 12)}년) 유효</strong>
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">추천수익 요율</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={referralCommissionRate}
                    onChange={(e) => setReferralCommissionRate(e.target.value === '' ? '' : Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                    placeholder="예: 5"
                  />
                  <span className="text-gray-600">%</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">유효 기간</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={referralDurationMonths}
                    onChange={(e) => setReferralDurationMonths(e.target.value === '' ? '' : Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                    placeholder="예: 12"
                  />
                  <span className="text-gray-600">개월</span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveReferralPolicy}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
              </div>
              <p className="mt-3 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                안내 문구 예시: <em>&ldquo;추천수익 {referralCommissionRate || 5}% — 추천인이 가입 후 {referralDurationMonths || 12}개월 이내 완료된 서비스에 대해 {referralCommissionRate || 5}%를 적립합니다.&rdquo;</em>
              </p>
            </section>

            {/* 마일리지 적립 정책 */}
            <section className="bg-white rounded-xl border border-purple-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
                <Star className="w-5 h-5 text-purple-600" />
                마일리지 적립 정책 (제휴업체)
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                제휴업체가 결제 완료 시 적립되는 마일리지 요율입니다. 결제 금액 기준 단계별로 적용됩니다.
              </p>
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-3 border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700">1단계</p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 w-24">기준금액 이상</label>
                    <input
                      type="number"
                      min={0}
                      step={100000}
                      value={mileageTier1Threshold}
                      onChange={(e) => setMileageTier1Threshold(e.target.value === '' ? '' : Number(e.target.value))}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-36"
                      placeholder="2000000"
                    />
                    <span className="text-gray-600">원</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 w-24">적립 요율</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={mileageTier1Pct}
                      onChange={(e) => setMileageTier1Pct(e.target.value === '' ? '' : Number(e.target.value))}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                      placeholder="3"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                </div>
                <div className="space-y-3 border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700">2단계</p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 w-24">기준금액 이상</label>
                    <input
                      type="number"
                      min={0}
                      step={100000}
                      value={mileageTier2Threshold}
                      onChange={(e) => setMileageTier2Threshold(e.target.value === '' ? '' : Number(e.target.value))}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-36"
                      placeholder="5000000"
                    />
                    <span className="text-gray-600">원</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 w-24">적립 요율</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={mileageTier2Pct}
                      onChange={(e) => setMileageTier2Pct(e.target.value === '' ? '' : Number(e.target.value))}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                      placeholder="5"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleSaveMileagePolicy}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  마일리지 정책 저장
                </button>
                <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                  현재 정책: {(mileageTier1Threshold || 2000000).toLocaleString()}원↑ {mileageTier1Pct || 3}%,
                  &nbsp;{(mileageTier2Threshold || 5000000).toLocaleString()}원↑ {mileageTier2Pct || 5}% 적립
                </p>
              </div>
            </section>

            {/* 부동산 수익쉐어 전용 (비율) */}
            <section className="bg-white rounded-xl border border-amber-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
                <Percent className="w-5 h-5 text-amber-600" />
                부동산 수익쉐어 전용 (비율)
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                참고용 기본 비율(%)입니다. 실제 지급액은 아래 이사·청소·인터넷별 <strong>금액</strong>으로 설정됩니다. 비워두면 비율 미사용입니다.
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">상담요청 시 부동산 비율</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={realtorShareConsultationPct}
                    onChange={(e) => setRealtorShareConsultationPct(e.target.value === '' ? '' : Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                    placeholder="예: 70"
                  />
                  <span className="text-gray-600">%</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">전체완료 시 부동산 비율</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={realtorShareCompletePct}
                    onChange={(e) => setRealtorShareCompletePct(e.target.value === '' ? '' : Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24"
                    placeholder="예: 70"
                  />
                  <span className="text-gray-600">%</span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveRealtorSharePct}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  비율 저장
                </button>
              </div>
            </section>

            {/* 이사: 평수 × 이사형태 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                <Truck className="w-5 h-5 text-blue-600" />
                이사
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                평수 × 이사형태별 &nbsp;
                <span className="text-orange-600 font-medium">열람가(업체 과금)</span>
                &nbsp;/&nbsp;
                <span className="text-blue-600 font-medium">상담 수익(중개사)</span>
                &nbsp;/&nbsp;
                <span className="text-blue-600 font-medium">완료 수익(중개사)</span>
                &nbsp;— 단위: 원
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">평수</th>
                      {MOVING_TYPES.map((mt) => (
                        <th key={mt} colSpan={4} className="px-4 py-2 text-center text-sm font-medium text-gray-700 border-b">
                          {MOVING_TYPE_LABELS[mt]}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs text-gray-500 border-b"></th>
                      {MOVING_TYPES.flatMap((mt) => [
                        <th key={`${mt}-v`} className="px-2 py-2 text-center text-xs border-b">
                          <span className="text-orange-600 font-semibold">열람가격(지정가)</span><br />
                          <span className="text-orange-400 text-[10px]">업체 과금</span>
                        </th>,
                        <th key={`${mt}-q`} className="px-2 py-2 text-center text-xs border-b">
                          <span className="text-blue-600 font-semibold">상담요청 수익</span><br />
                          <span className="text-blue-400 text-[10px]">중개사 지급</span>
                        </th>,
                        <th key={`${mt}-c`} className="px-2 py-2 text-center text-xs border-b">
                          <span className="text-blue-600 font-semibold">계약시가격(평당)</span><br />
                          <span className="text-blue-400 text-[10px]">원/평</span>
                        </th>,
                        <th key={`${mt}-m`} className="px-2 py-2 text-center text-xs border-b">
                          <span className="text-amber-600 font-semibold">최대 수수료(상한)</span><br />
                          <span className="text-amber-400 text-[10px]">원</span>
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {AREA_SIZES.map((areaSize) => (
                      <tr key={areaSize} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-700">{AREA_SIZE_LABELS[areaSize]}</td>
                        {MOVING_TYPES.map((movingType) => {
                          const cell = getMovingCell(areaSize, movingType);
                          return (
                            <MovingCellEditor
                              key={`${areaSize}-${movingType}`}
                              viewPrice={cell?.view_price ?? 0}
                              pricePerPyeong={cell?.price_per_pyeong ?? 0}
                              consultationFee={cell?.consultation_fee ?? 0}
                              maxCompletionFee={cell?.max_completion_fee ?? 100000}
                              onSave={(v, p, q, max) => handleSaveMoving(areaSize, movingType, v, p, q, max)}
                              saving={saving}
                            />
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 청소: 열람가격(지정가) + 계약시가격(평당) */}
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                <Sparkles className="w-5 h-5 text-green-600" />
                입주청소
              </h2>
              <p className="text-sm text-gray-500 mb-4">열람가격(지정가) · 계약시가격(평당) · 상담요청(부동산 수익쉐어) · 계약시점 최대 수수료(원, 상한 없음 시 비움)</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">열람가(지정가)</label>
                  <input
                    type="number"
                    defaultValue={cleaning?.view_price ?? 5000}
                    id="cleaning-view-price"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-32"
                    min={0}
                  />
                  <span className="text-gray-600">원</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">계약시 평당</label>
                  <input
                    type="number"
                    defaultValue={cleaning?.price_per_pyeong ?? 3000}
                    id="cleaning-price"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-32"
                    min={0}
                  />
                  <span className="text-gray-600">원/평</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">상담요청 <span className="text-blue-600">(부동산 수익쉐어)</span></label>
                  <input
                    type="number"
                    defaultValue={cleaning?.consultation_fee ?? 0}
                    id="cleaning-consultation-fee"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-28"
                    min={0}
                  />
                  <span className="text-gray-600">원</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">계약시점 최대 수수료</label>
                  <input
                    type="number"
                    defaultValue={cleaning?.max_completion_fee ?? 80000}
                    id="cleaning-max-completion-fee"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-28"
                    min={0}
                    placeholder="상한 없음"
                  />
                  <span className="text-gray-600">원</span>
                </div>
                <button
                  onClick={() => {
                    const viewPrice = Number((document.getElementById('cleaning-view-price') as HTMLInputElement)?.value) || 0;
                    const pricePerPyeong = Number((document.getElementById('cleaning-price') as HTMLInputElement)?.value) || 0;
                    const q = Number((document.getElementById('cleaning-consultation-fee') as HTMLInputElement)?.value) || 0;
                    const maxVal = (document.getElementById('cleaning-max-completion-fee') as HTMLInputElement)?.value;
                    const maxFee = maxVal === '' || maxVal === undefined ? null : Number(maxVal) || null;
                    handleSaveCleaning(viewPrice, pricePerPyeong, q, maxFee);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
              </div>
            </section>

            {/* 인테리어: 열람가격 + 계약시가격(평당) + 상한 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                <Home className="w-5 h-5 text-amber-600" />
                인테리어
              </h2>
              <p className="text-sm text-gray-500 mb-4">열람가격(지정가) · 계약시가격(평당) · 상담요청 · 계약시점 최대 수수료. 정책: 열람 10,000원, 평당 15,000원, 상한 400,000원</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">열람가(지정가)</label>
                    <input
                      type="number"
                      id="interior-view-price"
                      defaultValue={interior?.view_price ?? 10000}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-32"
                      min={0}
                    />
                    <span className="text-gray-600">원</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">계약시 평당</label>
                    <input
                      type="number"
                      id="interior-price"
                      defaultValue={interior?.price_per_pyeong ?? 15000}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-32"
                      min={0}
                    />
                    <span className="text-gray-600">원/평</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">상담요청</label>
                    <input
                      type="number"
                      id="interior-consultation-fee"
                      defaultValue={interior?.consultation_fee ?? 0}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-28"
                      min={0}
                    />
                    <span className="text-gray-600">원</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">계약시점 최대 수수료</label>
                    <input
                      type="number"
                      id="interior-max-completion-fee"
                      defaultValue={interior?.max_completion_fee ?? 400000}
                      className="border border-gray-300 rounded-lg px-3 py-2 w-28"
                      min={0}
                    />
                    <span className="text-gray-600">원</span>
                  </div>
                  <button
                    onClick={() => {
                      const viewPrice = Number((document.getElementById('interior-view-price') as HTMLInputElement)?.value) || 0;
                      const pricePerPyeong = Number((document.getElementById('interior-price') as HTMLInputElement)?.value) || 0;
                      const q = Number((document.getElementById('interior-consultation-fee') as HTMLInputElement)?.value) || 0;
                      const maxVal = (document.getElementById('interior-max-completion-fee') as HTMLInputElement)?.value;
                      const maxFee = maxVal === '' || maxVal === undefined ? null : Number(maxVal) || null;
                      handleSaveInterior(viewPrice, pricePerPyeong, q, maxFee);
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    저장
                  </button>
                </div>
              </div>
            </section>

            {/* 업종별 공인중개사 수익쉐어 설정 — 메인 설정 */}
            <section className="bg-white rounded-xl border border-green-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-1">
                <DollarSign className="w-5 h-5 text-green-600" />
                업종별 공인중개사 수익쉐어 설정
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                각 업종의 <strong className="text-blue-700">상담요청 시</strong> · <strong className="text-emerald-700">전체완료 시</strong> 중개사 수익쉐어 금액과
                <strong className="text-violet-700"> 추천수익(%, 기간)</strong>을 설정합니다.
                저장 후 아래 <em>버전 확정</em> 버튼으로 스냅샷을 남겨 두세요.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th rowSpan={2} className="px-4 py-2 text-left font-medium text-gray-700 border-b border-r">업종</th>
                      <th colSpan={2} className="px-4 py-2 text-center font-semibold text-blue-700 border-b border-r bg-blue-50">
                        🔵 중개사 수익 (원)
                      </th>
                      <th colSpan={2} className="px-4 py-2 text-center font-semibold text-violet-700 border-b border-r bg-violet-50">추천수익</th>
                      <th rowSpan={2} className="px-4 py-2 text-center font-semibold text-orange-700 border-b border-r bg-orange-50">
                        🟠 업체 과금<br />
                        <span className="text-xs font-normal text-orange-600">완료가 기본금액 (원)</span>
                      </th>
                      <th rowSpan={2} className="px-4 py-2 text-center font-medium text-gray-600 border-b border-r">비고</th>
                      <th rowSpan={2} className="px-4 py-2 text-center font-medium text-gray-600 border-b">저장</th>
                    </tr>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="px-2 py-1 text-center border-b border-r text-blue-600">상담요청 시</th>
                      <th className="px-2 py-1 text-center border-b border-r text-emerald-600">전체완료 시</th>
                      <th className="px-2 py-1 text-center border-b border-r text-violet-600">요율 (%)</th>
                      <th className="px-2 py-1 text-center border-b border-r text-violet-600">기간 (개월)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REVENUE_SHARE_CATEGORIES.map(({ key, label }) => {
                      const row = revenueShareDefaults.find((r) => r.category === key);
                      return (
                        <RevenueShareDefaultRow
                          key={key}
                          category={key}
                          label={label}
                          realtorAmount={row?.realtor_commission_amount ?? null}
                          realtorCompleteAmount={row?.realtor_commission_complete_amount ?? null}
                          referralPct={row?.referral_pct ?? 5}
                          referralDurationMonths={row?.referral_duration_months ?? 12}
                          partnerAmount={row?.partner_payment_request_amount ?? null}
                          memo={row?.memo ?? ''}
                          saving={saving}
                          onSave={async (realtorAmt, realtorCompleteAmt, refPct, refMonths, partnerAmt, memo) => {
                            setSaving(true);
                            try {
                              await upsertRealtorRevenueShareDefault(key, {
                                realtor_commission_amount: realtorAmt,
                                realtor_commission_complete_amount: realtorCompleteAmt,
                                referral_pct: refPct,
                                referral_duration_months: refMonths,
                                partner_payment_request_amount: partnerAmt,
                                memo: memo || null,
                              });
                              toast.success(`${label} 설정이 저장되었습니다.`);
                              loadData();
                            } catch (e: any) {
                              toast.error('저장 실패: ' + (e?.message ?? ''));
                            } finally {
                              setSaving(false);
                            }
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* DB 가격 버전 확정 / 스냅샷 */}
            <section className="bg-white rounded-xl border border-indigo-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
                <History className="w-5 h-5 text-indigo-600" />
                DB 가격 버전 확정 (스냅샷)
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                위 설정을 모두 저장한 뒤 아래에서 <strong>버전 확정</strong>하면 현재 시점의 전체 가격 설정이 스냅샷으로 기록됩니다.
                DB(고객 정보 DB) 생성 시 어떤 요금표가 적용되었는지 이력으로 추적할 수 있습니다.
              </p>
              <div className="flex flex-wrap items-end gap-4 mb-6">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">버전 명칭 (선택)</label>
                  <input
                    type="text"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    placeholder="예: 2026-03 요금표"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-52 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">적용 시작일 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={versionAppliedAt}
                    onChange={(e) => setVersionAppliedAt(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveVersionSnapshot}
                  disabled={snapshotSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {snapshotSaving ? '저장 중...' : '버전 확정 저장'}
                </button>
              </div>
              {priceVersions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">최근 확정 이력</p>
                  <div className="space-y-1">
                    {priceVersions.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-indigo-600 font-medium">{v.applied_at}</span>
                        <span className="text-gray-500">{v.version_label || '(이름 없음)'}</span>
                        <span className="text-xs text-gray-400 ml-auto">{new Date(v.created_at).toLocaleString('ko-KR')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 인터넷 */}
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                <Wifi className="w-5 h-5 text-purple-600" />
                인터넷 & TV
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                유형별 &nbsp;
                <span className="text-orange-600 font-medium">열람가(업체 과금)</span>
                &nbsp;/&nbsp;
                <span className="text-blue-600 font-medium">상담 수익(중개사)</span>
                &nbsp;/&nbsp;
                <span className="text-blue-600 font-medium">완료 수익(중개사)</span>
                &nbsp;— 단위: 원
              </p>
              <div className="space-y-4 max-w-2xl">
                {[
                  { type: 'internet_only', label: '인터넷만' },
                  { type: 'internet_tv', label: '인터넷+TV' },
                ].map(({ type, label }) => {
                  const row = internetRows.find((r) => r.internet_type === type);
                  return (
                    <InternetRowEditor
                      key={type}
                      label={label}
                      internetType={type}
                      viewPrice={row?.view_price ?? 0}
                      pricePerPyeong={row?.price_per_pyeong ?? 0}
                      consultationFee={row?.consultation_fee ?? 0}
                      onSave={handleSaveInternet}
                      saving={saving}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function MovingCellEditor({
  viewPrice,
  pricePerPyeong,
  consultationFee,
  maxCompletionFee,
  onSave,
  saving,
}: {
  viewPrice: number;
  pricePerPyeong: number;
  consultationFee: number;
  maxCompletionFee?: number | null;
  onSave: (v: number, p: number, q: number, max?: number | null) => void;
  saving: boolean;
}) {
  const [v, setV] = useState(String(viewPrice));
  const [p, setP] = useState(String(pricePerPyeong));
  const [q, setQ] = useState(String(consultationFee));
  const [m, setM] = useState(String(maxCompletionFee ?? 100000));
  useEffect(() => {
    setV(String(viewPrice));
    setP(String(pricePerPyeong));
    setQ(String(consultationFee));
    setM(String(maxCompletionFee ?? 100000));
  }, [viewPrice, pricePerPyeong, consultationFee, maxCompletionFee]);
  return (
    <>
      <td className="px-2 py-2 border-b">
        <input
          type="number"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
          min={0}
        />
      </td>
      <td className="px-2 py-2 border-b">
        <input
          type="number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
          min={0}
        />
      </td>
      <td className="px-2 py-2 border-b">
        <input
          type="number"
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
          min={0}
        />
      </td>
      <td className="px-2 py-2 border-b">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={m}
            onChange={(e) => setM(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
            min={0}
            placeholder="100000"
          />
          <button
            type="button"
            onClick={() => onSave(Number(v) || 0, Number(p) || 0, Number(q) || 0, m === '' ? null : Number(m) || null)}
            disabled={saving}
            className="p-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </td>
    </>
  );
}

function RevenueShareDefaultRow({
  category,
  label,
  realtorAmount,
  realtorCompleteAmount,
  referralPct,
  referralDurationMonths,
  partnerAmount,
  memo,
  saving,
  onSave,
}: {
  category: string;
  label: string;
  realtorAmount: number | null;
  realtorCompleteAmount: number | null;
  referralPct: number | null;
  referralDurationMonths: number | null;
  partnerAmount: number | null;
  memo: string;
  saving: boolean;
  onSave: (
    realtorAmt: number | null,
    realtorCompleteAmt: number | null,
    refPct: number | null,
    refMonths: number | null,
    partnerAmt: number | null,
    memo: string
  ) => void;
}) {
  const [ra, setRa] = useState(realtorAmount != null ? String(realtorAmount) : '');
  const [rc, setRc] = useState(realtorCompleteAmount != null ? String(realtorCompleteAmount) : '');
  const [rp, setRp] = useState(referralPct != null ? String(referralPct) : '5');
  const [rm, setRm] = useState(referralDurationMonths != null ? String(referralDurationMonths) : '12');
  const [pa, setPa] = useState(partnerAmount != null ? String(partnerAmount) : '');
  const [m, setM] = useState(memo ?? '');
  useEffect(() => {
    setRa(realtorAmount != null ? String(realtorAmount) : '');
    setRc(realtorCompleteAmount != null ? String(realtorCompleteAmount) : '');
    setRp(referralPct != null ? String(referralPct) : '5');
    setRm(referralDurationMonths != null ? String(referralDurationMonths) : '12');
    setPa(partnerAmount != null ? String(partnerAmount) : '');
    setM(memo ?? '');
  }, [realtorAmount, realtorCompleteAmount, referralPct, referralDurationMonths, partnerAmount, memo]);
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2 font-medium text-gray-700 border-r">{label}</td>
      {/* 상담요청 시 중개사 수익 */}
      <td className="px-2 py-2 border-r bg-blue-50/30">
        <input
          type="number"
          value={ra}
          onChange={(e) => setRa(e.target.value)}
          className="border border-blue-300 rounded px-2 py-1 w-28 text-sm"
          min={0}
          placeholder="예: 20000"
        />
      </td>
      {/* 전체완료 시 중개사 수익 */}
      <td className="px-2 py-2 border-r bg-emerald-50/30">
        <input
          type="number"
          value={rc}
          onChange={(e) => setRc(e.target.value)}
          className="border border-emerald-400 rounded px-2 py-1 w-28 text-sm"
          min={0}
          placeholder="예: 50000"
        />
      </td>
      {/* 추천수익 % */}
      <td className="px-2 py-2 border-r bg-violet-50/30">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={rp}
            onChange={(e) => setRp(e.target.value)}
            className="border border-violet-300 rounded px-2 py-1 w-16 text-sm"
            min={0}
            max={100}
            step={0.5}
            placeholder="5"
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      </td>
      {/* 추천 기간 (개월) */}
      <td className="px-2 py-2 border-r bg-violet-50/30">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={rm}
            onChange={(e) => setRm(e.target.value)}
            className="border border-violet-300 rounded px-2 py-1 w-16 text-sm"
            min={1}
            max={120}
            placeholder="12"
          />
          <span className="text-xs text-gray-500">개월</span>
        </div>
      </td>
      {/* 제휴업체 결제 요청 기본 금액 */}
      <td className="px-2 py-2 border-r">
        <input
          type="number"
          value={pa}
          onChange={(e) => setPa(e.target.value)}
          className="border border-orange-300 rounded px-2 py-1 w-28 text-sm"
          min={0}
          placeholder="예: 100000"
        />
      </td>
      <td className="px-2 py-2 border-r">
        <input
          type="text"
          value={m}
          onChange={(e) => setM(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 w-32 text-sm"
          placeholder="비고 (선택)"
        />
      </td>
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={() =>
            onSave(
              ra ? Number(ra) : null,
              rc ? Number(rc) : null,
              rp ? Number(rp) : 5,
              rm ? Number(rm) : 12,
              pa ? Number(pa) : null,
              m
            )
          }
          disabled={saving}
          className="p-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
        >
          저장
        </button>
      </td>
    </tr>
  );
}

function InternetRowEditor({
  label,
  internetType,
  viewPrice,
  pricePerPyeong,
  consultationFee,
  onSave,
  saving,
}: {
  label: string;
  internetType: string;
  viewPrice: number;
  pricePerPyeong: number;
  consultationFee: number;
  onSave: (type: string, v: number, p: number, q: number) => void;
  saving: boolean;
}) {
  const [v, setV] = useState(viewPrice);
  const [p, setP] = useState(pricePerPyeong);
  const [q, setQ] = useState(consultationFee);
  useEffect(() => {
    setV(viewPrice);
    setP(pricePerPyeong);
    setQ(consultationFee);
  }, [viewPrice, pricePerPyeong, consultationFee]);
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="font-medium text-gray-700 w-24">{label}</span>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="border border-gray-300 rounded px-3 py-2 w-28"
        min={0}
      />
      <span className="text-gray-500">열람가(지정가)</span>
      <input
        type="number"
        value={q}
        onChange={(e) => setQ(Number(e.target.value))}
        className="border border-gray-300 rounded px-3 py-2 w-28"
        min={0}
      />
      <span className="text-gray-500">상담요청 <span className="text-blue-600">(부동산 수익쉐어)</span></span>
      <input
        type="number"
        value={p}
        onChange={(e) => setP(Number(e.target.value))}
        className="border border-gray-300 rounded px-3 py-2 w-28"
        min={0}
      />
      <span className="text-gray-500">계약시 평당 <span className="text-blue-600">(원/평)</span></span>
      <button
        onClick={() => onSave(internetType, v, p, q)}
        disabled={saving}
        className="inline-flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
      >
        <Save className="w-4 h-4" />
        저장
      </button>
    </div>
  );
}
