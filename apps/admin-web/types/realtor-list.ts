import type { Realtor, User } from '@/types/database';

export type RealtorListItem = Realtor & {
  user?: User;
  referrer?: { id: string; business_name: string; contact_name: string | null } | null;
};

export interface RealtorListParams {
  search?: string;
  status?: string;
  verified?: boolean;
  excelNotDownloaded?: boolean;
  /** 2주 이상 미활동만 조회 (예: 14) */
  inactiveDays?: number;
  page?: number;
  limit?: number;
}

export interface RealtorListResponse {
  data: RealtorListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
