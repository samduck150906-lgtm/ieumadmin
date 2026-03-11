import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settlementService, type SettlementListParams } from '@/services/settlement.service';
import { showSuccess, showError } from '@/lib/toast';

export function useSettlementList(params: SettlementListParams) {
  return useQuery({
    queryKey: ['settlements', params],
    queryFn: () => settlementService.getList(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSettlementDetail(id: string | null) {
  return useQuery({
    queryKey: ['settlements', id],
    queryFn: () => (id ? settlementService.getById(id) : Promise.reject(new Error('No id'))),
    enabled: !!id,
  });
}

export function useSettlementProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memo }: { id: string; memo?: string }) => settlementService.process(id, memo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      showSuccess('정산 처리가 완료되었습니다.');
    },
    onError: () => showError('정산 처리에 실패했습니다.'),
  });
}
