'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Package, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

const CATEGORIES = [
  { key: 'all', label: '전체 (기본값)', desc: '특정 카테고리 정책이 없을 때 적용' },
  { key: 'moving', label: '이사', desc: '' },
  { key: 'cleaning', label: '입주청소', desc: '' },
  { key: 'internet_tv', label: '인터넷/TV', desc: '' },
  { key: 'interior', label: '인테리어', desc: '' },
  { key: 'appliance_rental', label: '가전렌탈', desc: '' },
  { key: 'kiosk', label: '키오스크', desc: '' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

interface PolicyRow {
  id?: string;
  category: string;
  allow_free_purchase: boolean;
  allow_duplicate: boolean;
  cooldown_hours: number;
  max_per_month: number;
  note: string;
}

const defaultPolicy = (category: string): PolicyRow => ({
  category,
  allow_free_purchase: false,
  allow_duplicate: false,
  cooldown_hours: 0,
  max_per_month: 0,
  note: '',
});

export default function DbMarketPolicyPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, PolicyRow>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('db_market_purchase_policy')
        .select('*');
      if (error) throw error;
      const map: Record<string, PolicyRow> = {};
      for (const cat of CATEGORIES) {
        const row = (data || []).find((r: PolicyRow) => r.category === cat.key);
        map[cat.key] = row
          ? { ...row, note: row.note ?? '' }
          : defaultPolicy(cat.key);
      }
      setPolicies(map);
    } catch (e: any) {
      toast.error('로드 실패: ' + (e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (categoryKey: string) => {
    const row = policies[categoryKey];
    if (!row) return;
    setSaving(categoryKey);
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('db_market_purchase_policy')
        .upsert({
          category: row.category,
          allow_free_purchase: row.allow_free_purchase,
          allow_duplicate: row.allow_duplicate,
          cooldown_hours: Number(row.cooldown_hours) || 0,
          max_per_month: Number(row.max_per_month) || 0,
          note: row.note || null,
        }, { onConflict: 'category' });
      if (error) throw error;
      toast.success('저장되었습니다.');
      loadData();
    } catch (e: any) {
      toast.error('저장 실패: ' + (e?.message ?? ''));
    } finally {
      setSaving(null);
    }
  };

  const update = (category: string, field: keyof PolicyRow, value: unknown) => {
    setPolicies((prev) => ({
      ...prev,
      [category]: { ...prev[category], [field]: value },
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DB마켓 구매정책</h1>
            <p className="mt-1 text-sm text-gray-500">카테고리별 0원 구매·중복구매·쿨다운·월한도 설정</p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>

        {/* 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">정책 우선순위</p>
            <p>특정 카테고리 정책이 설정된 경우 해당 정책이 우선 적용됩니다. 카테고리 정책이 없으면 <strong>전체(기본값)</strong> 정책이 적용됩니다.</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-blue-700">
              <li>• <strong>0원 구매 허용</strong>: 열람가 0원인 DB를 무료로 구매 가능</li>
              <li>• <strong>중복구매 허용</strong>: 이미 구매한 서비스요청 DB를 재구매 가능</li>
              <li>• <strong>쿨다운</strong>: 같은 카테고리 DB를 재구매하기 전 최소 대기 시간 (시간 단위)</li>
              <li>• <strong>월 한도</strong>: 파트너 1개 계정이 한 달에 구매할 수 있는 최대 건수 (0 = 무제한)</li>
            </ul>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500">로딩 중...</div>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map(({ key, label, desc }) => {
              const row = policies[key] ?? defaultPolicy(key);
              const isSaving = saving === key;
              return (
                <div
                  key={key}
                  className={`bg-white rounded-xl border p-5 ${key === 'all' ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <h3 className="font-semibold text-gray-900">{label}</h3>
                      {key === 'all' && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">기본값</span>
                      )}
                      {desc && <span className="text-xs text-gray-400">{desc}</span>}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 0원 구매 허용 */}
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={row.allow_free_purchase}
                        onChange={(e) => update(key, 'allow_free_purchase', e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 cursor-pointer"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">0원 구매 허용</p>
                        <p className="text-xs text-gray-500">열람가 0원 DB 무료 구매</p>
                      </div>
                    </label>

                    {/* 중복구매 허용 */}
                    <label className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={row.allow_duplicate}
                        onChange={(e) => update(key, 'allow_duplicate', e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 cursor-pointer"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">중복구매 허용</p>
                        <p className="text-xs text-gray-500">이미 구매한 DB 재구매</p>
                      </div>
                    </label>

                    {/* 쿨다운 (시간) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        쿨다운
                        <span className="ml-1 text-xs font-normal text-gray-500">(시간, 0=없음)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={8760}
                          value={row.cooldown_hours}
                          onChange={(e) => update(key, 'cooldown_hours', Number(e.target.value) || 0)}
                          className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">시간</span>
                      </div>
                      {row.cooldown_hours > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          = {row.cooldown_hours >= 24
                            ? `${Math.floor(row.cooldown_hours / 24)}일 ${row.cooldown_hours % 24}시간`
                            : `${row.cooldown_hours}시간`}
                        </p>
                      )}
                    </div>

                    {/* 월 한도 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        월 구매 한도
                        <span className="ml-1 text-xs font-normal text-gray-500">(건, 0=무제한)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={row.max_per_month}
                          onChange={(e) => update(key, 'max_per_month', Number(e.target.value) || 0)}
                          className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">건/월</span>
                      </div>
                    </div>
                  </div>

                  {/* 메모 + 저장 */}
                  <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-gray-100">
                    <input
                      type="text"
                      value={row.note}
                      onChange={(e) => update(key, 'note', e.target.value)}
                      placeholder="비고 (선택)"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px] max-w-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSave(key)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
