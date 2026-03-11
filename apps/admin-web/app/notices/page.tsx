'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff, Info } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { showSuccess, showError } from '@/lib/toast';
import { getNotices, createNotice, updateNotice, deleteNotice, updateNoticesBulk, deleteNoticesBulk } from '@/lib/api/notices';
import type { NoticeRow } from '@/lib/api/notices';
import RichTextEditor from '@/components/ui/RichTextEditor';
import BulkActionBar, { BulkHeaderCheckbox, BulkCheckboxCell } from '@/components/BulkActionBar';

const NOTICE_EXPOSURE_INFO =
  '공개 시 노출 위치: 랜딩 페이지 푸터(공지사항 링크), 앱 초대/홈 공지 영역, 앱 마이페이지 > 공지사항';

export default function NoticesPage() {
  const { user } = useAuth();
  const [list, setList] = useState<NoticeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; item: NoticeRow | null }>({ open: false, item: null });
  const [form, setForm] = useState({ title: '', content: '', category: '', is_published: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotices({ publishedOnly: false, limit: 100 });
      setList(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ title: '', content: '', category: '', is_published: true });
    setModal({ open: true, item: null });
  };
  const openEdit = (item: NoticeRow) => {
    setForm({
      title: item.title,
      content: item.content,
      category: item.category ?? '',
      is_published: item.is_published,
    });
    setModal({ open: true, item });
  };
  const handleSave = async () => {
    if (!form.title.trim()) {
      showError('제목을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      if (modal.item) {
        await updateNotice(modal.item.id, {
          title: form.title,
          content: form.content,
          category: form.category.trim() || null,
          is_published: form.is_published,
        });
        showSuccess('수정되었습니다.');
      } else {
        await createNotice(
          {
            title: form.title,
            content: form.content,
            category: form.category.trim() || null,
            is_published: form.is_published,
          },
          user?.id
        );
        showSuccess('등록되었습니다.');
      }
      setModal({ open: false, item: null });
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await deleteNotice(id);
      showSuccess('삭제되었습니다.');
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const handleBulkAction = async (action: string, ids: string[]) => {
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      if (action === 'publish') {
        await updateNoticesBulk(ids, true);
        showSuccess(`${ids.length}건 공개 처리되었습니다.`);
      } else if (action === 'unpublish') {
        await updateNoticesBulk(ids, false);
        showSuccess(`${ids.length}건 비공개 처리되었습니다.`);
      } else if (action === 'delete') {
        if (!confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?`)) return;
        await deleteNoticesBulk(ids);
        showSuccess(`${ids.length}건 삭제되었습니다.`);
      }
      setSelected(new Set());
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : '일괄 처리 실패');
    } finally {
      setBulkUpdating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">공지사항</h1>
          <div className="flex gap-2 items-center">
            <span className="flex items-center gap-1.5 text-sm text-gray-500" title={NOTICE_EXPOSURE_INFO}>
              <Info className="h-4 w-4 text-gray-400" />
              노출 위치: 랜딩 푸터·앱 초대/홈·마이페이지
            </span>
            <Button onClick={load} variant="secondary" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <Button onClick={openCreate} variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              공지 등록
            </Button>
          </div>
        </div>

        {list.length > 0 && (
          <BulkActionBar
            totalCount={list.length}
            selected={selected}
            allIds={list.map((n) => n.id)}
            onSelectionChange={setSelected}
            loading={bulkUpdating}
            actions={[
              { label: '일괄 공개', value: 'publish', variant: 'success' },
              { label: '일괄 비공개', value: 'unpublish', variant: 'default' },
              { label: '일괄 삭제', value: 'delete', variant: 'danger' },
            ]}
            onAction={handleBulkAction}
          />
        )}

        <Card>
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <BulkHeaderCheckbox
                      allIds={list.map((n) => n.id)}
                      selected={selected}
                      onSelectionChange={setSelected}
                      disabled={loading}
                    />
                    <th>카테고리</th>
                    <th>제목</th>
                    <th>공개</th>
                    <th>등록일</th>
                    <th className="w-28">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8">
                        공지가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    list.map((item) => (
                      <tr key={item.id}>
                        <BulkCheckboxCell id={item.id} selected={selected} onToggle={toggleSelect} disabled={bulkUpdating} />
                        <td className="text-sm text-gray-600">{item.category || '-'}</td>
                        <td className="font-medium">{item.title}</td>
                        <td>
                          {item.is_published ? (
                            <span className="inline-flex items-center text-green-600 text-sm"><Eye className="h-4 w-4 mr-1" /> 공개</span>
                          ) : (
                            <span className="inline-flex items-center text-gray-500 text-sm"><EyeOff className="h-4 w-4 mr-1" /> 비공개</span>
                          )}
                        </td>
                        <td className="text-gray-500 text-sm">{new Date(item.created_at).toLocaleDateString('ko-KR')}</td>
                        <td>
                          <button onClick={() => openEdit(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">{modal.item ? '공지 수정' : '공지 등록'}</h2>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                {NOTICE_EXPOSURE_INFO}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
                <input
                  type="text"
                  className="input w-full"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="예: 이용안내, 점검, 이벤트, 기타"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">제목 *</label>
                <input
                  type="text"
                  className="input w-full"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="제목"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">내용</label>
                <RichTextEditor
                  value={form.content}
                  onChange={(content) => setForm((f) => ({ ...f, content }))}
                  placeholder="내용 (굵게, 목록, 링크 등 서식 지원)"
                  minHeight="240px"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">공개 (비공개 시 고객/앱에 표시되지 않음)</span>
              </label>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button onClick={() => setModal({ open: false, item: null })} variant="secondary" className="flex-1">
                취소
              </Button>
              <Button onClick={handleSave} disabled={saving} variant="primary" className="flex-1">
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
