'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react';

function isValidPassword(pw: string): boolean {
  if (pw.length < 8) return false;
  return /[a-zA-Z]/.test(pw) && /\d/.test(pw) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw);
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    isValidPassword(newPassword) &&
    newPassword === confirmPassword &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(newPassword)) {
      setError('비밀번호는 영문자, 숫자, 기호를 포함한 8자 이상으로 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    const client = getBrowserClient();
    if (!client) {
      setError('Supabase가 초기화되지 않았습니다. 환경 설정을 확인해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateErr } = await client.auth.updateUser({ password: newPassword });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      const { data: { user: authUser } } = await client.auth.getUser();
      if (authUser) {
        const { error: updateUserErr } = await client
          .from('users')
          .update({ force_password_change: false })
          .eq('id', authUser.id);
        if (updateUserErr) {
          setError(updateUserErr.message);
          return;
        }
      }

      setDone(true);
      setTimeout(() => router.replace('/partner/dashboard'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4 py-12 sm:py-16">
        <div className="bg-surface rounded-2xl shadow-card p-8 w-full max-w-md text-center space-y-4">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold text-text">비밀번호가 변경되었습니다</h2>
          <p className="text-sm text-text-secondary">대시보드로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4 py-12 sm:py-16">
      <div className="bg-surface rounded-2xl shadow-card p-8 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-brand-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-text">비밀번호 변경 필요</h1>
            <p className="text-sm text-text-secondary mt-1">
              임시 비밀번호로 로그인하셨습니다.<br />
              보안을 위해 새 비밀번호를 설정해 주세요.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-text" htmlFor="newPw">
              새 비밀번호
            </label>
            <div className="relative">
              <input
                id="newPw"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="영문자·숫자·기호 포함 8자 이상"
                className="w-full px-4 py-3 pr-11 rounded-xl border border-primary/20 bg-surface-muted text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 text-sm"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text" htmlFor="confirmPw">
              비밀번호 확인
            </label>
            <div className="relative">
              <input
                id="confirmPw"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호를 다시 입력해 주세요"
                className="w-full px-4 py-3 pr-11 rounded-xl border border-primary/20 bg-surface-muted text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 text-sm"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                onClick={() => setShowConfirm((v) => !v)}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          {!canSubmit && newPassword.length > 0 && (
            <p className="text-xs text-text-muted">
              영문자·숫자·기호를 포함한 8자 이상 입력 후, 비밀번호 확인과 일치하면 버튼이 활성화됩니다.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl bg-brand-primary text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-primary/90 hover:disabled:bg-brand-primary transition-colors flex items-center justify-center gap-2"
          >
            {loading ? '변경 적용 중...' : '변경 적용'}
          </button>
        </form>
      </div>
    </div>
  );
}
