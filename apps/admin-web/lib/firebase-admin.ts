/**
 * Firebase Admin SDK — 서버 전용 초기화
 *
 * 서비스 계정: firebase-adminsdk-fbsvc@ieum-8fd99.iam.gserviceaccount.com
 * 사용처: FCM 직접 발송, Auth 검증 등 (선택)
 *
 * 환경변수 (둘 중 하나):
 * - FIREBASE_SERVICE_ACCOUNT_KEY_PATH: 서비스 계정 JSON 파일 경로 (로컬 개발)
 * - FIREBASE_SERVICE_ACCOUNT_JSON: 서비스 계정 JSON 문자열 (Netlify 등에서 시크릿으로 설정)
 *
 * 서비스 계정 키 파일은 .gitignore에 포함하고, 저장소에 올리지 마세요.
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

let app: admin.app.App | null = null;
let hasLoggedMissingEnv = false;

function getCredential(): admin.credential.Credential | null {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (jsonString) {
    try {
      const key = JSON.parse(jsonString) as admin.ServiceAccount;
      return admin.credential.cert(key);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errStack = e instanceof Error ? e.stack : undefined;
      console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패. message:', errMsg);
      if (errStack) console.error('[firebase-admin] stack:', errStack);
      return null;
    }
  }

  if (jsonPath) {
    const resolved = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(process.cwd(), jsonPath);
    try {
      const raw = fs.readFileSync(resolved, 'utf8');
      const key = JSON.parse(raw) as admin.ServiceAccount;
      return admin.credential.cert(key);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errStack = e instanceof Error ? e.stack : undefined;
      console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY_PATH 파일 로드 실패. path:', resolved, 'message:', errMsg);
      if (errStack) console.error('[firebase-admin] stack:', errStack);
      return null;
    }
  }

  // 환경 변수 미설정 시: 에러를 던지지 않고 null 반환. 호출부에서 null 체크 필요
  if (!hasLoggedMissingEnv) {
    hasLoggedMissingEnv = true;
    console.error(
      '[firebase-admin] 환경 변수 미설정. FIREBASE_SERVICE_ACCOUNT_JSON 또는 FIREBASE_SERVICE_ACCOUNT_KEY_PATH 중 하나를 설정하세요.'
    );
  }
  return null;
}

/**
 * Firebase Admin 앱 인스턴스 (싱글톤). 환경변수 미설정 시 null.
 */
export function getFirebaseAdmin(): admin.app.App | null {
  if (app) return app;
  const credential = getCredential();
  if (!credential) return null;
  try {
    app = admin.initializeApp({
      credential,
    });
    return app;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    const errName = e instanceof Error ? e.name : undefined;
    console.error('[firebase-admin] 초기화 실패. message:', errMsg);
    if (errName) console.error('[firebase-admin] name:', errName);
    if (errStack) console.error('[firebase-admin] stack:', errStack);
    return null;
  }
}

/**
 * FCM 메시징 (푸시 직접 발송 시 사용). Admin 미초기화 시 null.
 */
export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  const a = getFirebaseAdmin();
  return a ? a.messaging() : null;
}
