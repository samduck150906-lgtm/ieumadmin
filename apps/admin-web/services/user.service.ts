import api from './api';
import type { User, UserDetail } from '@/types/user';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface UserListParams extends PaginationParams, FilterParams {
  search?: string;
  status?: StatusType;
  role?: string;
  provider?: string;
}

export const userService = {
  async getList(params: UserListParams): Promise<PaginatedResponse<User>> {
    const { data } = await api.get<PaginatedResponse<User>>('/api/admin/users', {
      params: { page: params.page, limit: params.limit, search: params.search, status: params.status, role: params.role, provider: params.provider },
    });
    return data;
  },

  async getById(id: string): Promise<UserDetail> {
    const { data } = await api.get<UserDetail>(`/api/admin/users/${id}`);
    return data;
  },

  async update(id: string, body: Partial<User>): Promise<User> {
    const { data } = await api.patch<User>(`/api/admin/users/${id}`, body);
    return data;
  },

  async updateStatus(id: string, status: 'active' | 'suspended' | 'terminated'): Promise<{ id: string; status: string }> {
    const { data } = await api.patch<{ id: string; status: string }>(`/api/admin/users/${id}`, { status });
    return data;
  },

  async suspend(id: string, reason: string): Promise<void> {
    await api.post(`/api/admin/users/${id}/suspend`, { reason });
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/admin/users/${id}`);
  },

  async resetPassword(id: string): Promise<void> {
    await api.post(`/api/admin/users/${id}/reset-password`, {});
  },
};
