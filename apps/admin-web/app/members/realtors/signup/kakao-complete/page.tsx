'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  User,
  Phone,
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

interface FormData {
  office_name: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  business_number: string;
}

const initialForm: FormData = {
  office_name: '',
  contact_name: '',
  contact_phone: '',
  address: '',
  business_number: '',
};

export default function RealtorKakaoCompletePage() {
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
      const { data: realtor } = await sb
        .from('realtors')
        .select('id, business_name')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (realtor && realtor.business_name && realtor.business_name !== '미등록 사무소') {
        window.location.href = '/agent/dashboard';
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
    if (!form.office_name.trim()) errors.office_name = '사무소명을 입력해주세요.';
    if (!form.contact_name.trim()) errors.contact_name = '담당자 이름을 입력해주세요.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !session) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/signup/realtor/kakao-complete', {
        method: 'POST',
        headers: getAuthHeaders(session),
        credentials: 'include',
        body: JSON.stringify({
          office_name: form.office_name.trim(),
          contact_name: form.contact_name.trim(),
          contact_phone: form.contact_phone.replace(/-/g, '') || undefined,
          address: form.address.trim() || undefined,
          business_number: form.business_number.replace(/-/g, '') || undefined,
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">공인중개사 회원가입 완료</h1>
            <p className="text-gray-500 mb-8">
              공인중개사 계정이 성공적으로 생성되었습니다.
              <br />
              QR 코드가 자동 생성되었습니다. 아래 버튼으로 대시보드에 접속할 수 있습니다.
            </p>
            <Button variant="primary" onClick={() => (window.location.href = '/agent/dashboard')}>
              공인중개사 대시보드로 이동
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
            <h1 className="text-2xl font-bold text-gray-900">공인중개사 추가 정보 입력</h1>
            <p className="mt-1 text-sm text-gray-500">카카오 인증이 완료되었습니다. 사무소 정보를 입력해 주세요.</p>
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
              <h2 className="text-lg font-semibold text-gray-900">사무소 정보</h2>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Home className="w-4 h-4" /> 사무소명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.office_name ? 'border-red-400' : ''}`}
                    placeholder="○○ 공인중개사사무소"
                    value={form.office_name}
                    onChange={(e) => updateField('office_name', e.target.value)}
                  />
                  {fieldErrors.office_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.office_name}</p>}
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
                    <User className="w-4 h-4" /> 담당자명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.contact_name ? 'border-red-400' : ''}`}
                    placeholder="담당자명"
                    value={form.contact_name}
                    onChange={(e) => updateField('contact_name', e.target.value)}
                  />
                  {fieldErrors.contact_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.contact_name}</p>}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Phone className="w-4 h-4" /> 담당자 연락처
                  </label>
                  <input
                    type="tel"
                    className="input w-full"
                    placeholder="010-0000-0000"
                    value={form.contact_phone}
                    onChange={(e) => updateField('contact_phone', formatPhone(e.target.value))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <MapPin className="w-4 h-4" /> 사무소 주소
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="사무소 주소를 입력하세요"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                  />
                </div>
              </div>
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
