/** @type {import('next').NextConfig} */
const path = require('path');
const fs = require('fs');
const { loadEnvConfig } = require('@next/env');
const { withSentryConfig } = require('@sentry/nextjs');

const envDir = path.resolve(__dirname);
loadEnvConfig(envDir);

// .env.local 직접 파싱 (CRLF 대응) — loadEnvConfig가 monorepo에서 누락 시 fallback
function parseEnvFile(filePath) {
  const obj = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) obj[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\r$/, '').trim();
    }
  } catch (_) {}
  return obj;
}
const envLocalPath = path.join(envDir, '.env.local');
const envLocal = parseEnvFile(envLocalPath);
const envFromFile = parseEnvFile(path.join(envDir, '.env'));
const envFallback = { ...envFromFile, ...envLocal };

// process.env에 직접 주입 (클라이언트 번들 인라인용 — next.config env만으로 부족할 수 있음)
if (envFallback.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = envFallback.NEXT_PUBLIC_SUPABASE_URL;
if (envFallback.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = envFallback.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (envFallback.NEXT_PUBLIC_SITE_URL) process.env.NEXT_PUBLIC_SITE_URL = envFallback.NEXT_PUBLIC_SITE_URL;
const { execSync } = require('child_process');
let buildSha = 'dev';
const buildTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
try {
  buildSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (_) {}

const resolvedBuildSha = process.env.NEXT_PUBLIC_BUILD_ID || process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || buildSha;
const resolvedBuildNumber = process.env.NEXT_PUBLIC_BUILD_NUMBER || process.env.BUILD_ID || 'local';
const resolvedBuildTime =
  process.env.NEXT_PUBLIC_BUILD_TIME || process.env.VERCEL_BUILD_COMPLETED_AT || buildTime;

const nextVersion = require('next/package.json').version;
const nextConfig = {
  /** 루트 lockfile 대신 admin-web 기준 트레이싱 (Next 15+만 지원, 14에서는 무시됨) */
  ...(nextVersion && nextVersion.startsWith('15') && { outputFileTracingRoot: path.join(__dirname) }),
  /** Netlify 배포 시에는 플러그인이 자체 최적화를 하므로 standalone 비활성화 (충돌 방지) */
  // output: 'standalone',
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
    ];
  },
  env: {
    // 클라이언트 번들에 필수 env 명시적 주입 (SupabaseGuard 등에서 사용)
    // envFallback 우선: loadEnvConfig가 monorepo에서 누락할 수 있어 .env.local 직접 파싱값 사용
    NEXT_PUBLIC_SUPABASE_URL: envFallback.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envFallback.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SITE_URL: envFallback.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app',
    NEXT_PUBLIC_BUILD_ID: resolvedBuildSha,
    NEXT_PUBLIC_BUILD_NUMBER: resolvedBuildNumber,
    NEXT_PUBLIC_BUILD_TIME: (() => {
      const parsed = new Date(resolvedBuildTime);
      return Number.isNaN(parsed.getTime()) ? resolvedBuildTime : parsed.toISOString().slice(0, 19).replace('T', ' ');
    })(),
    NEXT_PUBLIC_BUILD_SHA: resolvedBuildSha,
  },
  webpack: (config, { isServer }) => {
    // 클라이언트 번들에 env 강제 주입 (next.config env만으로 누락 시)
    if (!isServer) {
      const webpack = require('webpack');
      config.plugins.push(new webpack.DefinePlugin({
        'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(envFallback.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
        'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(envFallback.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
        'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(envFallback.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app'),
      }));
    }
    // Prisma/Sentry OpenTelemetry: 동적 require 경고 억제 (동작에는 영향 없음)
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@prisma\/instrumentation/ },
      { module: /require-in-the-middle/ },
      { module: /@opentelemetry\/instrumentation/ },
      { message: /Critical dependency: the request of a dependency is an expression/ },
      { message: /Critical dependency: require function is used in a way/ },
    ];
    // PackFileCacheStrategy 'Serializing big strings' 경고는 webpack 인프라 로그 레벨로 억제
    config.infrastructureLogging = {
      ...(config.infrastructureLogging || {}),
      level: 'error',
    };
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  /**
   * Sentry 빌드 플러그인 옵션
   * authToken / org / project 미설정 시 소스맵 업로드를 건너뜀 (런타임 에러 수집은 정상 동작)
   * 소스맵 업로드가 필요하면 CI에 SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT 설정
   */
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
