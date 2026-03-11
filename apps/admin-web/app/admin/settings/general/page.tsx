'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getSiteSettings, updateSiteSettings } from '@/lib/api/settings';
import { showError, showSuccess } from '@/lib/toast';

export default function AdminSettingsGeneralPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    service_name: '이음',
    contact_phone: '1833-9413',
    commission_rate: 5,
    referral_duration_months: 12,
    auto_complete_enabled: true,
    auto_complete_days: 1,
  });

  useEffect(() => {
    getSiteSettings()
      .then((s) => {
        if (s) {
          setForm({
            service_name: s.service_name ?? '이음',
            contact_phone: s.contact_phone ?? '1833-9413',
            commission_rate: Number(s.commission_rate) ?? 5,
            referral_duration_months: s.referral_duration_months ?? 12,
            auto_complete_enabled: s.auto_complete_enabled ?? true,
            auto_complete_days: s.auto_complete_days ?? 1,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSiteSettings({
        service_name: form.service_name,
        contact_phone: form.contact_phone,
        commission_rate: form.commission_rate,
        referral_duration_months: form.referral_duration_months,
        auto_complete_enabled: form.auto_complete_enabled,
        auto_complete_days: form.auto_complete_days,
      });
      showSuccess('저장되었습니다.');
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/settings" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">일반 설정</h1>
      </div>
      <p className="text-sm text-gray-500">플랫폼 기본 정보, 수수료율, 정산 주기(자동완료)를 설정합니다.</p>

      <Card>
        <CardHeader className="font-semibold text-gray-900">플랫폼 기본 정보</CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">서비스명</label>
            <input
              className="input w-full max-w-md"
              value={form.service_name}
              onChange={(e) => setForm((f) => ({ ...f, service_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">고객센터 전화번호</label>
            <input
              className="input w-full max-w-md"
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-semibold text-gray-900">수수료·정산</CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">기본 수수료율 (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="input w-full"
                value={form.commission_rate}
                onChange={(e) => setForm((f) => ({ ...f, commission_rate: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">추천 수익 적용 기간 (개월)</label>
              <input
                type="number"
                min={1}
                max={60}
                className="input w-full"
                value={form.referral_duration_months}
                onChange={(e) => setForm((f) => ({ ...f, referral_duration_months: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_complete_enabled}
                onChange={(e) => setForm((f) => ({ ...f, auto_complete_enabled: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">예약완료 후 자동 전체완료 사용</span>
            </label>
            {form.auto_complete_enabled && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-sm text-gray-600">시공일 기준</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  className="input w-20"
                  value={form.auto_complete_days}
                  onChange={(e) => setForm((f) => ({ ...f, auto_complete_days: Number(e.target.value) }))}
                />
                <span className="text-sm text-gray-600">일 경과 시 자동 전체완료</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button variant="primary" onClick={handleSave} disabled={saving} leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
          {saving ? '저장 중…' : '저장'}
        </Button>
        <Link href="/admin/settings">
          <Button variant="secondary">취소</Button>
        </Link>
      </div>
    </div>
  );
}
