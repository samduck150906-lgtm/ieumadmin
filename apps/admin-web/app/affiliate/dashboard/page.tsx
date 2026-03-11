'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  ShoppingCart,
  Database,
  DollarSign,
  CreditCard,
  ArrowRight,
} from 'lucide-react';

export default function AffiliateDashboardPage() {
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
        <h1 className="text-2xl font-bold">제휴업체 대시보드</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          본인 업체 정보 및 견적만 확인할 수 있습니다.
          {email && (
            <span className="block mt-1">로그인 계정: {email}</span>
          )}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-5 border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-3">바로가기</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            href="/partner/db-list"
            className="flex items-center gap-4 p-4 rounded-xl border-2 border-brand-primary/20 bg-brand-primary/5 hover:bg-brand-primary/10 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-primary/20 flex items-center justify-center group-hover:bg-brand-primary/30">
              <ShoppingCart className="w-6 h-6 text-brand-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">DB 구매</p>
              <p className="text-xs text-gray-500 mt-0.5">DB 마켓에서 구매</p>
            </div>
            <ArrowRight className="w-5 h-5 text-brand-primary shrink-0" />
          </Link>
          <Link
            href="/partner/assignments"
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
              <Database className="w-6 h-6 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">DB 관리</p>
              <p className="text-xs text-gray-500 mt-0.5">배정 DB 열람·상태 관리</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/partner/unpaid-pay"
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
              <DollarSign className="w-6 h-6 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">결제(미수 등)</p>
              <p className="text-xs text-gray-500 mt-0.5">미수금 결제</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
          <Link
            href="/partner/payments"
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
              <CreditCard className="w-6 h-6 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">결제 내역</p>
              <p className="text-xs text-gray-500 mt-0.5">결제 이력 조회</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LayoutDashboard className="w-4 h-4 shrink-0" />
        <span>상세 업무는 상단 메뉴에서 이용할 수 있습니다. 기존 파트너 포털(/partner)과 동일한 기능을 제공합니다.</span>
      </div>
    </div>
  );
}
