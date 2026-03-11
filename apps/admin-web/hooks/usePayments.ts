import { useQuery } from '@tanstack/react-query';
import { paymentService, type PaymentListParams } from '@/services/payment.service';

export function usePaymentList(params: PaymentListParams) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: () => paymentService.getList(params),
    staleTime: 2 * 60 * 1000,
  });
}
