'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { showError, showSuccess } from '@/lib/toast';

export interface ComplaintRow {
  id: string;
  type: string;
  content: string | null;
  status: string;
  follow_up_memo?: string | null;
  created_at: string;
}

const STATUS_OPTIONS: { value: 'pending' | 'processing' | 'resolved'; label: string }[] = [
  { value: 'pending', label: '접수' },
  { value: 'processing', label: '처리중' },
  { value: 'resolved', label: '완료' },
];

const FOLLOW_UP_API = '/api/complaints/follow-up';

interface ComplaintsTableProps {
  data: ComplaintRow[];
}

function ComplaintRowCard({
  row,
  onProcess,
}: {
  row: ComplaintRow;
  onProcess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = Boolean(row.content?.trim());
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === row.status)?.label ?? row.status;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                row.type === 'low_rating' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {row.type === 'low_rating' ? '저평점' : '불만'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {statusLabel}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(row.created_at).toLocaleString('ko-KR')}
            </span>
          </div>
          <div>
            {expanded ? (
              <p className="text-sm text-gray-700 break-words">{row.content || '-'}</p>
            ) : (
              <p className={`text-sm text-gray-700 break-words ${!hasContent ? '' : 'md:inline'}`}>
                {hasContent ? (
                  <span className="line-clamp-2 md:line-clamp-none">{row.content}</span>
                ) : (
                  '-'
                )}
              </p>
            )}
            {hasContent && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-700 md:hidden"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? '접기' : '더 보기'}
              </button>
            )}
          </div>
          {row.follow_up_memo && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">후속조치 기록</p>
              <p className="text-sm text-gray-600 break-words">{row.follow_up_memo}</p>
            </div>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onProcess}
          className="shrink-0"
        >
          <Wrench className="w-4 h-4 mr-1.5" />
          처리하기
        </Button>
      </div>
    </div>
  );
}

export default function ComplaintsTable({ data }: ComplaintsTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<ComplaintRow[]>(data);
  const [modalRow, setModalRow] = useState<ComplaintRow | null>(null);
  const [modalStatus, setModalStatus] = useState<'pending' | 'processing' | 'resolved'>('pending');
  const [modalMemo, setModalMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(data);
  }, [data]);

  const openModal = useCallback((row: ComplaintRow) => {
    setModalRow(row);
    setModalStatus((row.status as 'pending' | 'processing' | 'resolved') || 'pending');
    setModalMemo(row.follow_up_memo ?? '');
  }, []);

  const closeModal = useCallback(() => {
    setModalRow(null);
    setModalStatus('pending');
    setModalMemo('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!modalRow) return;
    setSaving(true);
    try {
      const res = await fetch(FOLLOW_UP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modalRow.id,
          status: modalStatus,
          follow_up_memo: modalMemo.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? '저장에 실패했습니다.');
      }
      setItems((prev) =>
        prev.map((r) =>
          r.id === modalRow.id
            ? { ...r, status: modalStatus, follow_up_memo: modalMemo.trim() || null }
            : r
        )
      );
      showSuccess('저장되었습니다.');
      closeModal();
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [modalRow, modalStatus, modalMemo, closeModal, router]);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        배정된 민원이 없습니다.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {items.map((row) => (
          <ComplaintRowCard key={row.id} row={row} onProcess={() => openModal(row)} />
        ))}
      </div>

      <Modal
        isOpen={!!modalRow}
        onClose={closeModal}
        title="민원 처리"
        description="상태를 변경하고 후속조치를 기록하세요."
        size="md"
        closeOnOverlayClick={!saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              취소
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
          </div>
        }
      >
        {modalRow && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                민원 상태 변경
              </label>
              <select
                value={modalStatus}
                onChange={(e) => setModalStatus(e.target.value as 'pending' | 'processing' | 'resolved')}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                후속조치 기록
              </label>
              <textarea
                value={modalMemo}
                onChange={(e) => setModalMemo(e.target.value)}
                placeholder="조치 내용을 입력하세요."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
