'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  RefreshCw,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  FileText,
  QrCode,
  Calendar,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthHeaders } from '@/lib/auth-headers';

interface RealtorDetail {
  id: string;
  user_id: string;
  business_name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  qr_code_url: string | null;
  referrer_id: string | null;
  referrer_expires_at: string | null;
  account_type: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  account_verified: boolean;
  id_card_url: string | null;
  bankbook_url: string | null;
  business_license_url: string | null;
  last_excel_downloaded_at: string | null;
  last_excel_downloaded_by: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    status: string;
    created_at: string;
  };
  referrer?: {
    id: string;
    business_name: string;
    contact_name: string | null;
    contact_phone: string | null;
  } | null;
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '—'}</dd>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function RealtorDetailClient({ id }: { id: string }) {
  const [realtor, setRealtor] = useState<RealtorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authHeaders = useAuthHeaders();

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/realtors/${id}`, { headers: authHeaders });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '조회 실패');
      }
      const data = await res.json();
      setRealtor(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id, authHeaders]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <AdminLayout>
      <div className="min-h-[80vh] bg-slate-50/60">
        {/* 상단 네비 + 타이틀 */}
        <div className="mb-6">
          <Link
            href="/members/realtors"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            목록으로
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            공인중개사 상세
          </h1>
          <p className="mt-1 text-sm text-slate-500">등록된 모든 정보를 확인할 수 있습니다.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-slate-200 bg-white">
            <RefreshCw className="h-10 w-10 animate-spin text-brand-500 mb-3" aria-hidden />
            <p className="text-sm text-slate-500">불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6">
            <p className="text-red-700 font-medium">{error}</p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={loadDetail}
            >
              다시 시도
            </Button>
          </div>
        ) : realtor ? (
          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard title="기본 정보" icon={Building2}>
              <dl className="space-y-0">
                <DetailRow label="업체명" value={realtor.business_name} icon={Building2} />
                <DetailRow label="주소지" value={realtor.address} icon={MapPin} />
                <DetailRow label="담당자" value={realtor.contact_name} icon={User} />
                <DetailRow label="연락처" value={realtor.contact_phone} icon={Phone} />
                <DetailRow
                  label="QR코드"
                  value={
                    realtor.qr_code_url ? (
                      <a
                        href={realtor.qr_code_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline inline-flex items-center gap-1"
                      >
                        보기 <QrCode className="h-4 w-4" />
                      </a>
                    ) : undefined
                  }
                  icon={QrCode}
                />
                <DetailRow
                  label="가입일"
                  value={new Date(realtor.created_at).toLocaleDateString('ko-KR')}
                  icon={Calendar}
                />
                <DetailRow
                  label="엑셀 최종 다운로드"
                  value={
                    realtor.last_excel_downloaded_at
                      ? new Date(realtor.last_excel_downloaded_at).toLocaleString('ko-KR')
                      : undefined
                  }
                  icon={FileText}
                />
              </dl>
            </SectionCard>

            <SectionCard title="회원(로그인) 정보" icon={User}>
              <dl className="space-y-0">
                <DetailRow label="이메일" value={realtor.user?.email} icon={Mail} />
                <DetailRow label="휴대폰" value={realtor.user?.phone} icon={Phone} />
                <DetailRow label="이름" value={realtor.user?.name} icon={User} />
                <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">상태</dt>
                    <dd className="mt-0.5">
                      <StatusBadge status={realtor.user?.status ?? ''} type="user" />
                    </dd>
                  </div>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="추천인" icon={User}>
              <dl className="space-y-0">
                <DetailRow label="추천인 업체" value={realtor.referrer?.business_name} />
                <DetailRow label="추천인 담당자" value={realtor.referrer?.contact_name} />
                <DetailRow
                  label="추천 만료일"
                  value={
                    realtor.referrer_expires_at
                      ? new Date(realtor.referrer_expires_at).toLocaleDateString('ko-KR')
                      : undefined
                  }
                />
              </dl>
            </SectionCard>

            <SectionCard title="정산 계좌" icon={CreditCard}>
              <dl className="space-y-0">
                <DetailRow
                  label="계좌 유형"
                  value={
                    realtor.account_type === 'business'
                      ? '사업자'
                      : realtor.account_type === 'personal'
                        ? '개인'
                        : undefined
                  }
                />
                <DetailRow label="은행" value={realtor.bank_name} />
                <DetailRow
                  label="계좌번호"
                  value={realtor.account_number ? '****' + realtor.account_number.slice(-4) : undefined}
                />
                <DetailRow label="예금주" value={realtor.account_holder} />
                <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">계좌 인증</dt>
                    <dd className="mt-0.5">
                      {realtor.account_verified ? (
                        <StatusBadge label="완료" variant="green" />
                      ) : (
                        <StatusBadge label="미인증" variant="gray" />
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
