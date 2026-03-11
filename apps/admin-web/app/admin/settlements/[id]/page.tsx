'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useSettlementDetail } from '@/hooks/useSettlements';
import { formatCurrency, formatDate } from '@/utils/format';
import { ArrowLeft } from 'lucide-react';

export default function AdminSettlementDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { data: settlement, isLoading } = useSettlementDetail(id);

  if (isLoading || !settlement) {
    return (
      <div className="space-y-6">
        <Link href="/admin/settlements" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> 정산 관리
        </Link>
        <p className="text-gray-500">로딩 중이거나 정산을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const periodLabel = `${formatDate(settlement.period.startDate, 'dot')}~${formatDate(settlement.period.endDate, 'dot')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/settlements" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> 정산 관리 / {String(settlement.id).toUpperCase()}
        </Link>
        <div className="flex gap-2">
          <Button size="sm">처리</Button>
          <Button variant="outline" size="sm">보류</Button>
          <Button variant="danger" size="sm">취소</Button>
        </div>
      </div>

      <Card>
        <CardBody>
          <p className="text-sm text-gray-500 mb-2">상태</p>
          <StatusBadge status={settlement.status} type="settlement" />
        </CardBody>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>정산 정보</CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-gray-500">번호</span> {String(settlement.id)}</p>
            <p><span className="text-gray-500">기간</span> {periodLabel}</p>
            <p><span className="text-gray-500">정산액</span> {formatCurrency(settlement.amount)}</p>
            <p><span className="text-gray-500">수수료</span> {formatCurrency(settlement.fee)}</p>
            <p><span className="text-gray-500">실지급액</span> {formatCurrency(settlement.netAmount)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>파트너 정보</CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-gray-500">업체</span> {settlement.partnerName}</p>
            <p><span className="text-gray-500">은행</span> {settlement.bankInfo?.bankName}</p>
            <p><span className="text-gray-500">계좌</span> {settlement.bankInfo?.accountNumber}</p>
            <p><span className="text-gray-500">예금주</span> {settlement.bankInfo?.accountHolder}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>포함된 수수료 내역</CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500">API 연동 후 표시됩니다.</p>
        </CardBody>
      </Card>
    </div>
  );
}
