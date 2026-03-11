import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partnerService, type PartnerListParams } from '@/services/partner.service';
import { showSuccess, showError } from '@/lib/toast';

export function usePartnerList(params: PartnerListParams) {
  return useQuery({
    queryKey: ['partners', params],
    queryFn: () => partnerService.getList(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePartnerDetail(id: string | null) {
  return useQuery({
    queryKey: ['partners', id],
    queryFn: () => (id ? partnerService.getById(id) : Promise.reject(new Error('No id'))),
    enabled: !!id,
  });
}

export function usePartnerVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
      partnerService.verify(id, approved, reason),
    onSuccess: (_, { approved }) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      showSuccess(approved ? '파트너가 승인되었습니다.' : '파트너가 거부되었습니다.');
    },
    onError: () => showError('처리에 실패했습니다.'),
  });
}

const STATUS_LABELS: Record<string, string> = {
  active: '활성화',
  suspended: '정지',
  terminated: '해지',
};

export function usePartnerStatusUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' | 'terminated' }) =>
      partnerService.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['partners'] });
      showSuccess(`상태가 '${STATUS_LABELS[status] ?? status}'로 변경되었습니다.`);
    },
    onError: () => showError('상태 변경에 실패했습니다.'),
  });
}
