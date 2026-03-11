import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';

/**
 * 앱 버전·강제 업데이트 여부 (모바일 앱에서 GET /api/app-version 호출)
 * 환경변수: APP_LATEST_VERSION, APP_FORCE_UPDATE(true/false)
 */
async function getHandler(_request: Request) {
  const version =
    process.env.APP_LATEST_VERSION ??
    process.env.NEXT_PUBLIC_APP_LATEST_VERSION ??
    '1.0.0';
  const forceUpdate =
    process.env.APP_FORCE_UPDATE === 'true' ||
    process.env.NEXT_PUBLIC_APP_FORCE_UPDATE === 'true';

  return NextResponse.json({
    version: version.trim(),
    force_update: forceUpdate,
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request));
