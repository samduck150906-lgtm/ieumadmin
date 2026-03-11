'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { loading, signIn, signInWithKakao } = useAuth();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);

  // OAuth 콜백 에러 표시 (카카오 KOE205, KOE006, 미가입 등) / 회원가입 완료 안내
  useEffect(() => {
    if (!searchParams) return;
    const signupSuccess = searchParams.get('signup');
    if (signupSuccess === 'success') {
      setSuccessMsg('회원가입이 완료되었습니다. 아래에서 카카오로 로그인하여 서비스를 이용해 보세요.');
      setError('');
      return;
    }
    if (signupSuccess === 'partner_apply_success') {
      setSuccessMsg('협력업체 신청이 완료되었습니다. 검토 후 연락드리겠습니다.');
      setError('');
      return;
    }
    const callbackError = searchParams.get('error');
    const errorCode = searchParams.get('error_code');
    if (callbackError) {
      const decoded = (() => {
        try {
          return decodeURIComponent(callbackError);
        } catch {
          return callbackError;
        }
      })();
      if (errorCode === 'not_registered') {
        setError(decoded || '등록된 계정이 아닙니다. 제휴업체·공인중개사는 회원가입 후 이용해 주세요.');
      } else if (errorCode === 'exchange_failed' || errorCode === 'profile_load' || errorCode === 'role_lookup') {
        setError(decoded || '로그인 인증에 실패했습니다. 다시 시도해 주세요.');
      } else if (errorCode === 'KOE006' || /KOE006|앱\s*관리자\s*설정/i.test(decoded)) {
        setError(
          '카카오 앱 관리자 설정 오류 (KOE006)가 발생했습니다. ' +
            '카카오 개발자 콘솔 > 제품/플랫폼 > 카카오 로그인 > Redirect URI에 ' +
            'Supabase 대시보드(Authentication > Providers > Kakao)의 Callback URL을 정확히 등록한 뒤 저장해 주세요.'
        );
      } else {
        setError(decoded?.startsWith('카카오') ? decoded : (decoded || '로그인 인증에 실패했습니다. 다시 시도해 주세요.'));
      }
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setSubmitLoading(true);
    const result = await signIn(email.trim(), password);
    setSubmitLoading(false);
    if (result.error) {
      const msg = result.error;
      setError(/Email not confirmed/i.test(msg)
        ? '가입은 완료되었지만 이메일 인증이 필요합니다. 메일함을 확인해 주세요!'
        : msg);
    }
  };

  const handleOAuth = async (
    fn: () => Promise<{ error?: string }>,
    setLoading: (v: boolean) => void
  ) => {
    setError('');
    setLoading(true);
    const result = await fn();
    setLoading(false);
    if (result.error) {
      const msg = result.error;
      setError(/Email not confirmed/i.test(msg)
        ? '가입은 완료되었지만 이메일 인증이 필요합니다. 메일함을 확인해 주세요!'
        : msg);
    }
  };

  return (
    <div className="login-container">
      <div className="login-logo">
        <Image src="/logo.png" alt="이음" width={80} height={80} className="w-full h-full object-contain" />
      </div>
      <div className="login-header">
        <h1>이음 admin</h1>
        <p>제휴업체 · 공인중개사 · 관리자 로그인</p>
      </div>

      <div className="login-card">
        <form onSubmit={handleLogin}>
          {successMsg && (
            <div className="login-success" style={{ marginBottom: '16px', padding: '12px', background: '#e8f5e9', borderRadius: '8px', color: '#2e7d32' }}>
              <p>{successMsg}</p>
            </div>
          )}
          {error && (
            <div className="login-error" style={{ marginBottom: '16px' }}>
              <p>{error}</p>
              {error.includes('KOE006') && (
                <p className="login-error-hint">
                  자세한 설정 방법은 프로젝트 문서 docs/카카오_로그인_설정.md의 「KOE006 오류 해결」을 참고하세요.
                </p>
              )}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              placeholder="admin@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || submitLoading}
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">비밀번호</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || submitLoading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || submitLoading}
            aria-busy={loading || submitLoading}
          >
            {submitLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
                <span>로그인 중...</span>
              </>
            ) : (
              <span>→ 로그인</span>
            )}
          </button>
        </form>

        <div className="divider">또는</div>

        <div className="oauth-buttons">
          <button
            type="button"
            onClick={() => handleOAuth(signInWithKakao, setKakaoLoading)}
            className="btn btn-kakao"
            disabled={loading || kakaoLoading || submitLoading}
          >
            {kakaoLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
                <span>카카오 로그인 중...</span>
              </>
            ) : (
              <span>카카오로 로그인</span>
            )}
          </button>
        </div>

        <div className="divider">
          회원가입
        </div>

        <div className="login-signup-group">
          <p className="login-signup-label" style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '8px' }}>
            카카오로 가입할 유형을 선택하세요
          </p>
          <button
            type="button"
            onClick={() => handleOAuth(() => signInWithKakao('partner'), setKakaoLoading)}
            className="btn btn-kakao"
            disabled={loading || kakaoLoading || submitLoading}
          >
            {kakaoLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
                <span>카카오 회원가입 중...</span>
              </>
            ) : (
              <span>카카오로 제휴업체 회원가입</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth(() => signInWithKakao('realtor'), setKakaoLoading)}
            className="btn btn-kakao"
            disabled={loading || kakaoLoading || submitLoading}
          >
            {kakaoLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
                <span>카카오 회원가입 중...</span>
              </>
            ) : (
              <span>카카오로 공인중개사 회원가입</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth(() => signInWithKakao('partner_apply'), setKakaoLoading)}
            className="btn btn-kakao"
            disabled={loading || kakaoLoading || submitLoading}
          >
            {kakaoLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
                <span>카카오 회원가입 중...</span>
              </>
            ) : (
              <span>카카오로 협력업체 신청</span>
            )}
          </button>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
            <p className="text-xs text-slate-500 mb-2">또는 이메일로 가입</p>
            <Link href="/members/partners/signup" className="login-signup-link">
              제휴업체 회원가입 (이메일)
            </Link>
            <Link href="/members/realtors/signup" className="login-signup-link">
              공인중개사 회원가입 (이메일)
            </Link>
            <Link href="/partner/apply" className="login-signup-link">
              협력업체 신청 (승인 후 가입)
            </Link>
          </div>
        </div>
      </div>

      <p className="login-footer-copy">
        © 2026 이음. All rights reserved.
      </p>
      <p className="login-footer-link-wrap">
        <Link href="/api/auth/verify-role" target="_blank" rel="noopener noreferrer" className="login-footer-link">
          관리자 role 확인 (로그인 후)
        </Link>
      </p>
    </div>
  );
}
