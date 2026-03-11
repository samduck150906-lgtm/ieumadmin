import { getSupabase } from '../supabase';
import type { AreaSize, MovingType, InternetType } from '@/types/database';

// 이사 가격 (평수 × 이사형태)
export async function getDbPriceMoving() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_price_moving')
    .select('*')
    .order('area_size')
    .order('moving_type');
  if (error) throw error;
  return data || [];
}

export async function upsertDbPriceMoving(
  areaSize: AreaSize,
  movingType: MovingType,
  viewPrice: number,
  pricePerPyeong: number,
  consultationFee: number = 0,
  maxCompletionFee?: number | null | string
) {
  const supabase = getSupabase();
  const payload: Record<string, unknown> = {
    area_size: areaSize,
    moving_type: movingType,
    view_price: viewPrice,
    price_per_pyeong: pricePerPyeong,
    consultation_fee: consultationFee,
    updated_at: new Date().toISOString(),
  };
  if (maxCompletionFee !== undefined) {
    const num = Number(maxCompletionFee);
    const isEmpty =
      maxCompletionFee == null ||
      (typeof maxCompletionFee === 'string' && maxCompletionFee.trim() === '') ||
      !Number.isFinite(num) ||
      num < 0;
    payload.max_completion_fee = isEmpty ? null : num;
  }
  const { error } = await supabase
    .from('db_price_moving')
    .upsert(payload, { onConflict: 'area_size,moving_type' });
  if (error) throw error;
}

// 청소 (평수당 가격 - 단일 행)
export async function getDbPriceCleaning() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_price_cleaning')
    .select('*')
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertDbPriceCleaning(
  viewPrice: number,
  pricePerPyeong: number,
  consultationFee: number = 0,
  maxCompletionFee?: number | null | string
) {
  const supabase = getSupabase();
  const existing = await getDbPriceCleaning();
  const payload: Record<string, unknown> = {
    view_price: viewPrice,
    price_per_pyeong: pricePerPyeong,
    consultation_fee: consultationFee,
    updated_at: new Date().toISOString(),
  };
  if (maxCompletionFee !== undefined) {
    const num = Number(maxCompletionFee);
    const isEmpty =
      maxCompletionFee == null ||
      (typeof maxCompletionFee === 'string' && maxCompletionFee.trim() === '') ||
      !Number.isFinite(num) ||
      num < 0;
    payload.max_completion_fee = isEmpty ? null : num;
  }
  if (existing?.id) {
    const { error } = await supabase
      .from('db_price_cleaning')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const insertPayload: Record<string, unknown> = {
      view_price: viewPrice,
      price_per_pyeong: pricePerPyeong,
      consultation_fee: consultationFee,
    };
    if (maxCompletionFee !== undefined) {
      const num = Number(maxCompletionFee);
      const isEmpty =
        maxCompletionFee == null ||
        (typeof maxCompletionFee === 'string' && maxCompletionFee.trim() === '') ||
        !Number.isFinite(num) ||
        num < 0;
      insertPayload.max_completion_fee = isEmpty ? null : num;
    }
    const { error } = await supabase
      .from('db_price_cleaning')
      .insert(insertPayload);
    if (error) throw error;
  }
}

// 인터넷 (유형별)
export async function getDbPriceInternet() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_price_internet')
    .select('*')
    .order('internet_type');
  if (error) throw error;
  return data || [];
}

export async function upsertDbPriceInternet(
  internetType: InternetType,
  viewPrice: number,
  pricePerPyeong: number,
  consultationFee: number = 0
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('db_price_internet')
    .upsert(
      {
        internet_type: internetType,
        view_price: viewPrice,
        price_per_pyeong: pricePerPyeong,
        consultation_fee: consultationFee,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'internet_type' }
    );
  if (error) throw error;
}

// 인테리어 (단일 행)
export async function getDbPriceInterior() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_price_interior')
    .select('*')
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertDbPriceInterior(
  viewPrice: number,
  pricePerPyeong: number,
  consultationFee: number = 0,
  maxCompletionFee?: number | null | string
) {
  const supabase = getSupabase();
  const existing = await getDbPriceInterior();
  const payload: Record<string, unknown> = {
    view_price: viewPrice,
    price_per_pyeong: pricePerPyeong,
    consultation_fee: consultationFee,
    updated_at: new Date().toISOString(),
  };
  if (maxCompletionFee !== undefined) {
    const num = Number(maxCompletionFee);
    const isEmpty =
      maxCompletionFee == null ||
      (typeof maxCompletionFee === 'string' && maxCompletionFee.trim() === '') ||
      !Number.isFinite(num) ||
      num < 0;
    payload.max_completion_fee = isEmpty ? null : num;
  }
  if (existing?.id) {
    const { error } = await supabase
      .from('db_price_interior')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const insertPayload: Record<string, unknown> = {
      view_price: viewPrice,
      price_per_pyeong: pricePerPyeong,
      consultation_fee: consultationFee,
    };
    if (maxCompletionFee !== undefined) {
      const num = Number(maxCompletionFee);
      const isEmpty =
        maxCompletionFee == null ||
        (typeof maxCompletionFee === 'string' && maxCompletionFee.trim() === '') ||
        !Number.isFinite(num) ||
        num < 0;
      insertPayload.max_completion_fee = isEmpty ? null : num;
    }
    const { error } = await supabase
      .from('db_price_interior')
      .insert(insertPayload);
    if (error) throw error;
  }
}
