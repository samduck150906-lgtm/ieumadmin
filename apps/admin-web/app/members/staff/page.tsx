'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserCog, Mail, Save, RefreshCw, UserPlus, Key, UserX } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { getStaffList, updateStaff } from '@/lib/api/staff';
import { getSupabase } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/auth-headers';
import type { Staff, StaffRole } from '@/types/database';
import { STAFF_ROLE_LABELS } from '@/types/database';
import { logger } from '@/lib/logger';
import { showError, showSuccess } from '@/lib/toast';

type StaffRow = Staff & { user?: { id: string; email: string | null; name: string | null; phone: string | null; status: string; created_at: string } };

export default function StaffPage() {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<StaffRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    department: string;
    position: string;
    staff_role: StaffRole;
  }>({ department: '', position: '', staff_role: 'cs' });
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    tempPassword: '',
    department: '',
    position: '',
    staff_role: 'cs' as StaffRole,
  });
  const [adding, setAdding] = useState(false);
  const [resettingPwId, setResettingPwId] = useState<string | null>(null);
  const [resettingPwValue, setResettingPwValue] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStaffList();
      setList(data);
    } catch (err) {
      logger.error('직원 목록 로드 오류', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getStaffRole = (staff: StaffRow): StaffRole => {
    if (staff.staff_role && ['admin', 'sub_admin', 'accounting', 'cs'].includes(staff.staff_role)) {
      return staff.staff_role as StaffRole;
    }
    if (staff.is_admin) return 'admin';
    if (staff.can_approve_settlement) return 'accounting';
    return 'cs';
  };

  const startEdit = (staff: StaffRow) => {
    setEditingId(staff.id);
    setEditForm({
      department: staff.department || '',
      position: staff.position || '',
      staff_role: getStaffRole(staff),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateStaff(editingId, {
        department: editForm.department,
        position: editForm.position,
        staff_role: editForm.staff_role,
      });
      showSuccess('저장되었습니다.');
      setEditingId(null);
      loadData();
    } catch (e) {
      showError('저장 실패: ' + (e instanceof Error ? e.message : '오류'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async () => {
    if (!addForm.email.trim() || !addForm.tempPassword.trim()) {
      showError('이메일과 임시 비밀번호를 입력해주세요.');
      return;
    }
    setAdding(true);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: getAuthHeaders(session),
        credentials: 'include',
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          tempPassword: addForm.tempPassword,
          department: addForm.department,
          position: addForm.position,
          staff_role: addForm.staff_role,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(data.message);
        setShowAddModal(false);
        setAddForm({ name: '', email: '', tempPassword: '', department: '', position: '', staff_role: 'cs' });
        loadData();
      } else {
        showError(data.error || '등록 실패');
      }
    } catch {
      showError('등록 요청 중 오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleStatus = async (staff: StaffRow) => {
    const isActive = staff.user?.status === 'active';
    const action = isActive ? '비활성화' : '활성화';
    if (!confirm(`이 직원을 ${action}하시겠습니까?`)) return;
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(session),
        credentials: 'include',
        body: JSON.stringify({ status: isActive ? 'inactive' : 'active' }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(data.message);
        loadData();
      } else {
        showError(data.error || '처리 실패');
      }
    } catch {
      showError('처리 중 오류가 발생했습니다.');
    }
  };

  const handleResetPassword = async (staffId: string) => {
    const newPassword = resettingPwValue.trim() || prompt('새 임시 비밀번호를 입력하세요.');
    if (!newPassword) return;
    setResettingPwId(staffId);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      const res = await fetch(`/api/staff/${staffId}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(session),
        credentials: 'include',
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(data.message);
        setResettingPwId(null);
        setResettingPwValue('');
        loadData();
      } else {
        showError(data.error || '초기화 실패');
      }
    } catch {
      showError('요청 중 오류가 발생했습니다.');
    } finally {
      setResettingPwId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 권한 레벨 구조 안내 */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">권한 레벨 구조</h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li><strong>관리자</strong> — 전체 메뉴·설정·직원 관리, 정산 승인</li>
            <li><strong>서브관리자</strong> — 일부 관리 기능 (직원 관리·시스템 설정 제외)</li>
            <li><strong>회계</strong> — 정산·출금 승인/완료/반려, 회계 관련 조회</li>
            <li><strong>CS</strong> — 고객·파트너 상담·배정·일반 조회</li>
          </ul>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
            <p className="mt-1 text-sm text-gray-500">팀원 부서·직급·역할(권한) 설정</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadData()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <UserPlus className="w-4 h-4" />
              팀원 추가
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              등록된 직원이 없습니다. &quot;팀원 추가&quot;로 등록하세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일/이름</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">부서</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">직급</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {list.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{row.user?.email || '-'}</span>
                        </div>
                        <div className="text-sm text-gray-500">{row.user?.name || '-'}</div>
                      </td>
                      {editingId === row.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editForm.department}
                              onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                              className="border border-gray-300 rounded px-2 py-1 w-full max-w-[120px]"
                              placeholder="부서"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editForm.position}
                              onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}
                              className="border border-gray-300 rounded px-2 py-1 w-full max-w-[120px]"
                              placeholder="직급"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={editForm.staff_role}
                              onChange={(e) => setEditForm((f) => ({ ...f, staff_role: e.target.value as StaffRole }))}
                              className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[100px]"
                            >
                              {(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map((r) => (
                                <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {row.user?.status === 'active' ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">활성</span>
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">비활성</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={handleSave}
                              disabled={saving}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              <Save className="w-4 h-4" />
                              저장
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="ml-2 inline-flex px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                            >
                              취소
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.department || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.position || '-'}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const role = getStaffRole(row);
                              const styles: Record<StaffRole, string> = {
                                admin: 'bg-blue-100 text-blue-800',
                                sub_admin: 'bg-violet-100 text-violet-800',
                                accounting: 'bg-emerald-100 text-emerald-800',
                                cs: 'bg-gray-100 text-gray-700',
                              };
                              return (
                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[role]}`}>
                                  {STAFF_ROLE_LABELS[role]}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            {row.user?.status === 'active' ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">활성</span>
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">비활성</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <button
                                onClick={() => startEdit(row)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleToggleStatus(row)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-700"
                                title={row.user?.status === 'active' ? '비활성화' : '활성화'}
                              >
                                <UserX className="w-4 h-4" />
                                {row.user?.status === 'active' ? '비활성화' : '활성화'}
                              </button>
                              <button
                                onClick={() => handleResetPassword(row.id)}
                                disabled={resettingPwId === row.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 text-sm rounded-lg hover:bg-amber-50 disabled:opacity-50"
                                title="비밀번호 초기화"
                              >
                                <Key className="w-4 h-4" />
                                비밀번호 초기화
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 팀원 추가 모달 */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">팀원 추가</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="staff@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">임시 비밀번호 *</label>
                  <input
                    type="text"
                    value={addForm.tempPassword}
                    onChange={(e) => setAddForm((f) => ({ ...f, tempPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="최초 로그인 후 변경 권장"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
                  <input
                    type="text"
                    value={addForm.department}
                    onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="영업팀"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직급</label>
                  <input
                    type="text"
                    value={addForm.position}
                    onChange={(e) => setAddForm((f) => ({ ...f, position: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="매니저"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
                  <select
                    value={addForm.staff_role}
                    onChange={(e) => setAddForm((f) => ({ ...f, staff_role: e.target.value as StaffRole }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map((r) => (
                      <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    관리자·서브관리자·회계·CS 중 선택 (권한 레벨 구조 참고)
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleAddStaff}
                  disabled={adding || !addForm.email.trim() || !addForm.tempPassword.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {adding ? '등록 중...' : '등록'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
