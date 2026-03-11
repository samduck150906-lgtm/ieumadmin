import { getSupabase } from '../supabase';
import { PartnerApplication } from '@/types/database';

export async function getPartnerApplications(params?: {
  status?: 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabase();
  const { status, page = 1, limit = 20 } = params || {};
  let query = supabase
    .from('partner_applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data || []) as PartnerApplication[],
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

export async function approvePartnerApplication(
  id: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function rejectPartnerApplication(
  id: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('partner_applications')
    .update({
      status: 'rejected',
      reject_reason: reason,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
