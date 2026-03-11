# @ieum/shared

이음(IEUM) 플랫폼 **공통 모듈** — landing-page, admin-web, mobile-app에서 단일 소스로 사용합니다.

## 목적

- **한 곳만 수정**: 타입·enum·마스킹·권한·API 스키마를 한 번 수정하면 모든 앱에 반영
- **운영 난이도 감소**: 1군데 수정하고 2군데 깨지는 상황 방지

## 포함 내용

| 영역 | 설명 |
|------|------|
| **공통 타입** | `types/database` — 테이블 타입, `UserRoleDb`, `ServiceCategory`, `HqStatus`, `PartnerStatus` 등 enum·라벨 |
| **마스킹** | `maskName`, `maskPhone`, `maskAddress`, `maskEmail`, `applyMaskingByRole` (서버 전용, CSS 숨김 금지) |
| **권한** | `UserRole`, `ROLE_PERMISSIONS`, `hasPermission(resource, action)` |
| **API contract** | Zod 스키마 — `customerApplyBodySchema`, `partnerApplyBodySchema` (검증 + 타입 추론) |
| **상수** | `CONTACT_PHONE`, `COMPANY_NAME`, `BRAND_NAME`, `DEFAULT_DOMAIN`, `DEFAULT_SITE_URL` |
| **디자인 시스템** | CSS 변수, Tailwind preset, JS 토큰 (색상·간격·타이포·모션) — 고객/중개사 랜딩·관리자 대시보드 공통 |

## 디자인 시스템 (3개 앱 통일)

단일 소스: `src/design-system/`

| 파일 | 용도 |
|------|------|
| `css-variables.css` | `:root` CSS 변수 (색상, 간격, radius, shadow, duration) |
| `tailwind.preset.js` | Tailwind theme 확장 (colors, fontFamily, fontSize, spacing, borderRadius, boxShadow, animation) |
| `index.ts` | JS/TS 토큰 (`colors`, `spacing`, `typography`, `motion`, `elevation`) |

**앱에서 사용:**

```css
/* globals.css */
@import '@ieum/shared/design-system.css';
```

```js
// tailwind.config
const ieumPreset = require('@ieum/shared/tailwind.preset.js');
module.exports = { presets: [ieumPreset], theme: { extend: { /* 앱 전용 */ } } };
```

```ts
import { colors, spacing, motion } from '@ieum/shared';
```

## 사용법

```ts
// 앱(admin-web, landing-page, mobile-app) package.json
"dependencies": {
  "@ieum/shared": "file:../packages/shared"   // npm
  // 또는 pnpm: "@ieum/shared": "workspace:*"
}
```

```ts
// 코드에서
import {
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
  maskPhone,
  hasPermission,
  type UserRole,
  customerApplyBodySchema,
  CONTACT_PHONE,
} from '@ieum/shared';
```

## 빌드

```bash
cd packages/shared && npm run build
```

산출물: `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts`

## 네이밍

- **DB 역할**: `UserRoleDb` = `'realtor' | 'partner' | 'staff'` (DB 컬럼용)
- **권한 역할**: `UserRole` = `'staff' | 'partner' | 'realtor' | 'admin'` (admin은 `staff.is_admin`으로 구분)
