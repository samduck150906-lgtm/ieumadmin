'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getNotificationLogs } from '@/lib/api/notifications';
import { logger, getErrorMessage } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS } from '@/lib/timeout';
import BulkActionBar, { BulkHeaderCheckbox, BulkCheckboxCell } from '@/components/BulkActionBar';

const TYPE_LABELS: Record<string, string> = {
  signup_complete: '신청 완료',
  partner_signup_complete: '제휴업체 회원가입 완료',
  realtor_invite: '공인중개사 초대',
  partner_assigned: '업체 배정',
  assigned: '배정 완료',
  partner_new_assignment: '신규 배정(업체)',
  partner_reminder_not_reserved: '익일 12시 미예약완료(업체)',
  partner_reminder_not_completed: 'D+1 전체완료 미전환(업체)',
  cancelled: '취소 안내',
  review_request: '후기 요청',
  withdrawal_complete: '출금 완료',
  commission_settled: '수수료 정산 완료',
  withdrawal_rejected: '출금 반려',
  system_notice: '시스템 공지',
  sms: 'SMS',
};

const CHANNEL_LABELS: Record<string, string> = {
  alimtalk: '알림톡',
  sms: 'SMS',
  lms: 'LMS',
};

interface NotificationLog {
  id: string;
  recipient_name: string | null;
  recipient_phone: string;
  notification_type: string;
  channel: string;
  message_content: string;
  is_sent: boolean;
  created_at: string;
  error_message?: string | null;
}

const LIMIT = 20;

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const downloadCsv = useCallback((targetLogs: NotificationLog[]) => {
    const BOM = '\uFEFF';
    const rows: string[][] = [
      ['수신자', '연락처', '유형', '채널', '내용', '발송', '오류', '일시'],
      ...targetLogs.map((log) => [
        log.recipient_name ?? '-',
        log.recipient_phone,
        TYPE_LABELS[log.notification_type] ?? log.notification_type,
        CHANNEL_LABELS[log.channel] ?? log.channel,
        log.message_content,
        log.is_sent ? 'Y' : 'N',
        log.error_message ?? '',
        new Date(log.created_at).toLocaleString('ko-KR'),
      ]),
    ];
    const csv = BOM + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `알림내역_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await withTimeout(
        getNotificationLogs({
          search: searchTerm || undefined,
          type: typeFilter || undefined,
          page,
          limit: LIMIT,
        }),
        DATA_FETCH_TIMEOUT_MS
      );
      setLogs(result.data || []);
      setTotal(result.total);
    } catch (err) {
      logger.error('알림 내역 로드 오류', err);
      setLoadError(getErrorMessage(err));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, typeFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleBulkAction = useCallback(
    (action: string, ids: string[]) => {
      if (action === 'export' && ids.length > 0) {
        const targetLogs = logs.filter((l) => ids.includes(l.id));
        downloadCsv(targetLogs);
      }
    },
    [logs, downloadCsv]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">알림 관리</h1>
          <p className="mt-1 text-sm text-gray-500">SMS, 알림톡 발송 내역을 확인합니다</p>
        </div>
      </div>

      {/* 알림 내역 */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-medium">발송 내역</h2>
            <span className="text-sm text-gray-500">총 {total}건</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => downloadCsv(logs)} variant="secondary" size="sm" disabled={loading}>
              <Download className="h-4 w-4 mr-2" />
              CSV 다운로드
            </Button>
            <Button onClick={loadData} variant="secondary" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="input pl-10 w-full"
                placeholder="수신자명, 연락처 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input w-40"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">유형 전체</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {loadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
              <p className="text-sm text-red-700">{loadError}</p>
              <button type="button" onClick={loadData} className="shrink-0 text-sm font-medium text-red-700 underline">
                재시도
              </button>
            </div>
          )}

          {logs.length > 0 && (
            <BulkActionBar
              totalCount={logs.length}
              selected={selected}
              allIds={logs.map((l) => l.id)}
              onSelectionChange={setSelected}
              actions={[{ label: '선택 건 CSV 내보내기', value: 'export', variant: 'default' }]}
              onAction={handleBulkAction}
            />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <>
              <div className="table-container overflow-x-auto">
                <table className="data-table w-full text-sm">
                  <thead>
                    <tr>
                      <BulkHeaderCheckbox
                        allIds={logs.map((l) => l.id)}
                        selected={selected}
                        onSelectionChange={setSelected}
                        disabled={loading}
                      />
                      <th>수신자</th>
                      <th>연락처</th>
                      <th>유형</th>
                      <th>채널</th>
                      <th>내용</th>
                      <th>발송</th>
                      <th>일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center text-gray-500 py-8">
                          알림 내역이 없습니다
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id}>
                          <BulkCheckboxCell id={log.id} selected={selected} onToggle={toggleSelect} />
                          <td className="font-medium">{log.recipient_name || '-'}</td>
                          <td>{log.recipient_phone}</td>
                          <td>
                            <StatusBadge label={TYPE_LABELS[log.notification_type] ?? log.notification_type} variant="blue" />
                          </td>
                          <td>{CHANNEL_LABELS[log.channel] ?? log.channel}</td>
                          <td className="max-w-xs truncate text-gray-500" title={log.message_content}>
                            {log.message_content}
                          </td>
                          <td>
                            {log.is_sent ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <span title={log.error_message ?? '실패'}>
                                <XCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
                              </span>
                            )}
                          </td>
                          <td className="text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="px-0 py-3 border-t flex justify-between items-center">
                  <span className="text-sm text-gray-500">총 {total}건</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 font-medium">
                      {page} / {totalPages}
                    </span>
                    <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
