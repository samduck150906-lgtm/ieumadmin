import type { Partner, User } from '@/types/database';
import type { ServiceCategory } from '@/types/database';

export type MemberPartnerListItem = Partner & { user?: User };

export type MemberPartnerListSort =
  | 'created_at'
  | 'rating_asc'
  | 'complaint_desc'
  | 'assignment_desc';

export interface MemberPartnerListParams {
  search?: string;
  category?: ServiceCategory;
  status?: string;
  page?: number;
  limit?: number;
  sort?: MemberPartnerListSort;
}

export interface MemberPartnerListResponse {
  data: MemberPartnerListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
