'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  RefreshCw,
  Plus,
  Mail,
  List,
  MessageSquare,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { getSiteSettings, updateSiteSettings } from '@/lib/api/settings';
import { showError, showSuccess } from '@/lib/toast';

export interface FormServiceItem {
  id: string;
  category_key: string;
  label: string;
  emoji: string;
  display_order: number;
  is_active: boolean;
}

export interface RealtorInviteRow {
  id: string;
  business_name: string | null;
  custom_invite_message: string | null;
}

export default function FormmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultMessage, setDefaultMessage] = useState('');
  const [serviceItems, setServiceItems] = useState<FormServiceItem[]>([]);
  const [realtors, setRealtors] = useState<RealtorInviteRow[]>([]);
  const [realtorSearch, setRealtorSearch] = useState('');
  const [newCategoryKey, setNewCategoryKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('📋');
  const [editingRealtorId, setEditingRealtorId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const loadData = useCallback(
    async (search?: string) => {
      setLoading(true);
      setMigrationNeeded(false);
      try {
        const [settings, itemsResRaw, realtorsResRaw] = await Promise.all([
          getSiteSettings(),
          fetch('/api/admin/formmail/service-items', { credentials: 'include' }),
          fetch(
            `/api/admin/formmail/realtors-invite-messages?search=${encodeURIComponent(search ?? realtorSearch)}`,
            { credentials: 'include' }
          ),
        ]);
        const itemsRes = await itemsResRaw.json().catch(() => ({}));
        const realtorsRes = await realtorsResRaw.json().catch(() => ({}));

        setDefaultMessage(settings?.default_invite_message ?? '');
        setServiceItems(itemsRes?.items ?? []);

        if (!itemsResRaw.ok && itemsRes?.error) {
          showError(`서비스 항목 로드 실패: ${itemsRes.error}`);
        }
        if (itemsRes?.error && (String(itemsRes.error).includes('relation') || String(itemsRes.error).includes('does not exist'))) {
          setMigrationNeeded(true);
        }

        setRealtors(realtorsRes?.realtors ?? []);
        if (!realtorsResRaw.ok && realtorsRes?.error) {
          showError(`공인중개사 목록 로드 실패: ${realtorsRes.error}`);
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : '로드 실패');
      } finally {
        setLoading(false);
      }
    },
    [realtorSearch]
  );

  const handleApplyMigration = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/db/apply-form-service-items', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || '마이그레이션 실패');
      showSuccess(data.message || '마이그레이션이 적용되었습니다.');
      setMigrationNeeded(false);
      loadData();
    } catch (e) {
      showError(e instanceof Error ? e.message : '마이그레이션 실패');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 마운트 시 1회만 로드

  const handleSaveDefaultMessage = async () => {
    setSaving(true);
    try {
      await updateSiteSettings({ default_invite_message: defaultMessage || null });
      showSuccess('기본 문구가 저장되었습니다.');
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleAddService = async () => {
    if (!newCategoryKey.trim() || !newLabel.trim()) {
      showError('category_key와 label을 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/formmail/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category_key: newCategoryKey.trim().toLowerCase().replace(/\s+/g, '_'),
          label: newLabel.trim(),
          emoji: newEmoji.trim() || '📋',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '추가 실패');
      showSuccess('서비스 항목이 추가되었습니다. 신규 카테고리면 Supabase SQL Editor에서 enum 추가가 필요할 수 있습니다.');
      setNewCategoryKey('');
      setNewLabel('');
      setNewEmoji('📋');
      loadData();
      if (data.migrationHint) console.info(data.migrationHint);
    } catch (e) {
      showError(e instanceof Error ? e.message : '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: FormServiceItem) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/formmail/service-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      showSuccess(item.is_active ? '비활성화되었습니다.' : '활성화되었습니다.');
      loadData();
    } catch (e) {
      showError(e instanceof Error ? e.message : '수정 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItem = async (item: FormServiceItem, updates: Partial<{ label: string; emoji: string }>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/formmail/service-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      showSuccess('수정되었습니다.');
      loadData();
    } catch (e) {
      showError(e instanceof Error ? e.message : '수정 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveOrder = async (item: FormServiceItem, direction: 'up' | 'down') => {
    const idx = serviceItems.findIndex((s) => s.id === item.id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= serviceItems.length) return;

    const reordered = [...serviceItems];
    const [removed] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, removed);

    const orderUpdates = reordered.map((s, i) => ({ id: s.id, display_order: i }));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/formmail/service-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order_updates: orderUpdates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '순서 변경 실패');
      showSuccess('순서가 변경되었습니다.');
      loadData();
    } catch (e) {
      showError(e instanceof Error ? e.message : '순서 변경 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRealtorMessage = async (realtorId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/realtors/${realtorId}/custom-invite-message`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ custom_invite_message: editingMessage || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      showSuccess('공인중개사 전용 문구가 저장되었습니다.');
      setEditingRealtorId(null);
      loadData();
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">폼메일 설정</h1>
            <p className="mt-1 text-sm text-gray-500">
              서비스 항목, 기본 문구, 공인중개사별 전용 문구를 한 곳에서 관리합니다.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadData()} leftIcon={<RefreshCw className="w-4 h-4" />}>
            새로고침
          </Button>
        </div>

        {/* 서비스 항목 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <List className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">서비스 항목 (추가/삭제/순서)</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {migrationNeeded && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800">
                  form_service_items 테이블이 없습니다. .env.local에 DATABASE_URL을 추가한 뒤 마이그레이션을 적용해 주세요.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplyMigration}
                  disabled={saving}
                >
                  {saving ? '적용 중...' : '마이그레이션 적용'}
                </Button>
              </div>
            )}
            <p className="text-sm text-gray-500">
              폼 신청 시 표시되는 서비스 옵션입니다. 비활성화 시 고객 폼에 노출되지 않습니다. 신규 추가 시
              service_category enum 마이그레이션이 필요할 수 있습니다.
            </p>
            <div className="space-y-2">
              {serviceItems.map((item, idx) => (
                <ServiceItemRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  total={serviceItems.length}
                  saving={saving}
                  onMoveUp={() => handleMoveOrder(item, 'up')}
                  onMoveDown={() => handleMoveOrder(item, 'down')}
                  onUpdate={(updates) => handleUpdateItem(item, updates)}
                  onToggleActive={() => handleToggleActive(item)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <input
                type="text"
                placeholder="category_key (예: new_service)"
                value={newCategoryKey}
                onChange={(e) => setNewCategoryKey(e.target.value)}
                className="border rounded-lg px-3 py-2 w-48 text-sm"
              />
              <input
                type="text"
                placeholder="표시명"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="border rounded-lg px-3 py-2 w-32 text-sm"
              />
              <input
                type="text"
                placeholder="이모지"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                className="border rounded-lg px-2 py-2 w-14 text-center text-sm"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddService}
                disabled={saving || !newCategoryKey.trim() || !newLabel.trim()}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                추가
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* 기본 문구 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold">고객 초대 기본 문구</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm text-gray-500">
              공인중개사 앱에서 고객에게 보낼 폼메일 링크 문구. 공인중개사가 수정 후 저장하면 해당 부동산 전용 문구로
              저장됩니다.
            </p>
            <textarea
              value={defaultMessage}
              onChange={(e) => setDefaultMessage(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 min-h-[120px] text-sm"
              placeholder="안녕하세요 &quot;부동산명&quot;입니다.&#10;이사, 청소, 인테리어, 인터넷이전 등 한번에 알아보실 수 있는 플랫폼이 있어 소개해 드립니다..."
              rows={5}
            />
            <Button variant="primary" size="sm" onClick={handleSaveDefaultMessage} disabled={saving} leftIcon={<Save className="w-4 h-4" />}>
              저장
            </Button>
          </CardBody>
        </Card>

        {/* 공인중개사별 전용 문구 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Users className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold">공인중개사별 전용 문구</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm text-gray-500">
              관리자가 개별 공인중개사의 고객 초대 문구를 직접 설정합니다. 비어 있으면 기본 문구를 사용합니다.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="업체명 검색"
                value={realtorSearch}
                onChange={(e) => setRealtorSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData(realtorSearch)}
                className="border rounded-lg px-3 py-2 w-64 text-sm"
              />
              <Button variant="secondary" size="sm" onClick={() => loadData(realtorSearch)}>
                검색
              </Button>
            </div>
            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {realtors.map((r) => (
                <div key={r.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{r.business_name || r.id}</p>
                      {editingRealtorId === r.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingMessage}
                            onChange={(e) => setEditingMessage(e.target.value)}
                            className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
                            placeholder="전용 문구 (비우면 기본 문구 사용)"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveRealtorMessage(r.id)} disabled={saving}>
                              저장
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingRealtorId(null);
                                setEditingMessage('');
                              }}
                            >
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                          {r.custom_invite_message || '(기본 문구 사용)'}
                        </p>
                      )}
                    </div>
                    {editingRealtorId !== r.id && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingRealtorId(r.id);
                          setEditingMessage(r.custom_invite_message ?? '');
                        }}
                      >
                        {r.custom_invite_message ? '수정' : '설정'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}

function ServiceItemRow({
  item,
  idx,
  total,
  saving,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onToggleActive,
}: {
  item: FormServiceItem;
  idx: number;
  total: number;
  saving: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (updates: Partial<{ label: string; emoji: string }>) => void;
  onToggleActive: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [emoji, setEmoji] = useState(item.emoji);
  useEffect(() => {
    setLabel(item.label);
    setEmoji(item.emoji);
  }, [item.label, item.emoji]);

  const handleBlurLabel = () => {
    if (label !== item.label) onUpdate({ label });
  };
  const handleBlurEmoji = () => {
    if (emoji !== item.emoji) onUpdate({ emoji });
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        item.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={idx === 0 || saving}
          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={idx === total - 1 || saving}
          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <span className="text-xl">{emoji}</span>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={handleBlurLabel}
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={handleBlurEmoji}
        className="w-12 border rounded px-2 py-1 text-center text-sm"
      />
      <span className="text-xs text-gray-400 font-mono">{item.category_key}</span>
      <Button variant="secondary" size="sm" onClick={onToggleActive} disabled={saving} title={item.is_active ? '비활성화' : '활성화'}>
        {item.is_active ? '비활성화' : '활성화'}
      </Button>
    </div>
  );
}
