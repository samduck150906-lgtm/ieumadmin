'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ShoppingCart,
  Filter,
  Search,
  Star,
  MapPin,
  Calendar,
  Home,
  Zap,
  CreditCard,
  Plus,
  Trash2,
  Bell,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Tag,
  ArrowRight,
  CheckCircle,
  X,
  Banknote,
  AlertCircle,
  Lock,
  Phone,
  User,
} from 'lucide-react';
import type { PartnerDbRow } from '@/lib/api/partner-db';
import { showError, showSuccess } from '@/lib/toast';

const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  water_purifier_rental: '정수기렌탈',
  kiosk: '키오스크',
};

const AREA_SIZE_LABELS: Record<string, string> = {
  small: '10평대 이하',
  medium: '20~30평대',
  large: '40평대 이상',
  office: '사무실/상가',
};

/** 주소 대분류만 표기 — 시·도 단위 (예: 서울특별시, 경기도) */
function addressToMajorRegion(addr: string): string {
  if (!addr) return '-';
  const t = addr.trim();
  if (!t) return '-';
  // 도 단위: OO도, OO시(광역), 세종특별자치시 등
  const matchDo = t.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|제주)?(특별시|광역시|특별자치시|도|특별자치도)?/);
  if (matchDo && matchDo[0]) {
    const doPart = matchDo[0].replace(/\s/g, '');
    if (doPart) return doPart;
  }
  // 이미 대분류인 경우
  const upper = ['수도권', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  for (const u of upper) {
    if (t.startsWith(u)) return u;
  }
  const first = t.split(/\s+/)[0];
  return first || '-';
}

/** 이사 날짜까지 남은 일수 */
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

interface InterestKeyword {
  id: string;
  category: string;
  region_keyword: string | null;
  area_size: string | null;
  date_from: string | null;
  date_to: string | null;
}

type SortOption = 'urgent' | 'latest' | 'price_asc' | 'price_desc';

