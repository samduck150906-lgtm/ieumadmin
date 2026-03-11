'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
} from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

/** 카테고리: 공인중개사 / 이사 / 청소 / 인터넷 / 인테리어 / 기타 */
const CATEGORIES = [
  { id: 'realtor', name: '공인중개사', emoji: '🏠' },
  { id: 'moving', name: '이사', emoji: '🚛' },
  { id: 'cleaning', name: '청소', emoji: '🧹' },
  { id: 'internet', name: '인터넷', emoji: '📡' },
  { id: 'interior', name: '인테리어', emoji: '🪑' },
  { id: 'etc', name: '기타', emoji: '📋' },
];

export default function PartnerApplyPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [address, setAddress] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // 카카오 OAuth 후 협력업체 신청 진입 시 이메일·이름 자동 채움
  useEffect(() => {
    if (!session?.user) return;
    const email = session.user.email || session.user.user_metadata?.email;
    const name =
      session.user.user_metadata?.name ||
      session.user.user_metadata?.full_name ||
      session.user.user_metadata?.nickname;
    setManagerEmail((prev) => (email && !prev ? email : prev));
    setManagerName((prev) => (name && !prev ? name : prev));
  }, [session?.user]);

  const setFieldError = useCallback((field: string, message: string) => {
    setFieldErrors((prev) => (message ? { ...prev, [field]: message } : { ...prev, [field]: '' }));
  }, []);

  const validateField = useCallback(
    (field: string, value: string | boolean): string => {
      switch (field) {
        case 'businessName':
          return !String(value).trim() ? '업체명을 입력해주세요.' : '';
        case 'managerName':
          return !String(value).trim() ? '담당자명을 입력해주세요.' : '';
        case 'managerPhone':
          return !String(value).trim() ? '담당자 연락처를 입력해주세요.' : '';
        case 'managerEmail':
          if (!String(value).trim()) return '담당자 이메일을 입력해주세요.';
          return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)) ? '올바른 이메일을 입력해주세요.' : '';
        case 'agreePrivacy':
          return !value ? '개인정보 수집·이용에 동의해주세요.' : '';
        default:
          return '';
      }
    },
    []
  );

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
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

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    const fields: { key: string; value: string | boolean }[] = [
      { key: 'businessName', value: businessName },
      { key: 'managerName', value: managerName },
      { key: 'managerPhone', value: managerPhone },
      { key: 'managerEmail', value: managerEmail },
      { key: 'agreePrivacy', value: agreePrivacy },
    ];
    fields.forEach(({ key, value }) => {
      const msg = validateField(key, value);
      if (msg) errors[key] = msg;
    });
    setFieldErrors(errors);

    if (!businessName.trim() || !managerName.trim() || !managerPhone.trim() || !managerEmail.trim()) {
      showError('필수 항목을 모두 입력해주세요.');
      return;
    }
    if (selectedCategories.length === 0) {
      showError('희망 업종을 1개 이상 선택해주세요.');
      return;
    }
    if (!agreePrivacy) {
      showError('개인정보 수집·이용에 동의해주세요.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        business_name: businessName.trim(),
        business_number: businessNumber.replace(/-/g, '') || null,
        representative_name: representativeName.trim() || null,
        address: address.trim() || null,
        manager_name: managerName.trim(),
        manager_phone: managerPhone.replace(/-/g, ''),
        manager_email: managerEmail.trim(),
        service_categories: selectedCategories,
        introduction: introduction.trim() || null,
      };

      const response = await fetch('/api/partner/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let result: { success?: boolean; error?: string };
      try {
        result = await response.json();
      } catch {
        showError(
          response.status >= 500
            ? '서비스 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'
            : '서버 응답을 처리할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.'
        );
        return;
      }
      if (result.success) {
        showSuccess('신청이 완료되었습니다. 검토 후 연락드리겠습니다.');
        // 카카오 OAuth로 진입한 경우 세션 정리 후 로그인 페이지로 (승인 전까지 대기)
        if (session) {
          try {
            await getSupabase().auth.signOut();
          } catch {
            // Supabase 미설정/연결 실패 시 무시
          }
        }
        router.push('/auth/login?signup=partner_apply_success');
        return;
      }
      showError(result.error || '신청에 실패했습니다.');
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      showError(`신청 중 오류가 발생했습니다. 다시 시도해주세요. (${message})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <Link href="/auth/login" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
            <span>돌아가기</span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="flex gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">희망 업종을 선택해주세요</h2>
            <p className="text-gray-500 mb-6">복수 선택 가능합니다</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    selectedCategories.includes(c.id)
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="text-2xl">{c.emoji}</span>
                  <p className="font-medium mt-2 text-gray-900">{c.name}</p>
                </button>
              ))}
            </div>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={selectedCategories.length === 0}
                className="w-full py-3.5 min-h-[48px] bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">업체 및 담당자 정보</h2>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-4 h-4" /> 업체명 *
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    if (fieldErrors.businessName) setFieldError('businessName', '');
                  }}
                  onBlur={() => setFieldError('businessName', validateField('businessName', businessName))}
                  className={`w-full border rounded-xl px-4 py-3 min-h-[44px] ${
                    fieldErrors.businessName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  } focus:ring-2 focus:outline-none`}
                  placeholder="업체명을 입력하세요"
                  aria-invalid={!!fieldErrors.businessName}
                />
                {fieldErrors.businessName && (
                  <p className="text-sm text-red-500 mt-1" role="alert">{fieldErrors.businessName}</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileText className="w-4 h-4" /> 사업자등록번호
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(formatBusinessNumber(e.target.value))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="000-00-00000"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4" /> 대표자
                </label>
                <input
                  type="text"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="대표자명"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <MapPin className="w-4 h-4" /> 사업장 주소
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 min-h-[44px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="사업장 주소"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4" /> 담당자명 *
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => {
                    setManagerName(e.target.value);
                    if (fieldErrors.managerName) setFieldError('managerName', '');
                  }}
                  onBlur={() => setFieldError('managerName', validateField('managerName', managerName))}
                  className={`w-full border rounded-xl px-4 py-3 min-h-[44px] ${
                    fieldErrors.managerName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  } focus:ring-2 focus:outline-none`}
                  placeholder="홍길동"
                  aria-invalid={!!fieldErrors.managerName}
                />
                {fieldErrors.managerName && (
                  <p className="text-sm text-red-500 mt-1" role="alert">{fieldErrors.managerName}</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4" /> 담당자 연락처 *
                </label>
                <input
                  type="tel"
                  value={managerPhone}
                  onChange={(e) => {
                    setManagerPhone(formatPhone(e.target.value));
                    if (fieldErrors.managerPhone) setFieldError('managerPhone', '');
                  }}
                  onBlur={() => setFieldError('managerPhone', validateField('managerPhone', managerPhone))}
                  inputMode="numeric"
                  className={`w-full border rounded-xl px-4 py-3 min-h-[44px] ${
                    fieldErrors.managerPhone ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  } focus:ring-2 focus:outline-none`}
                  placeholder="010-0000-0000"
                  aria-invalid={!!fieldErrors.managerPhone}
                />
                {fieldErrors.managerPhone && (
                  <p className="text-sm text-red-500 mt-1" role="alert">{fieldErrors.managerPhone}</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4" /> 담당자 이메일 *
                </label>
                <input
                  type="email"
                  value={managerEmail}
                  onChange={(e) => {
                    setManagerEmail(e.target.value);
                    if (fieldErrors.managerEmail) setFieldError('managerEmail', '');
                  }}
                  onBlur={() => setFieldError('managerEmail', validateField('managerEmail', managerEmail))}
                  className={`w-full border rounded-xl px-4 py-3 min-h-[44px] ${
                    fieldErrors.managerEmail ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  } focus:ring-2 focus:outline-none`}
                  placeholder="partner@example.com"
                  aria-invalid={!!fieldErrors.managerEmail}
                />
                {fieldErrors.managerEmail && (
                  <p className="text-sm text-red-500 mt-1" role="alert">{fieldErrors.managerEmail}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업체 소개 (선택)</label>
                <textarea
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 h-24 resize-none min-h-[44px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="업체 소개, 주요 서비스 지역 등"
                />
              </div>
            </div>

            <div className="mt-6">
              <label
                className={`flex items-start gap-3 p-4 bg-white border rounded-xl cursor-pointer ${
                  fieldErrors.agreePrivacy ? 'border-red-500' : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    setAgreePrivacy(e.target.checked);
                    if (fieldErrors.agreePrivacy) setFieldError('agreePrivacy', '');
                  }}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600"
                  aria-invalid={!!fieldErrors.agreePrivacy}
                />
                <span className="text-sm text-gray-600">
                  개인정보 수집·이용에 동의합니다. 수집된 정보는 제휴 검토 목적으로만 사용됩니다.
                </span>
              </label>
              {fieldErrors.agreePrivacy && (
                <p className="text-sm text-red-500 mt-2" role="alert">{fieldErrors.agreePrivacy}</p>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-3.5 min-h-[48px] border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
              >
                이전
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  !businessName.trim() ||
                  !managerName.trim() ||
                  !managerPhone.trim() ||
                  !managerEmail.trim() ||
                  !agreePrivacy
                }
                className="flex-1 py-3.5 min-h-[48px] bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    신청 중...
                  </>
                ) : (
                  '신청하기'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
