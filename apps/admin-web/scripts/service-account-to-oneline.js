#!/usr/bin/env node
/**
 * Firebase 서비스 계정 JSON → 한 줄 문자열 (Netlify 시크릿 등에 붙여넣기용)
 *
 * 사용:
 *   node scripts/service-account-to-oneline.js path/to/firebase-adminsdk-xxx.json
 *   node scripts/service-account-to-oneline.js "C:\Users\CORI\Downloads"   ← 폴더 지정 시 해당 폴더에서 서비스 계정 JSON 자동 탐색
 *   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=path/to/key.json node scripts/service-account-to-oneline.js
 *
 * 출력을 복사해 Netlify 대시보드 → Site settings → Environment variables →
 * FIREBASE_SERVICE_ACCOUNT_JSON 값으로 붙여넣으면 됩니다.
 */

const fs = require('fs');
const path = require('path');

const input = process.argv[2] || process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
if (!input) {
  const downloadsPath = 'C:\\Users\\CORI\\Downloads';
  console.error('사용: node scripts/service-account-to-oneline.js <파일경로 또는 폴더경로>');
  console.error('  예) node scripts/service-account-to-oneline.js "' + downloadsPath + '"');
  console.error('  예) node scripts/service-account-to-oneline.js "' + downloadsPath + '\\ieum-8fd99-firebase-adminsdk-xxxxx.json"');
  process.exit(1);
}

const resolved = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
if (!fs.existsSync(resolved)) {
  console.error('경로 없음:', resolved);
  process.exit(1);
}

let filePath = resolved;
const stat = fs.statSync(resolved);
if (stat.isDirectory()) {
  const files = fs.readdirSync(resolved)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(resolved, f));
  const withPrivateKey = files.filter((f) => {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const o = JSON.parse(raw);
      return o && (o.private_key || o.private_key_id) && o.client_email;
    } catch {
      return false;
    }
  });
  if (withPrivateKey.length === 0) {
    console.error('해당 폴더에서 Firebase 서비스 계정 JSON(private_key 포함)을 찾지 못했습니다:', resolved);
    process.exit(1);
  }
  filePath = withPrivateKey[0];
  console.error('사용 파일:', filePath);
}

let obj;
try {
  const raw = fs.readFileSync(filePath, 'utf8');
  obj = JSON.parse(raw);
} catch (e) {
  console.error('JSON 파싱 실패:', e.message);
  process.exit(1);
}

const oneLine = JSON.stringify(obj);
console.log(oneLine);
