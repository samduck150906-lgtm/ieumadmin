import { getSupabase } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';

export interface DbConsultation {
  id: string;
  partner_id: string | null;
  partner_name: string;
  contact_phone: string | null;
  category: string | null;
  inquiry_type: 'purchase' | 'view' | 'pricing' | 'other';
  content: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  admin_memo: string | null;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 상태 변경 이력 (누가 언제 무엇으로 변경했는지) */
export interface DbConsultationStatusHistoryEntry {
  id: string;
  db_consultation_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  memo: string | null;
}

/** 상담 목록 조회 (페이지네이션 + 필터: 날짜, 업체(검색), 상태, 카테고리) */
export async function getDbConsultations(params?: {
  search?: string;
  status?: string;
  category?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabase();
  const { search, status, category, date_from, date_to, page = 1, limit = 20 } = params || {};
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('db_consultations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq('status', status);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (date_from) {
    query = query.gte('created_at', `${date_from}T00:00:00.000Z`);
  }
  if (date_to) {
    query = query.lte('created_at', `${date_to}T23:59:59.999Z`);
  }

  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      query = query.or(
        `partner_name.ilike.%${sanitized}%,contact_phone.ilike.%${sanitized}%,content.ilike.%${sanitized}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: (data || []) as DbConsultation[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

/** 상담 건 생성 */
export async function createDbConsultation(input: {
  partner_id?: string | null;
  partner_name: string;
  contact_phone?: string;
  category?: string;
  inquiry_type?: string;
  content?: string;
  status?: string;
  admin_memo?: string;
  handled_by?: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_consultations')
    .insert({
      partner_id: input.partner_id || null,
      partner_name: input.partner_name,
      contact_phone: input.contact_phone || null,
      category: input.category || null,
      inquiry_type: input.inquiry_type || 'purchase',
      content: input.content || null,
      status: input.status || 'pending',
      admin_memo: input.admin_memo || null,
      handled_by: input.handled_by || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbConsultation;
}

/** 상담 건 수정 (상태·메모 등). 상태 변경 시 이력 자동 기록(변경자 ID 포함). */
export async function updateDbConsultation(
  id: string,
  updates: Partial<Pick<DbConsultation, 'status' | 'admin_memo' | 'handled_by' | 'content' | 'category' | 'inquiry_type'>>
) {
  const supabase = getSupabase();

  if (updates.status !== undefined) {
    const { data: current } = await supabase
      .from('db_consultations')
      .select('status')
      .eq('id', id)
      .single();

    const prevStatus = (current as { status?: string } | null)?.status;
    const { data, error } = await supabase
      .from('db_consultations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (prevStatus !== updates.status) {
      await supabase.from('db_consultation_status_history').insert({
        db_consultation_id: id,
        from_status: prevStatus ?? null,
        to_status: updates.status,
        changed_by: updates.handled_by ?? null,
      });
    }
    return data as DbConsultation;
  }

  const { data, error } = await supabase
    .from('db_consultations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as DbConsultation;
}

/** 상담 건별 상태 변경 이력 조회 (분쟁 대비) */
export async function getDbConsultationStatusHistory(dbConsultationId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_consultation_status_history')
    .select('*')
    .eq('db_consultation_id', dbConsultationId)
    .order('changed_at', { ascending: false });

  if (error) throw error;
  return (data || []) as DbConsultationStatusHistoryEntry[];
}

/** 상담 건 삭제 */
export async function deleteDbConsultation(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('db_consultations')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** 상담 통계 */
export async function getDbConsultationStats() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_consultations')
    .select('status');

  if (error) throw error;

  const rows = data || [];
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    in_progress: rows.filter((r) => r.status === 'in_progress').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };
}
