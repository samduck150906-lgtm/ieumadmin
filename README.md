# 이음 관리자웹 (ieumadmin)

IEUM-3 프로젝트의 관리자웹 전용 복사본입니다.

## 구조

- `apps/admin-web` — Next.js 관리자 앱
- `packages/shared` — 공통 패키지 (@ieum/shared)

## .env 파일

루트 및 apps/admin-web에 .env 관련 파일이 포함되어 있습니다.

- `.env` — 루트 환경변수
- `.env.local` — admin-web 로컬 환경변수 (apps/admin-web/)
- `.env.example` — admin-web 예시 (apps/admin-web/)
- `.env.netlify` — Netlify 배포용
- `.env.e2e`, `.env.test` — 테스트용

## 실행

```bash
npm install
npm run build
npm run dev
```

개발 서버: http://localhost:3000
