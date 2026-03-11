'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  ChevronLeft,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { ServiceCategory } from '@/types/database';

const PARTNER_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'moving', label: '이사' },
  { value: 'cleaning', label: '입주청소' },
  { value: 'internet_tv', label: '인터넷 & TV' },
  { value: 'appliance_rental', label: '가전렌탈' },
  { value: 'kiosk', label: '키오스크' },
  { value: 'interior', label: '인테리어' },
];

interface FormData {
  business_name: string;
  business_number: string;
  representative_name: string;
  address: string;
  contact_phone: string;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
  service_categories: string[];
}

const initialForm: FormData = {
  business_name: '',
  business_number: '',
  representative_name: '',
  address: '',
  contact_phone: '',
  manager_name: '',
  manager_phone: '',
  manager_email: '',
  service_categories: [],
};

export default function PartnerKakaoCompletePage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setChecking(false);
      return;
    }
    if (authLoading) return;

    const check = async () => {
      if (!session) {
        router.replace('/login?error=' + encodeURIComponent('카카오 인증 후 추가 정보를 입력해 주세요.'));
        return;
      }
      const sb = getSupabase();
      if (!sb) {
        setChecking(false);
        return;
      }
      const { data: partner } = await sb
        .from('partners')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (partner) {
        window.location.href = '/partner/dashboard';
        return;
      }
      setChecking(false);
    };
    check();
  }, [session, authLoading, router]);

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: '' }));
      if (error) setError('');
    },
    [fieldErrors, error]
  );

  const toggleCategory = (cat: string) => {
    setForm((prev) => ({
      ...prev,
      service_categories: prev.service_categories.includes(cat)
        ? prev.service_categories.filter((c) => c !== cat)
        : [...prev.service_categories, cat],
    }));
    if (fieldErrors.service_categories) setFieldErrors((prev) => ({ ...prev, service_categories: '' }));
  };

  const formatPhone = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  const formatBusinessNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 5) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 10)}`;
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.business_name.trim()) errors.business_name = '업체명을 입력해주세요.';
    if (form.service_categories.length === 0) errors.service_categories = '업종을 1개 이상 선택해주세요.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !session) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/signup/partner/kakao-complete', {
        method: 'POST',
        headers: getAuthHeaders(session),
        credentials: 'include',
        body: JSON.stringify({
          business_name: form.business_name.trim(),
          business_number: form.business_number.replace(/-/g, '') || undefined,
          representative_name: form.representative_name.trim() || undefined,
          address: form.address.trim() || undefined,
          contact_phone: form.contact_phone.replace(/-/g, '') || undefined,
          manager_name: form.manager_name.trim() || undefined,
          manager_phone: form.manager_phone.replace(/-/g, '') || undefined,
          manager_email: form.manager_email.trim() || undefined,
          service_categories: form.service_categories,
        }),
      });
      let result: { success?: boolean; error?: string };
      try {
        result = await res.json();
      } catch {
        setError(
          res.status >= 500
            ? '서비스 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'
            : '서버 응답을 처리할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.'
        );
        return;
      }
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || '등록에 실패했습니다.');
      }
    } catch {
      setError('등록 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">제휴업체 회원가입 완료</h1>
            <p className="text-gray-500 mb-8">
              제휴업체 계정이 성공적으로 생성되었습니다.
              <br />
              아래 버튼으로 대시보드에 접속할 수 있습니다.
            </p>
            <Button variant="primary" onClick={() => (window.location.href = '/partner/dashboard')}>
              제휴업체 대시보드로 이동
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/login"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors inline-flex items-center gap-2 text-gray-600"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">로그인으로</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">제휴업체 추가 정보 입력</h1>
            <p className="mt-1 text-sm text-gray-500">카카오 인증이 완료되었습니다. 업체 정보를 입력해 주세요.</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">사업자 정보</h2>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Building2 className="w-4 h-4" /> 업체명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.business_name ? 'border-red-400' : ''}`}
                    placeholder="업체명을 입력하세요"
                    value={form.business_name}
                    onChange={(e) => updateField('business_name', e.target.value)}
                  />
                  {fieldErrors.business_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.business_name}</p>}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <FileText className="w-4 h-4" /> 사업자등록번호
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="000-00-00000"
                    value={form.business_number}
                    onChange={(e) => updateField('business_number', formatBusinessNumber(e.target.value))}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <User className="w-4 h-4" /> 대표자명
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="대표자명"
                    value={form.representative_name}
                    onChange={(e) => updateField('representative_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Phone className="w-4 h-4" /> 대표 연락처
                  </label>
                  <input
                    type="tel"
                    className="input w-full"
                    placeholder="02-0000-0000"
                    value={form.contact_phone}
                    onChange={(e) => updateField('contact_phone', formatPhone(e.target.value))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <MapPin className="w-4 h-4" /> 사업장 주소
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="사업장 주소를 입력하세요"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <User className="w-4 h-4" /> 담당자명
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="담당자명"
                    value={form.manager_name}
                    onChange={(e) => updateField('manager_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Phone className="w-4 h-4" /> 담당자 연락처
                  </label>
                  <input
                    type="tel"
                    className="input w-full"
                    placeholder="010-0000-0000"
                    value={form.manager_phone}
                    onChange={(e) => updateField('manager_phone', formatPhone(e.target.value))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Mail className="w-4 h-4" /> 담당자 이메일
                  </label>
                  <input
                    type="email"
                    className="input w-full"
                    placeholder="manager@example.com"
                    value={form.manager_email}
                    onChange={(e) => updateField('manager_email', e.target.value)}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                업종 정보 <span className="text-red-500">*</span>
              </h2>
            </div>
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PARTNER_CATEGORIES.map((cat) => {
                  const selected = form.service_categories.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        selected
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {selected && <Check className="w-4 h-4" />}
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.service_categories && (
                <p className="text-xs text-red-500 mt-2">{fieldErrors.service_categories}</p>
              )}
            </CardBody>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => router.push('/login')}>
              취소
            </Button>
            <Button variant="primary" type="submit" disabled={submitting} isLoading={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  등록 중...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  회원가입 완료
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
