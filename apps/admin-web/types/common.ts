/**
 * 공통 타입 정의
 */

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export type StatusType =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'suspended'
  | 'terminated'
  | 'deleted';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface FilterParams {
  search?: string;
  status?: StatusType;
  dateRange?: DateRange;
  [key: string]: unknown;
}
