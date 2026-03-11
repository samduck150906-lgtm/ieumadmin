import { getPartners } from '@/lib/api/partners';
import type {
  MemberPartnerListParams,
  MemberPartnerListResponse,
} from '@/types/member-partner';

export const memberPartnerService = {
  async getList(
    params: MemberPartnerListParams
  ): Promise<MemberPartnerListResponse> {
    const result = await getPartners({
      search: params.search,
      category: params.category,
      status: params.status,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      sort: params.sort ?? 'created_at',
    });
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      page: result.page ?? 1,
      limit: result.limit ?? 20,
      totalPages: result.totalPages ?? 0,
    };
  },
};
