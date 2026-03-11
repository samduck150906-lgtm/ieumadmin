'use client';

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type RowSelectionState,
  type OnChangeFn,
} from '@tanstack/react-table';
import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import Pagination from './Pagination';
import EmptyState from './EmptyState';
import { Skeleton } from './Skeleton';

function IndeterminateCheckbox({
  checked,
  indeterminate,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...props} />;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** 데이터 없음 시 "다시 시도" 버튼 클릭 시 호출 */
  onRetry?: () => void;
  pageCount?: number;
}

export default function DataTable<T>({
  columns,
  data,
  isLoading = false,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  emptyMessage = '데이터가 없습니다.',
  onRetry,
  pageCount,
}: DataTableProps<T>) {
  'use no memo'; // TanStack Table + useSyncExternalStore 호환 (bk.snapshot is not a function 방지)
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);

  const hasPagination = pagination !== undefined && onPaginationChange !== undefined;
  const hasSorting = sorting !== undefined && onSortingChange !== undefined;
  const hasSelection = rowSelection !== undefined && onRowSelectionChange !== undefined;

  const cols = useMemo(() => {
    if (!hasSelection) return columns;
    const selectCol: ColumnDef<T> = {
      id: 'select',
      header: ({ table }) => (
        <IndeterminateCheckbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          aria-label="전체 선택"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          aria-label="행 선택"
        />
      ),
    };
    return [selectCol, ...columns];
  }, [columns, hasSelection]);

  const isManualPagination = pageCount !== undefined;

  const table = useReactTable({
    data,
    columns: cols,
    state: {
      pagination: hasPagination ? pagination : internalPagination,
      sorting: hasSorting ? sorting : internalSorting,
      rowSelection: rowSelection ?? {},
    },
    onPaginationChange: hasPagination ? onPaginationChange : setInternalPagination,
    onSortingChange: hasSorting ? onSortingChange : setInternalSorting,
    onRowSelectionChange: onRowSelectionChange ?? (() => {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: isManualPagination
      ? (table) => () => table.getSortedRowModel()
      : getPaginationRowModel(),
    manualPagination: isManualPagination,
    pageCount: pageCount ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="overflow-x-auto overflow-touch rounded-xl border border-gray-200/80 -mx-px sm:mx-0 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/80">
            <tr>
              {cols.map((_, i) => (
                <th key={i} className="px-3 py-2.5 sm:px-4 sm:py-3 text-left">
                  <Skeleton className="h-4 w-24" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((r) => (
              <tr key={r} className="border-t border-gray-100">
                {cols.map((_, i) => (
                  <td key={i} className="px-3 py-2.5 sm:px-4 sm:py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title={emptyMessage}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto overflow-touch rounded-xl border border-gray-200/80 -mx-px sm:mx-0 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/80">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-3 py-2.5 sm:px-4 sm:py-3 text-left text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort?.() && (
                        <button
                          type="button"
                          onClick={() => h.column.toggleSorting()}
                          className="p-1 rounded-lg hover:bg-gray-200 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                          aria-label="정렬"
                        >
                          {h.column.getIsSorted() === 'asc' && <ChevronUp className="h-3.5 w-3.5" />}
                          {h.column.getIsSorted() === 'desc' && <ChevronDown className="h-3.5 w-3.5" />}
                          {!h.column.getIsSorted() && <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn(
                  'transition-colors',
                  idx % 2 === 1 && 'bg-gray-50/40',
                  'hover:bg-brand-50/40',
                  onRowClick && 'cursor-pointer active:bg-brand-50/60'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 sm:px-4 sm:py-3 text-[13px] sm:text-sm text-gray-700 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <Pagination
          page={table.getState().pagination.pageIndex + 1}
          totalPages={table.getPageCount()}
          onPageChange={(p) => table.setPageIndex(p - 1)}
        />
      )}
    </div>
  );
}
