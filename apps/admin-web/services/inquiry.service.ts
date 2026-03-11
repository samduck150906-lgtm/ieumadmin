import api from './api';
import type { PaginatedResponse } from '@/types/common';

export interface Inquiry {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  category: string | null;
  subject: string | null;
  content: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  admin_memo: string | null;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export const inquiryService = {
  async getList(params: InquiryListParams): Promise<PaginatedResponse<Inquiry>> {
    const { data } = await api.get<PaginatedResponse<Inquiry>>('/api/admin/inquiries', {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        status: params.status || undefined,
        search: params.search || undefined,
      },
    });
    return data;
  },

  async updateReply(id: string, admin_memo: string, status?: string): Promise<Inquiry> {
    const { data } = await api.patch<Inquiry>(`/api/admin/inquiries/${id}`, {
      admin_memo,
      ...(status && { status }),
    });
    return data;
  },
};
