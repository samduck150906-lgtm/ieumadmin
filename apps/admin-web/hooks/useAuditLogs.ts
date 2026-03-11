import { useQuery } from '@tanstack/react-query';
import { auditLogService } from '@/services/audit-log.service';
import type { AuditLogListParams } from '@/types/audit-log';

export function useAuditLogList(params: AuditLogListParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditLogService.getList(params),
    staleTime: 1 * 60 * 1000,
  });
}
