import { useQuery } from '@tanstack/react-query';
import { memberPartnerService } from '@/services/member-partner.service';
import type { MemberPartnerListParams } from '@/types/member-partner';

export function useMemberPartnerList(params: MemberPartnerListParams) {
  return useQuery({
    queryKey: ['member-partners', params],
    queryFn: () => memberPartnerService.getList(params),
    staleTime: 1 * 60 * 1000,
  });
}
