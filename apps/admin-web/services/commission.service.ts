import api from './api';
import type { Commission } from '@/types/commission';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface CommissionListParams extends PaginationParams, FilterParams {
  status?: StatusType;
  partnerId?: string;
}

export const commissionService = {
  async getList(params: CommissionListParams): Promise<PaginatedResponse<Commission>> {
    const { data } = await api.get<PaginatedResponse<Commission>>('/api/admin/commissions', { params });
    return data;
  },
};
