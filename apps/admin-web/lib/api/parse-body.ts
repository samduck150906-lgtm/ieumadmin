import { NextResponse } from 'next/server';
import { z, type ZodSchema } from 'zod';

/**
 * request.json() 안전 파싱 + 선택적 zod 검증.
 * - JSON 파싱 실패 시 400
 * - schema 제공 시 검증 실패 시 400 + 메시지
 */
export async function parseJson<T = unknown>(
  request: Request
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '요청 본문이 올바른 JSON이 아닙니다.' },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: raw as T };
}

export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const parsed = await parseJson(request);
  if (!parsed.ok) return parsed;

  const result = schema.safeParse(parsed.data);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const flattened = result.error.flatten();
  const issues = result.error.issues ?? [];
  const message =
    flattened.formErrors?.[0] ||
    (issues.length > 0 ? issues.map((e: { message?: string }) => e.message ?? '').join(', ') : '') ||
    '입력값이 올바르지 않습니다.';

  return {
    ok: false,
    response: NextResponse.json(
      { error: message, details: result.error.flatten() },
      { status: 400 }
    ),
  };
}
