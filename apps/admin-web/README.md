# 이음 (IEUM) - 관리자 웹

이사 서비스 연결 플랫폼 관리자 웹 애플리케이션

## 기술 스택

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- exceljs (엑셀 다운로드·템플릿·대량 등록 파싱)
- qrcode (QR코드 생성)
- react-hot-toast (알림)

## 시작하기

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 Supabase 키 입력

# 개발 서버 실행
npm run dev
```

http://localhost:3000 에서 확인

## 주요 기능

- 대시보드 (통계, 실시간 알림)
- 서비스 요청 관리 (배정, 상태 변경)
- 공인중개사 관리
- 제휴업체 관리
- 정산/출금 관리
- QR코드 생성
- 엑셀 다운로드
- 알림톡/SMS 발송

## 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel
```

## 폴더 구조

```
admin-web/
├── app/              # 페이지 및 라우팅
├── components/       # UI 컴포넌트
├── lib/              # 유틸리티 및 API
└── types/            # TypeScript 타입
```
