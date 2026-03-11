'use client';

import { CheckSquare, Square, X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface BulkAction {
  label: string;
  value: string;
  variant?: 'default' | 'danger' | 'success';
}

export interface BulkActionBarProps {
  /** 전체 아이템 수 */
  totalCount: number;
  /** 현재 선택된 ID 집합 */
  selected: Set<string>;
  /** 전체 아이템 ID 목록 (전체선택용) */
  allIds: string[];
  /** 선택 변경 콜백 */
  onSelectionChange: (ids: Set<string>) => void;
  /** 실행할 일괄 액션 목록 */
  actions?: BulkAction[];
  /** 액션 실행 콜백 */
  onAction?: (actionValue: string, selectedIds: string[]) => void;
  /** 선택 중인 상태에서 보여줄 추가 UI */
  extra?: React.ReactNode;
  /** 로딩 중 여부 */
  loading?: boolean;
  /** 전체선택 레이블 커스텀 */
  selectAllLabel?: string;
  /** 선택해제 레이블 커스텀 */
  clearLabel?: string;
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<BulkAction['variant']>, string> = {
  default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  success: 'bg-green-50 text-green-700 hover:bg-green-100',
};

/**
 * 공통 일괄 작업 바 — 전체선택·선택해제·일괄 액션을 제공합니다.
 *
 * @example
 * <BulkActionBar
 *   totalCount={rows.length}
 *   selected={selected}
 *   allIds={rows.map(r => r.id)}
 *   onSelectionChange={setSelected}
 *   actions={[
 *     { label: '일괄 배정', value: 'assign' },
 *     { label: '일괄 취소', value: 'cancel', variant: 'danger' },
 *   ]}
 *   onAction={(value, ids) => handleBulkAction(value, ids)}
 * />
 */
export default function BulkActionBar({
  totalCount,
  selected,
  allIds,
  onSelectionChange,
  actions = [],
  onAction,
  extra,
  loading = false,
  selectAllLabel,
  clearLabel = '선택 해제',
  className = '',
}: BulkActionBarProps) {
  const isAllSelected = allIds.length > 0 && selected.size === allIds.length;
  const isPartiallySelected = selected.size > 0 && !isAllSelected;

  const toggleAll = () => {
    if (isAllSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allIds));
    }
  };

  const clearSelection = () => onSelectionChange(new Set());

  // 드롭다운 상태 — actions가 5개 이상이면 드롭다운으로 묶음
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const useDropdown = actions.length >= 5;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm ${className}`}
      role="toolbar"
      aria-label="일괄 작업"
    >
      {/* 전체선택 체크박스 */}
      <button
        type="button"
        onClick={toggleAll}
        disabled={loading || totalCount === 0}
        className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 disabled:opacity-40"
        aria-pressed={isAllSelected}
        aria-label={isAllSelected ? '전체 해제' : (selectAllLabel ?? `전체 선택 (${totalCount}건)`)}
      >
        {isAllSelected ? (
          <CheckSquare className="w-4.5 h-4.5 text-primary-600" />
        ) : isPartiallySelected ? (
          <CheckSquare className="w-4.5 h-4.5 text-primary-400" />
        ) : (
          <Square className="w-4.5 h-4.5 text-gray-400" />
        )}
        <span>{selectAllLabel ?? `전체 선택 (${totalCount}건)`}</span>
      </button>

      {/* 선택 카운트 배지 */}
      {selected.size > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold px-2.5 py-1">
          {selected.size}건 선택됨
          <button
            type="button"
            onClick={clearSelection}
            className="ml-0.5 hover:text-primary-900"
            aria-label={clearLabel}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}

      {/* 구분선 */}
      {actions.length > 0 && selected.size > 0 && (
        <div className="h-4 w-px bg-gray-200 mx-1" aria-hidden />
      )}

      {/* 액션 버튼들 */}
      {selected.size > 0 && !useDropdown && actions.map((action) => (
        <button
          key={action.value}
          type="button"
          disabled={loading}
          onClick={() => onAction?.(action.value, Array.from(selected))}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            VARIANT_CLASSES[action.variant ?? 'default']
          }`}
        >
          {action.label}
        </button>
      ))}

      {/* 드롭다운 (액션 5개 이상) */}
      {selected.size > 0 && useDropdown && (
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={loading}
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            일괄 작업
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[10rem] bg-white rounded-xl shadow-lg border border-gray-200 py-1 overflow-hidden">
              {actions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onAction?.(action.value, Array.from(selected));
                  }}
                  className={`w-full text-left px-4 py-2 text-sm font-medium hover:bg-gray-50 ${
                    action.variant === 'danger' ? 'text-red-700' :
                    action.variant === 'success' ? 'text-green-700' :
                    'text-gray-700'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 추가 커스텀 UI */}
      {extra && selected.size > 0 && (
        <>
          <div className="h-4 w-px bg-gray-200 mx-1" aria-hidden />
          {extra}
        </>
      )}
    </div>
  );
}

/**
 * 체크박스 셀 렌더링 헬퍼 — 테이블 tbody에서 사용
 */
export function BulkCheckboxCell({
  id,
  selected,
  onToggle,
  disabled = false,
}: {
  id: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <td className="w-10 px-3">
      <input
        type="checkbox"
        checked={selected.has(id)}
        onChange={() => onToggle(id)}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-primary-600 cursor-pointer disabled:opacity-40"
      />
    </td>
  );
}

/**
 * 테이블 헤더 체크박스 — thead에서 사용
 */
export function BulkHeaderCheckbox({
  allIds,
  selected,
  onSelectionChange,
  disabled = false,
}: {
  allIds: string[];
  selected: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  disabled?: boolean;
}) {
  const isAll = allIds.length > 0 && selected.size === allIds.length;
  const isPartial = selected.size > 0 && !isAll;
  return (
    <th className="w-10 px-3">
      <input
        type="checkbox"
        checked={isAll}
        ref={(el) => { if (el) el.indeterminate = isPartial; }}
        onChange={() => onSelectionChange(isAll ? new Set() : new Set(allIds))}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-primary-600 cursor-pointer disabled:opacity-40"
        aria-label={isAll ? '전체 해제' : '전체 선택'}
      />
    </th>
  );
}
