/**
 * form_service_items 마이그레이션 적용 API (관리자 전용)
 * - POST: DATABASE_URL로 pg 연결 후 마이그레이션 SQL 실행
 * - .env.local에 DATABASE_URL 필요 (Supabase > Project Settings > Database > Connection string)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS public.form_service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📋',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS form_service_items_active_order_idx
  ON public.form_service_items (is_active, display_order)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.set_form_service_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_service_items_updated_at ON public.form_service_items;
CREATE TRIGGER form_service_items_updated_at
  BEFORE UPDATE ON public.form_service_items
  FOR EACH ROW EXECUTE FUNCTION public.set_form_service_items_updated_at();

ALTER TABLE public.form_service_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_service_items_public_read_active" ON public.form_service_items;
CREATE POLICY "form_service_items_public_read_active" ON public.form_service_items
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "form_service_items_staff_manage" ON public.form_service_items;
CREATE POLICY "form_service_items_staff_manage" ON public.form_service_items
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

INSERT INTO public.form_service_items (category_key, label, emoji, display_order, is_active)
VALUES
  ('moving', '이사', '🚛', 1, true),
  ('internet_tv', '인터넷·TV', '📡', 2, true),
  ('cleaning', '입주청소', '🧹', 3, true),
  ('interior', '인테리어', '🏠', 4, true),
  ('appliance_rental', '가전렌탈', '🔌', 5, true),
  ('water_purifier_rental', '정수기렌탈', '💧', 6, true),
  ('kiosk', '키오스크', '🖥️', 7, true)
ON CONFLICT (category_key) DO NOTHING;
`;

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    return NextResponse.json(
      {
        error: 'DATABASE_URL가 설정되지 않았습니다.',
        hint: 'admin-web/.env.local에 Supabase 대시보드 > Project Settings > Database > Connection string (URI) 추가 후 재시도하세요.',
      },
      { status: 400 }
    );
  }

  try {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(MIGRATION_SQL);
    await client.end();
    return NextResponse.json({ success: true, message: 'form_service_items 마이그레이션이 적용되었습니다.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `마이그레이션 실패: ${msg}` }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
