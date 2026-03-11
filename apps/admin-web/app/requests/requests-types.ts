import type { HqStatus, ServiceCategory, PartnerStatus } from '@/types/database';

export type RequestRow = {
  id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  hq_memo?: string | null;
  requested_product?: string | null;
  assigned_partner_id?: string | null;
  assigned_partner?: { business_name: string; manager_name?: string; manager_phone?: string } | null;
  partner_assignment?:
    | {
        id: string;
        status: PartnerStatus;
        created_at?: string | null;
        installation_date?: string | null;
        customer_payment_amount?: number | null;
        support_amount?: number | null;
        support_amount_promise?: string | null;
        realtor_commission_amount?: number | null;
        realtor_commission_complete_amount?: number | null;
        realtor_commission_memo?: string | null;
        partner_payment_request_amount?: number | null;
        cancel_reason?: string | null;
        cancel_reason_detail?: string | null;
      }
    | {
        id: string;
        status: PartnerStatus;
        created_at?: string | null;
        installation_date?: string | null;
        customer_payment_amount?: number | null;
        support_amount?: number | null;
        support_amount_promise?: string | null;
        realtor_commission_amount?: number | null;
        realtor_commission_complete_amount?: number | null;
        realtor_commission_memo?: string | null;
        partner_payment_request_amount?: number | null;
        cancel_reason?: string | null;
        cancel_reason_detail?: string | null;
      }[]
    | null;
  created_at?: string;
};

export type UnifiedMemo = {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  created_by_user?: { name?: string; email?: string } | null;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  moving_date?: string | null;
  moving_address?: string | null;
  current_address?: string | null;
  area_size?: string | null;
  area_pyeong_exact?: number | null;
  created_at?: string;
  source_realtor?: { business_name: string } | null;
  service_requests?: RequestRow[] | RequestRow;
};
