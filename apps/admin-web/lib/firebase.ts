import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, logEvent as fbLogEvent, type Analytics } from 'firebase/analytics';

function env(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const apiKey = env('NEXT_PUBLIC_FIREBASE_API_KEY');
const authDomain = env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
const projectId = env('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
const storageBucket = env('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
const messagingSenderId = env('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
const appId = env('NEXT_PUBLIC_FIREBASE_APP_ID');
const measurementId = env('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID');

const hasRequiredConfig = Boolean(apiKey && projectId);

const app: FirebaseApp | null = hasRequiredConfig
  ? initializeApp({
      apiKey,
      authDomain: authDomain ?? undefined,
      projectId,
      storageBucket: storageBucket ?? undefined,
      messagingSenderId: messagingSenderId ?? undefined,
      appId: appId ?? undefined,
      measurementId: measurementId ?? undefined,
    })
  : null;

/** 브라우저에서만 Analytics 인스턴스 반환 (SSR 시 또는 미설정 시 undefined) */
export function getFirebaseAnalytics(): Analytics | undefined {
  if (typeof window === 'undefined' || !app) return undefined;
  return getAnalytics(app);
}

/** Firebase Analytics 이벤트 로깅 (환경변수 미설정 시 무시) */
export function logAnalyticsEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  const analytics = getFirebaseAnalytics();
  if (!analytics) return;
  fbLogEvent(analytics, eventName, params);
}

export { app };
export default app;
