/**
 * 예약일정 변경 시 고객 알림 발송
 * - installation_date 변경 시 고객에게 알림톡 발송
 */
import { createServerClient } from './supabase-server';
import { sendNotification } from './notification-service';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';

export async function sendReservationUpdateToCustomer(
  serviceRequestId: string,
  newInstallationDate: string
): Promise<{ success: boolean }> {
  const supabase = createServerClient();
  if (!supabase) return { success: false };

  const dateStr = newInstallationDate.slice(0, 10);

  const { data: sr, error: srError } = await supabase
    .from('service_requests')
    .select(`
      id,
      category,
      customer:customers!service_requests_customer_id_fkey (id, name, phone)
    `)
    .eq('id', serviceRequestId)
    .single();

  if (srError || !sr) return { success: false };

  const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
  if (!customer?.phone) return { success: false };

  const categoryLabel = SERVICE_CATEGORY_LABELS[sr.category as string] || sr.category || '상담';

  await sendNotification({
    templateKey: 'CUSTOMER_RESERVATION_UPDATED',
    recipientPhone: customer.phone,
    recipientName: customer.name || '고객',
    variables: {
      services: categoryLabel,
      reservationDate: dateStr,
    },
    serviceRequestId,
    eventKey: `reservation:updated:${serviceRequestId}:${dateStr}`,
    recipientId: customer.id,
  });

  return { success: true };
}
