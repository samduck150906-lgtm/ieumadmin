import {
  getRealtors,
  getRealtorsForExport,
  updateRealtorsExcelDownloaded,
} from '@/lib/api/realtors';
import type {
  RealtorListParams,
  RealtorListResponse,
  RealtorListItem,
} from '@/types/realtor-list';

export const realtorListService = {
  async getList(params: RealtorListParams): Promise<RealtorListResponse> {
    const result = await getRealtors({
      search: params.search,
      status: params.status,
      verified: params.verified,
      excelNotDownloaded: params.excelNotDownloaded,
      inactiveDays: params.inactiveDays,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    });
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      page: result.page ?? 1,
      limit: result.limit ?? 20,
      totalPages: result.totalPages ?? 0,
    };
  },

  async getForExport(ids?: string[]): Promise<RealtorListItem[]> {
    const data = await getRealtorsForExport(ids);
    return (data ?? []) as unknown as RealtorListItem[];
  },

  async markExcelDownloaded(realtorIds: string[], userId: string): Promise<void> {
    await updateRealtorsExcelDownloaded(realtorIds, userId);
  },
};
