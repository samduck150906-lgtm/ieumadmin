import api from './api';
import type { Partner } from '@/types/partner';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface PartnerListParams extends PaginationParams, FilterParams {
  search?: string;
  status?: StatusType;
  tier?: string;
}

export const partnerService = {
  async getList(params: PartnerListParams): Promise<PaginatedResponse<Partner>> {
    const { data } = await api.get<PaginatedResponse<Partner>>('/api/admin/partners', {
      params: { page: params.page, limit: params.limit, search: params.search, status: params.status, tier: params.tier },
    });
    return data;
  },

  async getById(id: string): Promise<Partner> {
    const { data } = await api.get<Partner>(`/api/admin/partners/${id}`);
    return data;
  },

  async verify(id: string, approved: boolean, reason?: string): Promise<void> {
    await api.post(`/api/admin/partners/${id}/verify`, { approved, reason });
  },

  async update(id: string, body: Partial<Partner>): Promise<Partner> {
    const { data } = await api.patch<Partner>(`/api/admin/partners/${id}`, body);
    return data;
  },

  async updateStatus(id: string, status: Partner['status']): Promise<Partner> {
    const { data } = await api.patch<Partner>(`/api/admin/partners/${id}`, { status });
    return data;
  },
};
