import api from './api';
import type { Settlement } from '@/types/settlement';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface SettlementListParams extends PaginationParams, FilterParams {
  search?: string;
  status?: StatusType;
  startDate?: string;
  endDate?: string;
}

export const settlementService = {
  async getList(params: SettlementListParams): Promise<PaginatedResponse<Settlement>> {
    const { data } = await api.get<PaginatedResponse<Settlement>>('/api/admin/settlements', {
      params: { page: params.page, limit: params.limit, status: params.status, startDate: params.startDate, endDate: params.endDate },
    });
    return data;
  },

  async getById(id: string): Promise<Settlement> {
    const { data } = await api.get<Settlement>(`/api/admin/settlements/${id}`);
    return data;
  },

  async process(id: string, memo?: string): Promise<void> {
    await api.post(`/api/admin/settlements/${id}/process`, { memo });
  },

  async cancel(id: string, reason: string): Promise<void> {
    await api.post(`/api/admin/settlements/${id}/cancel`, { reason });
  },
};
