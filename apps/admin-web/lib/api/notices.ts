import { getSupabase } from '../supabase';

export interface NoticeRow {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getNotices(params?: { publishedOnly?: boolean; category?: string; page?: number; limit?: number }) {
  const supabase = getSupabase();
  const { publishedOnly, category, page = 1, limit = 20 } = params || {};
  let q = supabase
    .from('notices')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (publishedOnly) q = q.eq('is_published', true);
  if (category) q = q.eq('category', category);
  const from = (page - 1) * limit;
  q = q.range(from, from + limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data || []) as NoticeRow[], total: count ?? 0, page, limit };
}

export async function getNoticeById(id: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('notices').select('*').eq('id', id).single();
  if (error) throw error;
  return data as NoticeRow;
}

export async function createNotice(
  payload: { title: string; content: string; category?: string | null; is_published?: boolean },
  createdBy?: string
) {
  const supabase = getSupabase();
  const { error } = await supabase.from('notices').insert({
    title: payload.title,
    content: payload.content,
    category: payload.category ?? null,
    is_published: payload.is_published ?? true,
    created_by: createdBy ?? null,
  });
  if (error) throw error;
}

export async function updateNotice(
  id: string,
  payload: { title?: string; content?: string; category?: string | null; is_published?: boolean }
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notices')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteNotice(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from('notices').delete().eq('id', id);
  if (error) throw error;
}

/** 공지 일괄 상태변경 (공개/비공개) */
export async function updateNoticesBulk(ids: string[], is_published: boolean) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notices')
    .update({ is_published, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

/** 공지 일괄 삭제 */
export async function deleteNoticesBulk(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('notices').delete().in('id', ids);
  if (error) throw error;
}
