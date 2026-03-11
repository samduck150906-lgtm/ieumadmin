'use client';

import Link from 'next/link';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { STAFF_ROLE_LABELS, type StaffRole } from '@/types/database';

/** 역할별 권한 매트릭스 (실제 코드 기준: staff_role, is_admin, can_approve_settlement) */
const PERMISSIONS: { id: string; label: string; roles: Record<StaffRole, boolean> }[] = [
  {
    id: 'dashboard',
    label: '대시보드·통계 조회',
    roles: { admin: true, sub_admin: true, accounting: true, cs: true },
  },
  {
    id: 'members',
    label: '회원 관리 (직원·제휴·공인중개사)',
    roles: { admin: true, sub_admin: true, accounting: false, cs: true },
  },
  {
    id: 'settlements',
    label: '정산·출금 승인/완료/반려',
    roles: { admin: true, sub_admin: true, accounting: true, cs: false },
  },
  {
    id: 'payments',
    label: '결제·미수금·송금 관리',
    roles: { admin: true, sub_admin: true, accounting: true, cs: false },
  },
  {
    id: 'settings',
    label: '설정 (일반·역할·시스템)',
    roles: { admin: true, sub_admin: false, accounting: false, cs: false },
  },
  {
    id: 'complaints',
    label: '민원·FAQ·공지 관리',
    roles: { admin: true, sub_admin: true, accounting: false, cs: true },
  },
];

const ROLES: StaffRole[] = ['admin', 'sub_admin', 'accounting', 'cs'];

export default function AdminSettingsRolesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/settings" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">역할/권한</h1>
      </div>
      <p className="text-sm text-gray-500">역할별로 허용되는 기능입니다. 역할 변경은 회원 &gt; 직원 관리에서 할 수 있습니다.</p>

      <Card>
        <CardHeader className="font-semibold text-gray-900">권한 매트릭스</CardHeader>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">기능</th>
                {ROLES.map((role) => (
                  <th key={role} className="text-center px-4 py-3 font-medium text-gray-700 w-28">
                    {STAFF_ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-800">{row.label}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-4 py-3 text-center">
                      {row.roles[role] ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700">
                          <Check className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400">
                          <Minus className="w-4 h-4" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card className="bg-blue-50/50 border-blue-100">
        <CardBody>
          <p className="text-sm text-blue-800">
            직원의 역할을 바꾸려면 <Link href="/members/staff" className="underline font-medium">회원 &gt; 직원 관리</Link>에서 해당 직원의 역할(관리자/서브관리자/회계/CS)을 수정하세요.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
