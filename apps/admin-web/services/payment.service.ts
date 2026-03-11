import api from './api';
import type { Payment } from '@/types/payment';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface PaymentListParams extends PaginationParams, FilterParams {
  status?: StatusType;
}

export const paymentService = {
  async getList(params: PaymentListParams): Promise<PaginatedResponse<Payment>> {
    const { data } = await api.get<PaginatedResponse<Payment>>('/api/admin/payments', { params });
    return data;
  },
};
