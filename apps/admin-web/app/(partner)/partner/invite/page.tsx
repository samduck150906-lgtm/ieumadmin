'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { showError } from '@/lib/toast';
import {
  Link2,
  QrCode,
  MessageSquare,
  Copy,
  Check,
  Send,
  RefreshCw,
  AlertCircle,
  Users,
  Clock,
  CheckCircle,
} from 'lucide-react';

interface Invitation {
  id: string;
  invitee_phone: string;
  invitee_name: string | null;
  invite_code: string;
  status: 'sent' | 'registered' | 'expired';
  accepted_at: string | null;
  expires_at: string;
  sms_sent_at: string | null;
  created_at: string;
}

interface PartnerInfo {
  id: string;
  businessName: string;
}

const STATUS_LABELS: Record<string, string> = {
  sent: '대기중',
  registered: '가입완료',
  expired: '만료됨',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-50 text-blue-700',
  registered: 'bg-green-50 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
};

export default function PartnerInvitePage() {
  const [partnerInfo, setPartnerInfo] = useState<PartnerInfo | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 복사 상태
  const [copied, setCopied] = useState(false);

  // QR (공인중개사 전용 — 클라이언트 생성)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // 초대 폼
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [role, setRole] = useState<'partner' | 'realtor' | null>(null);
  const [realtorInfo, setRealtorInfo] = useState<{ id: string; businessName: string; formUrl: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('로그인이 필요합니다.'); return; }

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'realtor') {
        setRole('realtor');
        const { data: realtor } = await supabase
          .from('realtors')
          .select('id, business_name, qr_code_url')
          .eq('user_id', user.id)
          .single();
        if (!realtor) { setError('공인중개사 정보를 찾을 수 없습니다.'); return; }
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || 'https://ieum-customer.netlify.app';
        const formUrl = `${siteUrl.replace(/\/$/, '')}/form/${realtor.id}`;
        setRealtorInfo({
          id: realtor.id,
          businessName: realtor.business_name || '부동산',
          formUrl,
        });
        setInvitations([]);
        setLoading(false);
        return;
      }

      setRole('partner');
      const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name')
        .eq('user_id', user.id)
        .single();

      if (!partner) { setError('업체 정보를 찾을 수 없습니다.'); return; }

      setPartnerInfo({
        id: partner.id,
        businessName: partner.business_name || '업체',
      });

      const { data: inviteData } = await supabase
        .from('partner_invitations')
        .select('id, invitee_phone, invitee_name, invite_code, status, accepted_at, expires_at, sms_sent_at, created_at')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setInvitations((inviteData || []) as Invitation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // QR 코드: 공인중개사 전용 (클라이언트 생성)
  useEffect(() => {
    if (role === 'realtor' && realtorInfo?.formUrl) {
      import('qrcode')
        .then((QRCode) =>
          QRCode.toDataURL(realtorInfo.formUrl, {
            width: 240,
            margin: 2,
            color: { dark: '#1a1a1a', light: '#ffffff' },
          })
        )
        .then((dataUrl) => setQrDataUrl(dataUrl))
        .catch(() => {
          setQrDataUrl(null);
          showError('QR 코드 생성에 실패했습니다. 링크 복사는 가능합니다.');
        });
    } else {
      setQrDataUrl(null);
    }
  }, [role, realtorInfo?.formUrl]);

  const handleCopy = () => {
    if (!formUrl?.trim()) {
      showError('복사할 링크가 없습니다.');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showError('클립보드 기능을 사용할 수 없습니다. 링크를 직접 선택해 복사해 주세요.');
      return;
    }
    navigator.clipboard.writeText(formUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      showError('클립보드에 복사할 수 없습니다. 브라우저 권한을 확인해 주세요.');
    });
  };

  const handleSendInvite = async () => {
    if (!invitePhone.trim()) {
      setSendResult({ type: 'err', text: '전화번호를 입력해 주세요.' });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      if (!supabase) {
        setSendResult({ type: 'err', text: 'Supabase가 초기화되지 않았습니다.' });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (role === 'realtor') {
        const res = await fetch('/api/invite/send-customer', {
          method: 'POST',
          headers,
          body: JSON.stringify({ phone: invitePhone.trim(), name: inviteName.trim() || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSendResult({ type: 'err', text: data.error || '발송 실패' });
          return;
        }
        setSendResult({ type: 'ok', text: '고객 초대 문자가 발송되었습니다.' });
      } else {
        const res = await fetch('/api/partner/send-invite', {
          method: 'POST',
          headers,
          body: JSON.stringify({ phone: invitePhone.trim(), name: inviteName.trim() || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSendResult({ type: 'err', text: data.error || '발송 실패' });
          return;
        }
        setSendResult({
          type: 'ok',
          text: data.smsSent
            ? `초대 문자가 발송되었습니다. (초대코드: ${data.inviteCode})`
            : `초대 이력이 기록되었습니다. (SMS 발송 불가 환경)`,
        });
        load();
      }
      setInvitePhone('');
      setInviteName('');
    } catch (e) {
      setSendResult({ type: 'err', text: e instanceof Error ? e.message : '오류' });
    } finally {
      setSending(false);
    }
  };

  const isRealtor = role === 'realtor';
  const formUrl = isRealtor ? (realtorInfo?.formUrl ?? '') : '';
  const displayName = isRealtor ? realtorInfo?.businessName : partnerInfo?.businessName;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isRealtor ? '고객 초대' : '초대 · 홍보'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRealtor ? '폼메일 링크로 고객에게 이사·청소 등 상담을 안내하세요' : '전화번호로 공인중개사를 초대하세요. 가입 시 귀사가 추천인으로 자동 등록됩니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 전용 폼메일 링크 + QR (공인중개사 전용) */}
      {isRealtor && (
        <>
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-brand-primary" />
              <h2 className="font-semibold">전용 폼메일 링크</h2>
            </div>
            <p className="text-sm text-gray-500">
              이 링크를 고객에게 공유하면 이사·청소·인테리어 등 상담 신청을 받을 수 있습니다.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={formUrl || (loading ? '로딩 중...' : '링크 없음')}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                disabled={!formUrl}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-brand-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-brand-primary" />
              <h2 className="font-semibold">전용 QR 코드</h2>
            </div>
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR data URL은 next/image 최적화 불가 */}
                  <img
                    src={qrDataUrl}
                    alt="전용 QR 코드"
                    className="w-48 h-48 rounded-xl border border-gray-100"
                  />
                  <a
                    href={qrDataUrl}
                    download={qrDataUrl.startsWith('data:') ? `qr-${displayName ?? 'form'}.png` : undefined}
                    target={qrDataUrl.startsWith('http') ? '_blank' : undefined}
                    rel={qrDataUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="text-sm text-brand-primary hover:underline flex items-center gap-1"
                  >
                    QR 이미지 다운로드
                  </a>
                  <canvas ref={qrRef} className="hidden" />
                </>
              ) : (
                <div className="w-48 h-48 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2">
                  {loading ? (
                    <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
                  ) : formUrl ? (
                    <QrCode className="w-12 h-12 text-gray-200" />
                  ) : (
                    <QrCode className="w-12 h-12 text-gray-200" />
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 초대 문자 발송 */}
      <div className="bg-white rounded-2xl border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-primary" />
          <h2 className="font-semibold">초대 문자 발송</h2>
        </div>
        <p className="text-sm text-gray-500">
          {isRealtor
            ? '고객 전화번호를 입력하면 폼메일 링크가 포함된 초대 문자가 발송됩니다.'
            : '공인중개사 전화번호를 입력하면 초대 링크가 포함된 문자를 발송합니다. 가입 시 귀사가 추천인으로 자동 등록되며, 초대 유효기간은 1년입니다.'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 (선택)</label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder={isRealtor ? '고객 이름' : '공인중개사 이름'}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 *</label>
            <input
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </div>
        </div>

        {sendResult && (
          <div
            className={`p-3 rounded-xl text-sm ${
              sendResult.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {sendResult.text}
          </div>
        )}

        <button
          type="button"
          onClick={handleSendInvite}
          disabled={sending || !invitePhone.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
          {sending ? '발송 중...' : '초대 문자 발송'}
        </button>
      </div>

      {/* 초대 이력 (파트너만: partner_invitations) */}
      {!isRealtor && (
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold">초대 이력</h2>
          {invitations.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">{invitations.length}건</span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">로딩 중...</div>
        ) : invitations.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">초대 이력이 없습니다</p>
            <p className="text-gray-300 text-xs mt-1">위에서 초대 문자를 발송해 보세요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="shrink-0">
                  {inv.status === 'registered' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : inv.status === 'expired' ? (
                    <Clock className="w-5 h-5 text-gray-300" />
                  ) : (
                    <Clock className="w-5 h-5 text-blue-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {inv.invitee_name || inv.invitee_phone}
                    </p>
                    {inv.invitee_name && (
                      <span className="text-xs text-gray-400">{inv.invitee_phone}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    발송: {new Date(inv.created_at).toLocaleDateString('ko-KR')}
                    {inv.accepted_at && ` · 가입: ${new Date(inv.accepted_at).toLocaleDateString('ko-KR')}`}
                    {` · 만료: ${new Date(inv.expires_at).toLocaleDateString('ko-KR')}`}
                  </p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}>
                  {STATUS_LABELS[inv.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