export default function PartnerDbMarketPage() {
  const router = useRouter();
  const [dbList, setDbList] = useState<PartnerDbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false); // realtor 등 제휴업체가 아닌 사용자 접근 시
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [mileageBalance, setMileageBalance] = useState(0);
  const [purchaseSuccess, setPurchaseSuccess] = useState<{ name: string } | null>(null);

  // 결제 모달
  const [payModal, setPayModal] = useState<{ db: PartnerDbRow; price: number } | null>(null);
  const [payMethod, setPayMethod] = useState<'card' | 'transfer' | 'phone'>('card');
  const [useMileageInModal, setUseMileageInModal] = useState(true);

  // 필터 상태
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterAreaSize, setFilterAreaSize] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMovingDates, setFilterMovingDates] = useState<string[]>([]);
  const [filterMovingType, setFilterMovingType] = useState('');
  const [filterRequestedProduct, setFilterRequestedProduct] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('urgent');
  const [showOnlyInterest, setShowOnlyInterest] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  /** 지역 검색 debounce — 입력 중 API 과다 호출 방지 */
  const [debouncedRegion, setDebouncedRegion] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRegion(filterRegion), 300);
    return () => clearTimeout(t);
  }, [filterRegion]);

  // 관심 키워드
  const [keywords, setKeywords] = useState<InterestKeyword[]>([]);
  const [kwPanelOpen, setKwPanelOpen] = useState(false);
  const [kwCategory, setKwCategory] = useState('');
  const [kwRegion, setKwRegion] = useState('');
  const [kwAreaSize, setKwAreaSize] = useState('');
  const [kwDateFrom, setKwDateFrom] = useState('');
  const [kwDateTo, setKwDateTo] = useState('');
  const [kwSaving, setKwSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setLoading(false); return; }

      // role 확인: realtor는 이 페이지 접근 불가
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (userData?.role === 'realtor') {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }

      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (debouncedRegion) params.set('region', debouncedRegion);
      if (filterAreaSize) params.set('areaSize', filterAreaSize);
      if (filterMovingDates.length > 0) {
        params.set('movingDates', filterMovingDates.join(','));
      } else {
        if (filterDateFrom) params.set('dateFrom', filterDateFrom);
        if (filterDateTo) params.set('dateTo', filterDateTo);
      }
      if (filterMovingType) params.set('movingType', filterMovingType);
      if (filterRequestedProduct) params.set('requestedProduct', filterRequestedProduct);
      params.set('sort', sortBy === 'urgent' ? 'urgent_first' : sortBy === 'latest' ? 'latest' : 'latest');

      const [listRes, mbRes, kwRes] = await Promise.all([
        fetch(`/api/partner/db-list?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        supabase.from('partner_mileage_balance').select('balance').maybeSingle(),
        supabase.from('partner_interest_keywords').select('*').order('created_at', { ascending: false }),
      ]);

      if (listRes.ok) {
        const json = await listRes.json();
        setDbList(json.data || []);
      } else if (listRes.status === 403) {
        setAccessDenied(true);
      }
      if (mbRes.data) setMileageBalance(mbRes.data.balance);
      if (kwRes.data) setKeywords(kwRes.data);
    } catch {
      setDbList([]);
      showError('DB 목록을 불러오지 못했습니다. 새로고침해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, debouncedRegion, filterAreaSize, filterDateFrom, filterDateTo, filterMovingDates, filterMovingType, filterRequestedProduct, sortBy]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /** DB 구매 버튼 클릭 — 0원: 결제창 없이 즉시 구매, 1원↑: 결제 모달 필수 */
  function handlePurchase(db: PartnerDbRow) {
    const price = Number(db.view_price ?? 0);
    if (price === 0) {
      // 0원 구매: 결제창 없이 즉시 처리 (10분 쿨다운 적용)
      if (!confirm('이 DB를 무료(0원)로 구매하시겠습니까?\n\n※ 0원 구매 후 10분간 재구매 대기시간이 적용됩니다.')) return;
      executePurchase(db, 0, false, 'free');
    } else {
      // 1원 이상: 결제 모달을 통해 결제 필수
      setPayMethod('card');
      setUseMileageInModal(mileageBalance > 0);
      setPayModal({ db, price });
    }
  }

  const FETCH_TIMEOUT_MS = 25_000;

  /** 1원 이상 카드/계좌이체/휴대폰: db-view-checkout → 결제창. 0원/마일리지 전액: db-view-pay 직접 호출 */
  async function executePurchase(
    db: PartnerDbRow,
    price: number,
    useMileage: boolean,
    method: 'card' | 'transfer' | 'phone' | 'free' | 'mileage',
    mileageApplied = 0
  ) {
    setPurchasing(db.id);
    setPayModal(null);
    try {
      if (!supabase) { setPurchasing(null); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const fetchWithTimeout = async (url: string, opts: RequestInit) => {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(url, { ...opts, signal: ctrl.signal });
          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // 1원 이상 + 카드/계좌이체/휴대폰: 결제창 흐름 (db-view-checkout → toss-checkout/mock-checkout → confirm)
      if ((method === 'card' || method === 'transfer' || method === 'phone') && price > 0) {
        const response = await fetchWithTimeout('/api/payments/db-view-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            service_request_id: db.id,
            use_mileage: useMileage && mileageApplied > 0,
            mileage_amount: mileageApplied,
          }),
        });
        const result = await response.json();
        if (result.paymentUrl) {
          window.location.href = result.paymentUrl;
          return;
        }
        if (result.success && result.unlocked) {
          setPurchaseSuccess({ name: CATEGORY_LABELS[db.category] || db.category });
          loadAll();
          return;
        }
        showError(result.error || '결제창을 불러오지 못했습니다.');
        return;
      }

      // 0원, 마일리지 전액: db-view-pay 직접 호출
      const response = await fetchWithTimeout('/api/partner/db-view-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          service_request_id: db.id,
          use_mileage: useMileage,
          payment_method: method,
        }),
      });
      const result = await response.json();
      if (result.success || result.unlocked) {
        setPurchaseSuccess({ name: CATEGORY_LABELS[db.category] || db.category });
        loadAll();
      } else if (response.status === 429) {
        showError(result.error || '잠시 후 다시 시도해 주세요.');
      } else if (response.status === 409) {
        showError(result.error || '이미 다른 업체에 배정되었습니다.');
        loadAll();
      } else {
        showError(result.error || '구매 실패');
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      showError(isAbort ? '요청이 지연되고 있습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.' : '네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setPurchasing(null);
    }
  }

  /** 결제 모달에서 확인 */
  function handlePayModalConfirm() {
    if (!payModal) return;
    const { db, price } = payModal;
    const useMileage = useMileageInModal && mileageBalance > 0;
    const mileageApplied = useMileage ? Math.min(mileageBalance, price) : 0;
    const remaining = price - mileageApplied;
    const method = remaining === 0 ? 'mileage' : payMethod === 'phone' ? 'phone' : payMethod;
    executePurchase(db, price, useMileage, method, mileageApplied);
  }

  /** 관심 키워드 등록 — API 경유로 일관된 인증·에러 처리 */
  async function handleAddKeyword() {
    if (!kwCategory) { alert('카테고리를 선택해주세요.'); return; }
    if (!supabase) return;
    setKwSaving(true);
    const timeoutMs = 15_000;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('로그인이 필요합니다.');

      const ctrl = new AbortController();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => { ctrl.abort(); reject(new Error('TIMEOUT')); }, timeoutMs)
      );
      const doInsert = async () => {
        const res = await fetch('/api/partner/interest-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            category: kwCategory,
            region_keyword: kwRegion || null,
            area_size: kwAreaSize || null,
            date_from: kwDateFrom || null,
            date_to: kwDateTo || null,
          }),
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '등록 실패');
      };
      await Promise.race([doInsert(), timeoutPromise]);
      setKwCategory(''); setKwRegion(''); setKwAreaSize(''); setKwDateFrom(''); setKwDateTo('');
      showSuccess('관심 키워드가 등록되었습니다.');
      loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '등록 실패';
      showError(msg === 'TIMEOUT' ? '등록이 지연되고 있습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.' : `등록 실패: ${msg}`);
    } finally {
      setKwSaving(false);
    }
  }

  /** 관심 키워드 삭제 */
  async function handleDeleteKeyword(id: string) {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const response = await fetch(`/api/partner/interest-keywords?id=${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        setKeywords((prev) => prev.filter((kw) => kw.id !== id));
        showSuccess('관심 키워드가 삭제되었습니다.');
      } else {
        const body = await response.json().catch(() => ({}));
        showError((body as { error?: string }).error || `삭제에 실패했습니다. (${response.status})`);
      }
    } catch {
      showError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  }

  // 정렬 적용
  const sortedList = [...dbList].sort((a, b) => {
    if (sortBy === 'urgent') {
      const da = daysUntil(a.moving_date ?? null);
      const db2 = daysUntil(b.moving_date ?? null);
      if (da == null && db2 == null) return 0;
      if (da == null) return 1;
      if (db2 == null) return -1;
      return da - db2;
    }
    if (sortBy === 'price_asc') return Number(a.view_price ?? 0) - Number(b.view_price ?? 0);
    if (sortBy === 'price_desc') return Number(b.view_price ?? 0) - Number(a.view_price ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // 관심 키워드 매칭 필터
  const displayList = showOnlyInterest
    ? sortedList.filter((db) =>
        keywords.some((kw) => {
          if (kw.category !== db.category) return false;
          if (kw.region_keyword) {
            const addr = (db.to_region || db.from_region || '');
            if (!addr.includes(kw.region_keyword)) return false;
          }
          if (kw.area_size && db.area_size_label !== kw.area_size) return false;
          return true;
        })
      )
    : sortedList;

  const urgentList = displayList.filter((d) => {
    const days = daysUntil(d.moving_date ?? null);
    return days != null && days >= 0 && days <= 7;
  });
  const nonUrgentList = displayList.filter((d) => {
    const days = daysUntil(d.moving_date ?? null);
    return days == null || days < 0 || days > 7;
  });

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <Lock className="w-12 h-12 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-amber-800 mb-2">제휴업체 전용 메뉴입니다</h2>
          <p className="text-sm text-amber-700 mb-6">
            이 페이지는 제휴업체(이사·청소·인터넷 등 서비스 업체) 전용입니다. 공인중개사님은 이용하실 수 없습니다.
          </p>
          <Link
            href="/partner/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 결제 모달 */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">DB 구매 결제</h3>
                <p className="text-sm text-gray-500">
                  {CATEGORY_LABELS[payModal.db.category] || payModal.db.category} DB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="p-2 rounded-xl hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 가격 요약 */}
              {(() => {
                const price = payModal.price;
                const mileageApplied = useMileageInModal ? Math.min(mileageBalance, price) : 0;
                const remaining = price - mileageApplied;
                return (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>DB 열람가</span>
                      <span className="font-medium">₩{price.toLocaleString()}</span>
                    </div>
                    {useMileageInModal && mileageBalance > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          마일리지 차감 (잔액 ₩{mileageBalance.toLocaleString()})
                        </span>
                        <span className="font-medium">- ₩{mileageApplied.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
                      <span>실결제 금액</span>
                      <span className="text-brand-primary text-base">
                        {remaining === 0 ? '₩0 (마일리지 전액 차감)' : `₩${remaining.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 마일리지 사용 여부 */}
              {mileageBalance > 0 && (
                <label className="flex items-center gap-2 cursor-pointer p-3 bg-amber-50 rounded-xl">
                  <input
                    type="checkbox"
                    checked={useMileageInModal}
                    onChange={(e) => setUseMileageInModal(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span className="text-sm text-amber-800 font-medium">
                    마일리지 우선 차감 (₩{Math.min(mileageBalance, payModal.price).toLocaleString()})
                  </span>
                </label>
              )}

              {/* 결제 수단 선택 (실결제 금액이 남는 경우만) — 휴대폰 결제 고려 UX */}
              {(() => {
                const remaining = payModal.price - (useMileageInModal ? Math.min(mileageBalance, payModal.price) : 0);
                if (remaining <= 0) return null;
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">결제 수단</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMethod('card')}
                        className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors min-h-[72px] ${
                          payMethod === 'card'
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <CreditCard className="w-5 h-5" />
                        카드
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('transfer')}
                        className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors min-h-[72px] ${
                          payMethod === 'transfer'
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Banknote className="w-5 h-5" />
                        이체
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('phone')}
                        className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors min-h-[72px] ${
                          payMethod === 'phone'
                            ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Phone className="w-5 h-5" />
                        휴대폰
                      </button>
                    </div>
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>결제 방법은 선택 기록으로 남으며, 실제 정산은 본사와 별도로 처리됩니다.</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPayModal(null)}
                  className="flex-1 py-3 border rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handlePayModalConfirm}
                  disabled={!!purchasing}
                  className="flex-1 py-3 bg-brand-primary text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {purchasing ? '처리 중...' : '구매 확정'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 구매 완료 배너 */}
      {purchaseSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-green-600 text-white rounded-2xl shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
            <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">DB 구매 완료!</p>
              <p className="text-xs text-green-100 mt-0.5">
                {purchaseSuccess.name} DB가 내 DB 관리에 추가되었습니다.
              </p>
              <button
                type="button"
                onClick={() => router.push('/partner/assignments')}
                className="mt-2 flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                내 DB 관리에서 확인
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPurchaseSuccess(null)}
              className="p-0.5 hover:bg-white/20 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DB 마켓</h1>
          <p className="text-sm text-gray-500 mt-0.5">업무 카테고리에 맞는 DB를 구매하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {mileageBalance > 0 && (
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span className="text-xs font-semibold text-amber-700">₩{mileageBalance.toLocaleString()}</span>
            </div>
          )}
          <button
            type="button"
            onClick={loadAll}
            className="p-2 rounded-xl bg-white border hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 검색 바 — 항상 노출 */}
      <div className="bg-white rounded-2xl shadow-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="지역 검색 (예: 서울, 강남구, 수원시)"
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
        </div>
      </div>

      {/* 구매 DB / 내 DB / 완료 탭 분리 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        <span className="flex-1 flex justify-center py-2 rounded-lg bg-white font-medium text-sm text-brand-primary shadow-sm">
          구매 DB
        </span>
        <Link
          href="/partner/assignments"
          className="flex-1 flex justify-center py-2 rounded-lg font-medium text-sm text-gray-600 hover:bg-white/80 transition-colors"
        >
          내 DB
        </Link>
        <Link
          href="/partner/assignments?status=completed"
          className="flex-1 flex justify-center py-2 rounded-lg font-medium text-sm text-gray-600 hover:bg-white/80 transition-colors"
        >
          완료
        </Link>
      </div>

      {/* 긴급 DB 상단 고정 배너 — 스크롤 시에도 상단에 고정 표시 */}
      {urgentList.length > 0 && (
        <div className="sticky top-0 z-10 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-red-500 shrink-0" />
            <span className="font-bold text-red-700 text-base">긴급 DB ({urgentList.length}건)</span>
            <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-0.5 rounded-full">긴급 DB 상단 고정</span>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {urgentList.map((db) => {
              const days = daysUntil(db.moving_date ?? null);
              return (
                <div key={db.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 text-sm border border-red-100">
                  <span className="text-gray-700">
                    {CATEGORY_LABELS[db.category] || db.category} · {addressToMajorRegion(db.to_region || '')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 font-semibold text-xs">D-{days}</span>
                    <button
                      type="button"
                      onClick={() => handlePurchase(db)}
                      disabled={!!purchasing}
                      className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg font-medium hover:bg-red-600 disabled:opacity-50"
                    >
                      구매
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 관심 키워드 패널 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <button
          type="button"
          onClick={() => setKwPanelOpen(!kwPanelOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-purple-500" />
            <span className="font-semibold">관심 키워드 관리</span>
            {keywords.length > 0 && (
              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{keywords.length}개</span>
            )}
          </div>
          {kwPanelOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {kwPanelOpen && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {/* 등록된 키워드 목록 */}
            {keywords.length > 0 && (
              <div className="mt-3 space-y-1.5 mb-4">
                {keywords.map((kw) => (
                  <div key={kw.id} className="flex items-center justify-between bg-purple-50 rounded-xl px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-purple-200 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">
                        {CATEGORY_LABELS[kw.category] || kw.category}
                      </span>
                      {kw.region_keyword && <span className="text-gray-600">{kw.region_keyword}</span>}
                      {kw.area_size && <span className="text-gray-600">{AREA_SIZE_LABELS[kw.area_size] || kw.area_size}</span>}
                      {kw.date_from && <span className="text-gray-500 text-xs">{kw.date_from}~{kw.date_to || ''}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteKeyword(kw.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 새 키워드 등록 */}
            <p className="text-xs font-medium text-gray-500 mb-2">새 관심 키워드 등록</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={kwCategory}
                onChange={(e) => setKwCategory(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
              >
                <option value="">카테고리 선택*</option>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="지역 (예: 강남구, 수원시)"
                value={kwRegion}
                onChange={(e) => setKwRegion(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={kwAreaSize}
                onChange={(e) => setKwAreaSize(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm"
              >
                <option value="">평수 (선택)</option>
                {Object.entries(AREA_SIZE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <div className="flex gap-1 items-center">
                <input
                  type="date"
                  value={kwDateFrom}
                  onChange={(e) => setKwDateFrom(e.target.value)}
                  className="flex-1 border rounded-xl px-2 py-2 text-xs"
                />
                <span className="text-gray-400 text-xs">~</span>
                <input
                  type="date"
                  value={kwDateTo}
                  onChange={(e) => setKwDateTo(e.target.value)}
                  className="flex-1 border rounded-xl px-2 py-2 text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddKeyword}
              disabled={kwSaving || !kwCategory}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {kwSaving ? '등록 중...' : '관심 키워드 등록'}
            </button>
          </div>
        )}
      </div>

      {/* 필터 & 정렬 — 모바일: 필터 버튼 클릭 시 펼침 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {/* 모바일: 필터 버튼 */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Filter className="w-4 h-4" />
            필터 / 정렬 {filterOpen ? '접기' : '펼치기'}
            {filterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {/* 필터 영역 — 데스크톱: 항상 표시, 모바일: 펼침 시만 */}
        <div className={`p-4 ${filterOpen ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3 md:mb-3">
            <div className="hidden md:flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">필터 / 정렬</span>
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className="hidden md:inline text-xs text-brand-primary hover:underline"
            >
              {filterOpen ? '접기' : '펼치기'}
            </button>
          </div>

          {/* 정렬 버튼 */}
          <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            { v: 'urgent', l: '⚡ 긴급순' },
            { v: 'latest', l: '최신순' },
            { v: 'price_asc', l: '가격 낮은순' },
            { v: 'price_desc', l: '가격 높은순' },
          ] as const).map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setSortBy(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                sortBy === v ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
          {keywords.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyInterest(!showOnlyInterest)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                showOnlyInterest ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              ⭐ 관심만
            </button>
          )}
        </div>

        {filterOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">전체 카테고리</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              value={filterAreaSize}
              onChange={(e) => setFilterAreaSize(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm"
            >
              <option value="">전체 평수</option>
              {Object.entries(AREA_SIZE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-gray-500">이사날짜 (구간 또는 중복선택)</span>
              <div className="flex gap-1 items-center flex-wrap">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  disabled={filterMovingDates.length > 0}
                  className="flex-1 min-w-[100px] border rounded-xl px-2 py-2 text-sm disabled:opacity-50"
                />
                <span className="text-gray-400 text-xs">~</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  disabled={filterMovingDates.length > 0}
                  className="flex-1 min-w-[100px] border rounded-xl px-2 py-2 text-sm disabled:opacity-50"
                />
                <span className="text-gray-400 text-xs mx-1">또는</span>
                <div className="flex gap-1 items-center flex-wrap">
                  {filterMovingDates.map((d, i) => (
                    <span key={d} className="inline-flex items-center gap-0.5 px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-lg text-sm">
                      {d}
                      <button
                        type="button"
                        onClick={() => setFilterMovingDates((prev) => prev.filter((_, j) => j !== i))}
                        className="p-0.5 hover:bg-brand-primary/20 rounded"
                        aria-label="제거"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="date"
                    key={filterMovingDates.join(',')}
                    className="border rounded-xl px-2 py-2 text-sm w-[130px]"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !filterMovingDates.includes(v)) setFilterMovingDates((prev) => [...prev, v].sort());
                    }}
                  />
                </div>
              </div>
            </div>
            <select
              value={filterMovingType}
              onChange={(e) => setFilterMovingType(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm"
              title="희망상품: 이사종류"
            >
              <option value="">전체 이사종류</option>
              <option value="general">일반이사</option>
              <option value="full_pack">포장이사</option>
              <option value="half_pack">반포장이사</option>
            </select>
            <input
              type="text"
              placeholder="희망상품 검색 (인터넷종류 등)"
              value={filterRequestedProduct}
              onChange={(e) => setFilterRequestedProduct(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm"
            />
          </div>
        )}
        </div>
      </div>

      {/* DB 목록 — 구매 후 내 DB/완료와 구분: 긴급 DB 상단, 그 외 구분 표시 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            총 <strong>{displayList.length}</strong>건
            {urgentList.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">(긴급 {urgentList.length}건 상단)</span>
            )}
            {showOnlyInterest && <span className="ml-1 text-purple-600">(관심 키워드 필터)</span>}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">조건에 맞는 DB가 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">필터를 변경하거나 나중에 다시 확인해보세요</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 긴급 DB 섹션 — 상단 고정된 배너와 동일하게 목록에서도 구분 */}
            {urgentList.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-red-700 mb-2">
                  <Zap className="w-4 h-4" /> 긴급 DB ({urgentList.length}건)
                </h2>
                <div className="space-y-3">
                  {urgentList.map((db) => (
                    <DbMarketCard
                      key={db.id}
                      db={db}
                      mileageBalance={mileageBalance}
                      onPurchase={handlePurchase}
                      purchasing={purchasing === db.id}
                      isInterest={keywords.some((kw) => kw.category === db.category)}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* 그 외 DB 섹션 */}
            {nonUrgentList.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-600 mb-2">
                  그 외 DB ({nonUrgentList.length}건)
                </h2>
                <div className="space-y-3">
                  {nonUrgentList.map((db) => (
                      <DbMarketCard
                        key={db.id}
                        db={db}
                        mileageBalance={mileageBalance}
                        onPurchase={handlePurchase}
                        purchasing={purchasing === db.id}
                        isInterest={keywords.some((kw) => kw.category === db.category)}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DbMarketCard({
  db,
  mileageBalance,
  onPurchase,
  purchasing,
  isInterest,
}: {
  db: PartnerDbRow;
  mileageBalance: number;
  onPurchase: (db: PartnerDbRow) => void;
  purchasing: boolean;
  isInterest: boolean;
}) {
  const days = daysUntil(db.moving_date ?? null);
  const price = Number(db.view_price ?? 0);
  const isUrgent = days != null && days >= 0 && days <= 7;
  const canUseMileage = mileageBalance > 0 && price > 0;
  const effectivePrice = canUseMileage ? Math.max(0, price - mileageBalance) : price;

  return (
    <div
      className={`bg-white rounded-2xl shadow-card p-4 ${isUrgent ? 'border-2 border-red-200' : ''}`}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {CATEGORY_LABELS[db.category] || db.category}
          </span>
          {isInterest && (
            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-purple-500" /> 관심
            </span>
          )}
          {isUrgent && (
            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
              <Zap className="w-3 h-3" /> D-{days}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{new Date(db.created_at).toLocaleDateString('ko-KR')}</span>
      </div>

      {/* 핵심 정보 그리드 */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {/* 이사 카테고리: 출발지 표시 */}
        {db.category === 'moving' && db.from_region && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">이사 전 주소</p>
            <p className="font-medium text-gray-800">{addressToMajorRegion(db.from_region)}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400 mb-0.5">
            {db.category === 'moving' ? '이사 후 주소' : '서비스 지역'}
          </p>
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <p className="font-medium text-gray-800">{addressToMajorRegion(db.to_region || db.from_region || '')}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">평수 / 형태</p>
          <div className="flex items-center gap-1">
            <Home className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <p className="font-medium text-gray-800">
              {db.area_size_label || '-'} / {db.moving_type_label || '-'}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">
            {db.category === 'moving' ? '이사일자' : '희망일자'}
          </p>
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <p className={`font-medium ${isUrgent ? 'text-red-600' : 'text-gray-800'}`}>
              {db.moving_date ? new Date(db.moving_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '미정'}
              {days != null && days >= 0 && !isUrgent && <span className="text-gray-400 text-xs"> (D-{days})</span>}
            </p>
          </div>
        </div>
      </div>

      {/* 구매 버튼 영역 */}
      {db.masked ? (
        <div className="mt-1 space-y-2">
          {/* 마스킹된 고객 정보 — 결제 후 해제됨을 명확히 표시 */}
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 border border-dashed border-gray-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-400">구매 후 열람 가능한 정보</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-400">
              <div className="flex items-center gap-1.5">
                <User className="w-3 h-3 shrink-0" />
                <span className="font-medium">고객명: <span className="tracking-widest">●●</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 shrink-0" />
                <span className="font-medium">010-●●●●-●●●●</span>
              </div>
            </div>
          </div>

          {canUseMileage && (
            <div className="flex items-center gap-1.5 bg-amber-50 rounded-xl px-3 py-1.5 text-xs">
              <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
              <span className="text-amber-700">마일리지 적용 시 실결제 ₩{effectivePrice.toLocaleString()}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onPurchase(db)}
            disabled={purchasing}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isUrgent
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-brand-primary hover:bg-blue-700 text-white'
            } disabled:opacity-50`}
          >
            <CreditCard className="w-4 h-4" />
            {purchasing
              ? '처리중...'
              : price === 0
              ? '무료 구매 — 결제 없이 즉시 열람'
              : `₩${price.toLocaleString()} 결제 후 열람`}
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-1.5">
          {/* 구매 완료 후 실제 고객 정보 표시 */}
          {(db.customer_name || db.customer_phone) && (
            <div className="bg-green-50 rounded-xl px-3 py-2.5 border border-green-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700">열람 완료 — 고객 정보</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {db.customer_name && (
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3 text-green-600 shrink-0" />
                    <span className="font-semibold text-green-800">{db.customer_name}</span>
                  </div>
                )}
                {db.customer_phone && (
                  <a
                    href={`tel:${db.customer_phone}`}
                    className="flex items-center gap-1 font-semibold text-green-800 hover:text-green-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="w-3 h-3 text-green-600 shrink-0" />
                    {db.customer_phone}
                  </a>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-green-50 rounded-xl px-3 py-2 text-xs text-green-700 font-medium">
            <Tag className="w-3.5 h-3.5" />
            구매 완료 · 내 DB 관리에서 상태를 업데이트하세요
          </div>
        </div>
      )}
    </div>
  );
}
