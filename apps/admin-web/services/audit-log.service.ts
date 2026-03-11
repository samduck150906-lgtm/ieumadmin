import api from './api';
import type { AuditLog, AuditLogListParams } from '@/types/audit-log';
import type { PaginatedResponse } from '@/types/common';

export const auditLogService = {
  async getList(params: AuditLogListParams): Promise<PaginatedResponse<AuditLog>> {
    const { data } = await api.get<PaginatedResponse<AuditLog>>('/api/admin/audit-logs', {
      params: {
        page: params.page,
        limit: params.limit,
        action: params.action,
        actor_type: params.actor_type,
      },
    });
    return data;
  },
};
