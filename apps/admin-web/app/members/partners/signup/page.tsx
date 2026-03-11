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
  Lock,
  ChevronLeft,
  Check,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { SERVICE_CATEGORY_LABELS, ServiceCategory } from '@/types/database';

const PARTNER_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'moving', label: '이사' },
  { value: 'cleaning', label: '입주청소' },
  { value: 'internet_tv', label: '인터넷 & TV' },
  { value: 'appliance_rental', label: '가전렌탈' },
  { value: 'kiosk', label: '키오스크' },
  { value: 'interior', label: '인테리어' },
];

interface FormData {
  email: string;
  password: string;
  passwordConfirm: string;
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
  email: '',
  password: '',
  passwordConfirm: '',
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

export default function PartnerSignupPage() {
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
  /** 비로그인 셀프가입 모드(로그인 페이지에서 진입) vs 관리자 등록 모드 */
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
        const { data: { session } } = (await Promise.race([sessionPromise, timeoutPromise])) as { data: { session: unknown } };
        if (!cancelled) setIsPublicMode(!session);
      } catch {
        if (!cancelled) setIsPublicMode(true);
      }
    };
    checkSession();
    return () => { cancelled = true; };
  }, []);

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev: FormData) => ({ ...prev, [field]: value }));
      if (fieldErrors[field]) {
        setFieldErrors((prev: Record<string, string>) => ({ ...prev, [field]: '' }));
      }
      if (error) setError('');
    },
    [fieldErrors, error]
  );

  const toggleCategory = (cat: string) => {
    setForm((prev: FormData) => ({
      ...prev,
      service_categories: prev.service_categories.includes(cat)
        ? prev.service_categories.filter((c: string) => c !== cat)
        : [...prev.service_categories, cat],
    }));
    if (fieldErrors.service_categories) {
      setFieldErrors((prev: Record<string, string>) => ({ ...prev, service_categories: '' }));
    }
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

    if (!form.business_name.trim()) {
      errors.business_name = '업체명을 입력해주세요.';
    }

    if (form.service_categories.length === 0) {
      errors.service_categories = '업종을 1개 이상 선택해주세요.';
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
      const isPublic = isPublicMode === true;
      if (isPublic) {
        const res = await fetch('/api/signup/partner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            password: form.password,
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
          // 셀프가입 성공 시 기존 세션(관리자 등)을 명시적으로 로그아웃하여
          // "로그인하기" 클릭 시 관리자 대시보드로 리다이렉트되는 문제 방지
          if (isSupabaseConfigured()) {
            try {
              await getSupabase().auth.signOut();
            } catch {
              // Supabase 연결 지연 등 — 무시하고 진행
            }
          }
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

      const res = await fetch('/api/admin/partners/signup', {
        method: 'POST',
        headers: getAuthHeaders(currentSession),
        credentials: 'include',
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
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
      setError('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
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
            제휴업체 회원가입 완료
          </h1>
          <p className="text-gray-500 mb-8">
            제휴업체 계정이 성공적으로 생성되었습니다.
            <br />
            등록된 이메일로 바로 로그인할 수 있습니다.
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
                  onClick={() => router.push('/members/partners')}
                >
                  제휴업체 목록으로
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
    return isPublicMode ? (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            로그인으로 돌아가기
          </Link>
          {successContent}
        </div>
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
            onClick={() => router.push('/members/partners')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">제휴업체 회원가입</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isPublicMode
              ? '제휴업체로 서비스 신청 시 사용할 계정을 만듭니다.'
              : '새로운 제휴업체 계정을 생성합니다'}
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
                const result = await signInWithKakao('partner');
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
                    placeholder="partner@example.com"
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

          {/* 사업자 정보 */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">사업자 정보</h2>
              <p className="text-sm text-gray-500 mt-1">업체의 사업자 정보를 입력합니다</p>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Building2 className="w-4 h-4" /> 업체명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input w-full ${fieldErrors.business_name ? 'border-red-400 focus:ring-red-500' : ''}`}
                    placeholder="업체명을 입력하세요"
                    value={form.business_name}
                    onChange={(e) => updateField('business_name', e.target.value)}
                  />
                  {fieldErrors.business_name && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.business_name}</p>
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
                    onChange={(e) =>
                      updateField('contact_phone', formatPhone(e.target.value))
                    }
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
              </div>
            </CardBody>
          </Card>

          {/* 담당자 정보 */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">담당자 정보</h2>
              <p className="text-sm text-gray-500 mt-1">실제 업무를 담당하는 분의 정보를 입력합니다</p>
            </div>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    onChange={(e) =>
                      updateField('manager_phone', formatPhone(e.target.value))
                    }
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
                  <p className="text-xs text-gray-400 mt-1">로그인 이메일과 다를 수 있습니다 (선택)</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 업종 선택 */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                업종 정보 <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                복수 선택이 가능합니다. 선택한 업종에 따라 DB 배정 시 배정 가능 리스트에 노출됩니다.
              </p>
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
                          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
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
              {form.service_categories.length > 0 && (
                <div className="mt-3 text-sm text-gray-500">
                  선택된 업종: {form.service_categories.map((c) => SERVICE_CATEGORY_LABELS[c]).join(', ')}
                </div>
              )}
            </CardBody>
          </Card>

          {/* 제출 버튼 */}
          <div className="flex gap-3 justify-end pb-8">
            <Button
              variant="secondary"
              type="button"
              onClick={() => (isPublicMode ? router.push('/login') : router.push('/members/partners'))}
            >
              취소
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting}
              isLoading={submitting}
              data-testid="signup-submit"
            >
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
  );

  if (isPublicMode) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {formContent}
        </div>
      </div>
    );
  }

  return <AdminLayout>{formContent}</AdminLayout>;
}
