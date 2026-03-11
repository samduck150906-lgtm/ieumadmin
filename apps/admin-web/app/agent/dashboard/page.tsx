'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { BarChart3, Send, Users, ArrowRight } from 'lucide-react';

export default function AgentDashboardPage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">공인중개사 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          본인 매물·수익만 확인할 수 있습니다.
          {email && (
            <span className="block mt-1">로그인 계정: {email}</span>
          )}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5 border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-3">바로가기</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/partner/settlements"
            className="flex items-center gap-4 p-4 rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 hover:bg-brand-primary/10 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-primary/20 flex items-center justify-center group-hover:bg-brand-primary/30">
              <BarChart3 className="w-6 h-6 text-brand-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">내 수익 현황</p>
              <p className="text-xs text-gray-500 mt-0.5">정산·수익금 확인</p>
            </div>
            <ArrowRight className="w-5 h-5 text-brand-primary shrink-0" />
          </Link>
          <Link
            href="/partner/invite"
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
              <Send className="w-6 h-6 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">고객 초대</p>
              <p className="text-xs text-gray-500 mt-0.5">초대 링크 공유</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/partner/invitations"
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
              <Users className="w-6 h-6 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">추천인 관리</p>
              <p className="text-xs text-gray-500 mt-0.5">추천인 목록·수수료</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
