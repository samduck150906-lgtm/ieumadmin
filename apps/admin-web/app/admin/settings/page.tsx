'use client';

import Link from 'next/link';
import { Settings, Shield, Wrench } from 'lucide-react';

const SETTING_CARDS = [
  {
    href: '/admin/settings/general',
    icon: Settings,
    color: 'bg-blue-50 text-blue-600',
    title: '일반 설정',
    desc: '서비스명, 고객센터, 수수료율, 자동완료 설정',
  },
  {
    href: '/admin/settings/roles',
    icon: Shield,
    color: 'bg-purple-50 text-purple-600',
    title: '역할 / 권한',
    desc: '역할별 접근 가능한 기능 확인',
  },
  {
    href: '/admin/settings/system',
    icon: Wrench,
    color: 'bg-slate-50 text-slate-600',
    title: '시스템 상태',
    desc: 'DB, 결제, 문자 연동 상태 확인 및 점검모드',
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">설정</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SETTING_CARDS.map((card) => (
          <Link key={card.href} href={card.href}>
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <h2 className="font-semibold text-gray-900">{card.title}</h2>
              </div>
              <p className="text-sm text-gray-500">{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
