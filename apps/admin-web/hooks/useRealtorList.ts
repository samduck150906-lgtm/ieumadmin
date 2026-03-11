import { useQuery } from '@tanstack/react-query';
import { realtorListService } from '@/services/realtor-list.service';
import type { RealtorListParams } from '@/types/realtor-list';

export function useRealtorList(params: RealtorListParams) {
  return useQuery({
    queryKey: ['realtors', params],
    queryFn: () => realtorListService.getList(params),
    staleTime: 1 * 60 * 1000,
  });
}
