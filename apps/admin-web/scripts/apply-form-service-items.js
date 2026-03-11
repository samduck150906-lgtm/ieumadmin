#!/usr/bin/env node
/**
 * form_service_items 마이그레이션 적용 스크립트
 * - DATABASE_URL이 있으면 pg로 직접 실행
 * - 없으면 SQL을 출력하여 Supabase SQL Editor에서 수동 실행
 *
 * DATABASE_URL: Supabase 대시보드 > Project Settings > Database > Connection string (URI)
 *   예: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
const fs = require('fs');
const path = require('path');

// .env.local에서 DATABASE_URL 로드 시도
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)$/);
      if (m) {
        return m[1].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
  return process.env.DATABASE_URL || '';
}

const DATABASE_URL = loadEnvLocal();

const SQL = `
-- form_service_items 테이블 생성
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

COMMENT ON TABLE public.form_service_items IS '폼메일 신청 서비스 항목. 관리자 UI에서 추가/삭제/순서 변경.';

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
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "form_service_items_staff_manage" ON public.form_service_items;
CREATE POLICY "form_service_items_staff_manage" ON public.form_service_items
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

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

async function run() {
  if (!DATABASE_URL) {
    console.log('DATABASE_URL이 없습니다. Supabase SQL Editor에서 아래 SQL을 실행해 주세요.\n');
    console.log('설정: Supabase 대시보드 > Project Settings > Database > Connection string (URI)');
    console.log('      .env.local에 DATABASE_URL=... 추가 후 이 스크립트를 다시 실행하면 자동 적용됩니다.\n');
    console.log('--- SQL 시작 ---');
    console.log(SQL.trim());
    console.log('--- SQL 끝 ---');
    process.exit(1);
  }

  try {
    const { Client } = require('pg');
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(SQL);
    await client.end();
    console.log('✅ form_service_items 마이그레이션이 적용되었습니다.');
  } catch (err) {
    console.error('❌ 마이그레이션 실패:', err.message);
    if (err.message.includes('EXECUTE FUNCTION')) {
      console.log('\nPostgreSQL 11 이하인 경우 EXECUTE FUNCTION을 EXECUTE PROCEDURE로 변경해 주세요.');
    }
    process.exit(1);
  }
}

run();
