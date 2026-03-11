'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showSuccess, showError } from '@/lib/toast';

const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

interface PartnerForm {
  business_name: string;
  representative_name: string;
  address: string;
  contact_phone: string;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
}

type UserRole = 'partner' | 'realtor';

export default function PartnerProfile() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [partner, setPartner] = useState<{
    id: string;
    service_categories?: string[];
    [key: string]: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>({
    business_name: '',
    representative_name: '',
    address: '',
    contact_phone: '',
    manager_name: '',
    manager_phone: '',
    manager_email: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const client = supabase;
    if (!client) {
      setLoadError('Supabase가 초기화되지 않았습니다.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        setLoadError('로그인이 필요합니다.');
        setLoading(false);
        return;
      }

      const { data: userData } = await client
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      const userRole = userData?.role as UserRole | undefined;

      // role에 따라 조회 테이블 명확히 분기: realtor → realtors, partner → partners
      if (userRole === 'realtor') {
        const { data } = await client
          .from('realtors')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data) {
          setRole('realtor');
          setPartner(data);
          setForm({
            business_name: (data.business_name as string) || '',
            representative_name: '',
            address: (data.address as string) || '',
            contact_phone: (data.contact_phone as string) || '',
            manager_name: (data.contact_name as string) || '',
            manager_phone: (data.manager_phone as string) || '',
            manager_email: (data.manager_email as string) || '',
          });
        } else {
          setLoadError('공인중개사 정보를 찾을 수 없습니다.');
        }
      } else if (userRole === 'partner') {
        // partner 역할: partners 테이블 조회
        const { data } = await client
          .from('partners')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data) {
          setRole('partner');
          setPartner(data);
          setForm({
            business_name: (data.business_name as string) || '',
            representative_name: (data.representative_name as string) || '',
            address: (data.address as string) || '',
            contact_phone: (data.contact_phone as string) || '',
            manager_name: (data.manager_name as string) || '',
            manager_phone: (data.manager_phone as string) || '',
            manager_email: (data.manager_email as string) || '',
          });
        } else {
          setLoadError('제휴업체 정보를 찾을 수 없습니다.');
        }
      } else {
        setLoadError('역할 정보를 확인할 수 없습니다. (realtor/partner)');
      }
    } catch {
      setLoadError('데이터 처리 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const client = supabase;
    if (!client || !partner || !role) {
      showError('데이터 처리 중 문제가 발생했습니다.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (role === 'realtor') {
        const { data, error } = await client
          .from('realtors')
          .update({
            business_name: form.business_name,
            address: form.address,
            contact_phone: form.contact_phone,
            contact_name: form.manager_name,
            manager_phone: form.manager_phone,
            manager_email: form.manager_email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', partner.id)
          .select('id');
        if (error) {
          setSaveError(error.message);
          showError('데이터 처리 중 문제가 발생했습니다.');
          return;
        }
        if (!data || data.length === 0) {
          setSaveError('저장할 데이터를 찾을 수 없습니다.');
          showError('데이터 처리 중 문제가 발생했습니다.');
          return;
        }
      } else {
        const { data, error } = await client
          .from('partners')
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq('id', partner.id)
          .select('id');
        if (error) {
          setSaveError(error.message);
          showError('데이터 처리 중 문제가 발생했습니다.');
          return;
        }
        if (!data || data.length === 0) {
          setSaveError('저장할 데이터를 찾을 수 없습니다.');
          showError('데이터 처리 중 문제가 발생했습니다.');
          return;
        }
      }
      setSaveError(null);
      showSuccess('저장되었습니다.');
    } catch {
      setSaveError('데이터 처리 중 문제가 발생했습니다.');
      showError('데이터 처리 중 문제가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">로딩 중...</div>;
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">업체 정보 관리</h1>
        <div className="bg-red-50 text-red-700 rounded-2xl p-6 max-w-2xl">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">업체 정보 관리</h1>

      {/* 업체 정보 수정 */}
      <div className="bg-white rounded-2xl shadow-card p-6 max-w-2xl">
        <h2 className="font-semibold text-gray-800 mb-4">기본 정보</h2>
        <div className="space-y-4">
          {(
            role === 'realtor'
              ? (
                  [
                    ['business_name', '사무소명'],
                    ['manager_name', '담당자명'],
                    ['manager_phone', '담당자 연락처'],
                    ['manager_email', '담당자 이메일'],
                    ['address', '주소'],
                    ['contact_phone', '연락처'],
                  ] as const
                )
              : (
                  [
                    ['business_name', '업체명'],
                    ['representative_name', '대표자명'],
                    ['address', '주소'],
                    ['contact_phone', '대표 연락처'],
                    ['manager_name', '담당자명'],
                    ['manager_phone', '담당자 연락처'],
                    ['manager_email', '담당자 이메일'],
                  ] as const
                )
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={
                  key.includes('email') ? 'email' : key.includes('phone') ? 'tel' : 'text'
                }
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              />
            </div>
          ))}

          {role === 'partner' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">업종</label>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-2.5">
                {(partner?.service_categories || [])
                  .map((c: string) => CATEGORY_LABELS[c] || c)
                  .join(', ') || '-'}
              </p>
              <p className="text-xs text-gray-400 mt-1">업종 변경은 본사에 문의하세요.</p>
            </div>
          )}
        </div>

        {saveError && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            저장 실패: {saveError}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full py-3 bg-brand-primary text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link
            href="/partner/change-password"
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-gray-600 hover:text-brand-primary hover:bg-gray-50 rounded-xl transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            비밀번호 변경
          </Link>
        </div>
      </div>
    </div>
  );
}
