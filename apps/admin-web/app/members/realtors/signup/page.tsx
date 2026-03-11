'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Lock,
  ChevronLeft,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useAuth } from '@/lib/auth';

interface FormData {
  email: string;
  password: string;
  passwordConfirm: string;
  office_name: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  region: string;
  business_number: string;
}

const initialForm: FormData = {
  email: '',
  password: '',
  passwordConfirm: '',
  office_name: '',
  contact_name: '',
  contact_phone: '',
  address: '',
  region: '',
  business_number: '',
};

export default function RealtorSignupPage() {
  const router = useRouter();
  const { signInWithKakao } = useAuth();
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isPublicMode, setIsPublicMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const SESSION_CHECK_TIMEOUT_MS = 5_000;

    const checkSession = async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setIsPublicMode(true);
        return;
      }
      try {
        const sb = getSupabase();
        const sessionPromise = sb.auth.getSession();
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('SESSION_CHECK_TIMEOUT')), SESSION_CHECK_TIMEOUT_MS)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: unknown } };
        if (!cancelled) setIsPublicMode(!session);
      } catch {
        // Supabase 미설정, 네트워크 오류 또는 타임아웃 시 공개 모드(비로그인 가입)로 표시
        if (!cancelled) setIsPublicMode(true);
      }
    };
    checkSession();
    return () => { cancelled = true; };
  }, []);

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (fieldErrors[field]) {
        setFieldErrors((prev) => ({ ...prev, [field]: '' }));
      }
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

    if (!form.email.trim()) {
      errors.email = '이메일을 입력해주세요.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = '올바른 이메일 형식을 입력해주세요.';
    }

    if (form.password.length < 8) {
      errors.password = '비밀번호는 8자 이상 입력해주세요.';
    }

    if (form.password !== form.passwordConfirm) {
      errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    }

    if (!form.office_name.trim()) {
      errors.office_name = '사무소명을 입력해주세요.';
    }

    if (!form.contact_name.trim()) {
      errors.contact_name = '담당자 이름을 입력해주세요.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setError('');

    try {
      if (isPublicMode === true) {
        const res = await fetch('/api/signup/realtor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            password: form.password,
            office_name: form.office_name.trim(),
            contact_name: form.contact_name.trim(),
            contact_phone: form.contact_phone.replace(/-/g, '') || undefined,
            address: form.address.trim() || undefined,
            region: form.region.trim() || undefined,
            business_number: form.business_number.replace(/-/g, '') || undefined,
          }),
        });
        let result: { success?: boolean; error?: string };
        try {
          result = await res.json();
        } catch {
          setError(res.status === 503 || res.status === 500
            ? '서비스 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'
            : '서버 연결에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
          return;
        }
        if (result.success) {
          setSuccess(true);
        } else {
          setError(result.error || '등록에 실패했습니다.');
        }
        return;
      }

      const supabase = getSupabase();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.push('/login');
        return;
      }

      const res = await fetch('/api/admin/realtors/signup', {
        method: 'POST',
        headers: getAuthHeaders(currentSession),
        credentials: 'include',
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          office_name: form.office_name.trim(),
          contact_name: form.contact_name.trim(),
          contact_phone: form.contact_phone.replace(/-/g, '') || undefined,
          address: form.address.trim() || undefined,
          region: form.region.trim() || undefined,
          business_number: form.business_number.replace(/-/g, '') || undefined,
        }),
      });

      let result: { success?: boolean; error?: string };
      try {
        result = await res.json();
      } catch {
        setError('서버 응답을 처리할 수 없습니다. 다시 시도해 주세요.');
        return;
      }
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || '등록에 실패했습니다.');
      }
    } catch (err) {
      const msg = err instanceof Error && /fetch|network|failed/i.test(err.message)
        ? '네트워크 연결을 확인해 주세요. 서버에 연결할 수 없습니다.'
        : '등록 중 오류가 발생했습니다. 다시 시도해 주세요.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isPublicMode === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
      </div>
    );
  }

  if (success) {
    const successContent = (
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            공인중개사 등록 완료
          </h1>
          <p className="text-gray-500 mb-8">
            공인중개사 계정이 성공적으로 생성되었습니다.
            <br />
            이메일 인증 없이 바로 로그인 가능합니다. QR 코드가 자동 생성됩니다.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {isPublicMode ? (
              <Button variant="primary" onClick={() => router.push('/login')}>
                로그인하기
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setForm(initialForm);
                    setSuccess(false);
                    setFieldErrors({});
                  }}
                >
                  추가 등록
                </Button>
                <Button
                  variant="primary"
                  onClick={() => router.push('/members/realtors')}
                >
                  공인중개사 목록으로
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
    return isPublicMode ? (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">{successContent}</div>
      </div>
    ) : (
      <AdminLayout>{successContent}</AdminLayout>
    );
  }

  const formContent = (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        {isPublicMode ? (
          <Link
            href="/login"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors inline-flex items-center gap-2 text-gray-600"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">로그인으로</span>
          </Link>
        ) : (
          <button
            onClick={() => router.push('/members/realtors')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isPublicMode ? '공인중개사 회원가입' : '공인중개사 직접 등록'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isPublicMode
              ? '공인중개사 계정을 생성한 후 로그인하여 서비스를 이용할 수 있습니다.'
              : '새로운 공인중개사 계정을 직접 생성합니다'}
          </p>
        </div>
      </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {isPublicMode && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4 mb-6">
            <p className="text-sm font-medium text-amber-800 mb-3">카카오로 간편 회원가입</p>
            <Button
              type="button"
              variant="secondary"
              className="w-full bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#3C1E1E] border-0"
              disabled={kakaoLoading || submitting}
              onClick={async () => {
                setError('');
                setKakaoLoading(true);
                const result = await signInWithKakao('realtor');
                setKakaoLoading(false);
                if (result?.error) setError(result.error);
              }}
            >
              {kakaoLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  카카오 회원가입 중...
                </>
              ) : (
                '카카오로 회원가입'
              )}
            </Button>
            <p className="text-xs text-amber-700 mt-2">카카오 계정이 있으면 별도 입력 없이 가입할 수 있습니다.</p>
          </div>
        )}

        {isPublicMode && (
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-500">또는 이메일로 가입</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 계정 정보 */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">계정 정보</h2>
              <p className="text-sm text-gray-500 mt-1">로그인에 사용할 이메일과 비밀번호를 설정합니다</p>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Mail className="w-4 h-4" /> 이메일 (로그인 ID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    className={`input w-full ${fieldErrors.email ? 'border-red-400 focus:ring-red-500' : ''}`}
                    placeholder="realtor@example.com"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Lock className="w-4 h-4" /> 비밀번호 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`input w-full pr-10 ${fieldErrors.password ? 'border-red-400 focus:ring-red-500' : ''}`}
                      placeholder="8자 이상"
                      value={form.password}
                      onChange={(e) => updateField('password', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">8자 이상 입력해주세요</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    비밀번호 확인 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswordConfirm ? 'text' : 'password'}
                      className={`input w-full pr-10 ${fieldErrors.passwordConfirm ? 'border-red-400 focus:ring-red-500' : ''}`}
                      placeholder="비밀번호 재입력"
                      value={form.passwordConfirm}
                      onChange={(e) => updateField('passwordConfirm', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.passwordConfirm && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.passwordConfirm}</p>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 중개사무소 정보 */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">중개사무소 정보</h2>
              <p className="text-sm text-gray-500 mt-1">공인중개사 사무소 정보를 입력합니다</p>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Home className="w-4 h-4" /> 사무소명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.office_name ? 'border-red-400 focus:ring-red-500' : ''}`}
                    placeholder="○○ 공인중개사사무소"
                    value={form.office_name}
                    onChange={(e) => updateField('office_name', e.target.value)}
                  />
                  {fieldErrors.office_name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.office_name}</p>
                  )}
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
                    onChange={(e) =>
                      updateField('business_number', formatBusinessNumber(e.target.value))
                    }
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <User className="w-4 h-4" /> 담당자(공인중개사)명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.contact_name ? 'border-red-400 focus:ring-red-500' : ''}`}
                    placeholder="홍길동"
                    value={form.contact_name}
                    onChange={(e) => updateField('contact_name', e.target.value)}
                  />
                  {fieldErrors.contact_name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.contact_name}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Phone className="w-4 h-4" /> 연락처
                  </label>
                  <input
                    type="tel"
                    className="input w-full"
                    placeholder="010-0000-0000"
                    value={form.contact_phone}
                    onChange={(e) =>
                      updateField('contact_phone', formatPhone(e.target.value))
                    }
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <MapPin className="w-4 h-4" /> 지역
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="서울 강남, 경기 수원 등"
                    value={form.region}
                    onChange={(e) => updateField('region', e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <MapPin className="w-4 h-4" /> 사무소 주소
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="서울특별시 강남구 ..."
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 안내 */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <p className="font-medium mb-1">등록 완료 후 자동 처리 사항</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>QR 코드 링크가 자동으로 생성됩니다 (고객 서비스 신청용)</li>
              <li>계정이 즉시 활성화되어 파트너 포털 로그인이 가능합니다</li>
              <li>공인중개사 목록에서 상세 정보 수정 및 상태 관리가 가능합니다</li>
            </ul>
          </div>

          {/* 제출 버튼 */}
          <div className="flex gap-3 justify-end pb-8">
            <Button
              variant="secondary"
              type="button"
              onClick={() => (isPublicMode ? router.push('/login') : router.push('/members/realtors'))}
            >
              취소
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  등록 중...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  공인중개사 등록
                </>
              )}
            </Button>
          </div>
        </form>
    </div>
  );

  if (isPublicMode) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">{formContent}</div>
      </div>
    );
  }

  return <AdminLayout>{formContent}</AdminLayout>;
}
