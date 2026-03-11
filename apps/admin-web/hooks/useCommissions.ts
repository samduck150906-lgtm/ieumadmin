import { useQuery } from '@tanstack/react-query';
import { commissionService, type CommissionListParams } from '@/services/commission.service';

export function useCommissionList(params: CommissionListParams) {
  return useQuery({
    queryKey: ['commissions', params],
    queryFn: () => commissionService.getList(params),
    staleTime: 5 * 60 * 1000,
  });
}
