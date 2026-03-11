import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inquiryService, type InquiryListParams } from '@/services/inquiry.service';
import { showSuccess, showError } from '@/lib/toast';

export function useInquiryList(params: InquiryListParams) {
  return useQuery({
    queryKey: ['inquiries', params],
    queryFn: () => inquiryService.getList(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useInquiryReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, admin_memo, status }: { id: string; admin_memo: string; status?: string }) =>
      inquiryService.updateReply(id, admin_memo, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] });
      showSuccess('답변이 등록되었습니다.');
    },
    onError: () => showError('답변 등록에 실패했습니다.'),
  });
}
