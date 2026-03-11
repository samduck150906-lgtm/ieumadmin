'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Send,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Phone,
  User,
  Calendar,
  Info,
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

const STATUS_CONFIG = {
  sent: { label: '대기 중', color: 'bg-blue-100 text-blue-700', icon: Clock },
  registered: { label: '가입 완료', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  expired: { label: '만료', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

interface ReferredRealtor {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  referrer_expires_at: string | null;
  created_at: string;
}

export default function PartnerInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [referredRealtors, setReferredRealtors] = useState<ReferredRealtor[]>([]);
  const [role, setRole] = useState<'partner' | 'realtor' | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!supabase) {
      setLoadError('연결을 초기화할 수 없습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadError('로그인이 필요합니다.');
        return;
      }

      const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
      const userRole = userData?.role as 'partner' | 'realtor' | undefined;
      setRole(userRole ?? null);

      if (userRole === 'realtor') {
        const { data: myRealtor } = await supabase
          .from('realtors')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (myRealtor) {
          const { data: referred } = await supabase
            .from('realtors')
            .select('id, business_name, contact_name, contact_phone, referrer_expires_at, created_at')
            .eq('referrer_id', myRealtor.id)
            .order('created_at', { ascending: false })
            .limit(50);
          setReferredRealtors((referred || []) as ReferredRealtor[]);
        }
        setInvitations([]);
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch('/api/partner/invitations', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          setInvitations(Array.isArray(json.data) ? json.data : []);
        } else {
          setLoadError('데이터 처리 중 문제가 발생했습니다.');
          setInvitations([]);
        }
        setReferredRealtors([]);
      }
    } catch {
      setLoadError('데이터 처리 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function handleSendInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setMessage({ type: 'err', text: '연락처를 입력하세요.' });
      return;
    }
    if (!supabase) {
      setMessage({ type: 'err', text: '데이터 처리 중 문제가 발생했습니다.' });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionData.session?.access_token) headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      const apiUrl = role === 'realtor' ? '/api/invite/send-realtor' : '/api/partner/send-invite';
      const body = role === 'realtor' ? { phone: phone.trim() } : { phone: phone.trim(), name: name.trim() || null };
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || '발송 실패' });
        return;
      }
      setMessage({ type: 'ok', text: `${phone}으로 초대 문자를 발송했습니다.` });
      setPhone('');
      setName('');
      loadInvitations();
    } catch {
      setMessage({ type: 'err', text: '데이터 처리 중 문제가 발생했습니다.' });
    } finally {
      setSending(false);
    }
  }

  const isRealtor = role === 'realtor';
  const listItems = isRealtor ? referredRealtors : invitations;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">추천인 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRealtor
              ? '공인중개사를 초대하면 추천인 자동 등록 후 1년간 추천 수익을 받을 수 있습니다.'
              : '공인중개사를 초대하면 추천인 자동 등록 후 1년간 추천 수익을 받을 수 있습니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadInvitations}
          className="p-2 rounded-xl bg-white border hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 안내 카드 */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-semibold">초대 혜택 안내</p>
            <ul className="space-y-0.5 text-blue-700">
              <li>• 초대받은 공인중개사가 이음 앱에 가입하면 자동으로 추천인 등록</li>
              <li>• 추천 공인중개사가 의뢰한 건이 완료될 때마다 추천 수익 발생</li>
              <li>• 초대 링크 유효기간: 발송일로부터 <strong>1년</strong></li>
              <li>• 추천 수익 지속기간: 추천인 등록일로부터 <strong>1년</strong></li>
            </ul>
          </div>
        </div>
      </div>

      {/* 초대 발송 폼 */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="font-semibold text-gray-800 mb-4">새 초대 발송</h2>
        <form onSubmit={handleSendInvitation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Phone className="w-3.5 h-3.5 inline mr-1" />
              연락처 *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              required
            />
          </div>
          {!isRealtor && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-3.5 h-3.5 inline mr-1" />
              이름 (선택)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="공인중개사 이름"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          )}

          {message && (
            <div
              className={`p-3 rounded-xl text-sm ${
                message.type === 'ok'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 bg-brand-primary text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? '발송 중...' : '초대 문자 발송'}
          </button>
        </form>
      </div>

      {/* 초대/추천 이력 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{isRealtor ? '추천 가입자' : '발송 이력'}</h2>
          <span className="text-sm text-gray-400">{listItems.length}건</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={loadInvitations}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-medium hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              재시도
            </button>
          </div>
        ) : isRealtor ? (
          referredRealtors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Send className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm">추천 가입한 공인중개사가 없습니다</p>
              <p className="text-xs text-gray-300 mt-1">위에서 초대 문자를 발송해 보세요</p>
            </div>
          ) : (
            <ul className="divide-y">
              {referredRealtors.map((r) => {
                const isActive = r.referrer_expires_at && new Date(r.referrer_expires_at) > new Date();
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 md:flex-row">
                    <div className={`p-2 rounded-xl shrink-0 ${isActive ? 'bg-green-50' : 'bg-gray-100'}`}>
                      {isActive ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {r.business_name || r.contact_name || r.contact_phone || '-'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isActive ? '추천 활성' : '추천 만료'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-xs text-gray-400">
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {new Date(r.created_at).toLocaleDateString('ko-KR')}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : invitations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Send className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm">발송한 초대가 없습니다</p>
          </div>
        ) : (
          <ul className="divide-y">
            {invitations.map((inv) => {
              const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.sent;
              const Icon = cfg.icon;
              const expiresDate = new Date(inv.expires_at);
              const isExpired = expiresDate < new Date();
              return (
                <li key={inv.id} className="px-4 py-3 hover:bg-gray-50 md:flex md:items-center md:gap-3">
                  <div className="flex items-start justify-between gap-3 md:contents">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-xl bg-blue-50 shrink-0">
                        <Icon className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {inv.invitee_name || inv.invitee_phone}
                        </p>
                        {inv.invitee_name && (
                          <p className="text-xs text-gray-400">{inv.invitee_phone}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {inv.sms_sent_at ? new Date(inv.sms_sent_at).toLocaleDateString('ko-KR') : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 mt-2 md:mt-0 md:text-right">
                      {!isExpired && inv.status === 'sent' && (
                        <p className="text-xs text-blue-500">만료: {expiresDate.toLocaleDateString('ko-KR')}</p>
                      )}
                      {isExpired && inv.status === 'sent' && (
                        <p className="text-xs text-red-400">만료됨</p>
                      )}
                      {inv.accepted_at && (
                        <p className="text-xs text-gray-500 mt-0.5">가입: {new Date(inv.accepted_at).toLocaleDateString('ko-KR')}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
