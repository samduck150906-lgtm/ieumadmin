import { getSupabase } from '../supabase';
import { Staff, StaffRole } from '@/types/database';

export function roleToFlags(role: StaffRole): { is_admin: boolean; can_approve_settlement: boolean } {
  return {
    is_admin: role === 'admin',
    can_approve_settlement: role === 'admin' || role === 'accounting',
  };
}

export async function getStaffList() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select(`
      *,
      user:users!staff_user_id_fkey (
        id, email, name, phone, status, created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as (Staff & { user: { id: string; email: string | null; name: string | null; phone: string | null; status: string; created_at: string } })[];
}

export async function updateStaff(
  staffId: string,
  updates: {
    department?: string;
    position?: string;
    is_admin?: boolean;
    can_approve_settlement?: boolean;
    staff_role?: StaffRole;
  }
) {
  const supabase = getSupabase();
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  if (updates.staff_role !== undefined) {
    const flags = roleToFlags(updates.staff_role);
    payload.is_admin = flags.is_admin;
    payload.can_approve_settlement = flags.can_approve_settlement;
  }
  const { error } = await supabase.from('staff').update(payload).eq('id', staffId);
  if (error) throw error;
}
