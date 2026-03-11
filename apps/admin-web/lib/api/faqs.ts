import { getSupabase } from '../supabase';

export interface FaqRow {
  id: string;
  category: string | null;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export async function getFaqs(params?: { publishedOnly?: boolean; category?: string }) {
  const supabase = getSupabase();
  const { publishedOnly, category } = params || {};
  let q = supabase
    .from('faqs')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (publishedOnly) q = q.eq('is_published', true);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as FaqRow[];
}

export async function getFaqById(id: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('faqs').select('*').eq('id', id).single();
  if (error) throw error;
  return data as FaqRow;
}

export async function createFaq(payload: {
  category?: string | null;
  question: string;
  answer: string;
  sort_order?: number;
  is_published?: boolean;
}) {
  const supabase = getSupabase();
  const { error } = await supabase.from('faqs').insert({
    category: payload.category ?? null,
    question: payload.question,
    answer: payload.answer,
    sort_order: payload.sort_order ?? 0,
    is_published: payload.is_published ?? true,
  });
  if (error) throw error;
}

export async function updateFaq(
  id: string,
  payload: { category?: string | null; question?: string; answer?: string; sort_order?: number; is_published?: boolean }
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('faqs')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFaq(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from('faqs').delete().eq('id', id);
  if (error) throw error;
}

/** FAQ 일괄 상태변경 (공개/비공개) */
export async function updateFaqsBulk(ids: string[], is_published: boolean) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('faqs')
    .update({ is_published, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

/** FAQ 일괄 삭제 */
export async function deleteFaqsBulk(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('faqs').delete().in('id', ids);
  if (error) throw error;
}
