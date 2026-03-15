# 인증 체계 설계서

## 1. 현재 상태 (AS-IS)

### 문제점
| 영역 | 현재 | 문제 |
|------|------|------|
| Extension 인증 | `EXT_DEVICE_TOKEN` 고정 토큰 비교 | 사용자 식별 불가, 토큰 하나로 모든 사용자 공유 |
| 사용자 식별 | Options 페이지에서 수동 입력 (이메일/그룹) | 위조 가능, 보안 의미 없음 |
| Admin Console 인증 | 없음 (완전 개방) | 누구나 관리 기능 접근 가능 |
| 비밀번호 | users 테이블에 password 필드 없음 | 자체 인증 불가 |

### 현재 인증 흐름
```
Extension → Bearer devtoken-123 → Backend (토큰 문자열 비교)
Admin Console → 인증 없음 → Backend (완전 개방)
```

---

## 2. 목표 상태 (TO-BE)

### 인증 흐름
```
[Extension / Admin Console]
        │
        ▼
  Backend /auth/login (local)  ←── Phase 2
        │  또는
  Backend /auth/sso/* (OIDC)   ←── Phase 3
        │
        ▼
  JWT 발급 (access + refresh)
        │
        ▼
  이후 모든 API: Authorization: Bearer <JWT>
        │
        ▼
  Backend: JWT 검증 → 사용자/그룹/역할 식별
```

### Phase 구분

| Phase | 내용 | GS인증 대상 | 구현 순서 |
|-------|------|:-----------:|:---------:|
| **Phase 1** | JWT 발급/검증 공통 모듈 | ✅ | 1st |
| **Phase 2** | Local 로그인 (이메일+비밀번호) | ✅ | 2nd |
| **Phase 3** | OIDC/SSO 연동 | ✅ | 3rd |
| **Phase 4** | Extension 로그인 UI | ❌ (기능 테스트 제외) | 4th |

---

## 3. GS인증 범위 구분

### GS인증 시험 대상 기능
```
1. AI 서비스 데이터 유출 탐지 (Extension → Backend 정책 평가)
2. 정책 기반 차단/경고/마스킹/승인 요청
3. 관리 콘솔 (이벤트 조회, 정책 관리, 승인 처리, 감사 로그)
4. 사용자/그룹 관리
5. ★ 사용자 인증 - Local 로그인 (Phase 2)
6. ★ 사용자 인증 - SSO/OIDC 연동 (Phase 3)
```

### GS인증 시험 제외 (구현은 완료)
```
- Extension 로그인 UI (Phase 4) → 고객 요구 시 활성화
- LDAP 연동 → 향후 확장
```

### GS인증 시 제출 문서
```
- 설치 가이드 (서버 설치, Extension 설치)
- 운영 가이드 (정책 설정, 사용자 관리, SSO 연동 설정)
- 사용자 가이드 (Extension 사용법, 승인 요청 방법)
- 시험 환경 구성서 (테스트용 서버 + 브라우저 환경)
```

---

## 4. 기술 설계

### 4.1 Phase 1 — JWT 공통 모듈

#### Backend 패키지 추가
```
@nestjs/jwt          # JWT 발급/검증
bcrypt / @types/bcrypt  # 비밀번호 해싱
```

#### JWT 토큰 구조

**Access Token** (만료: 15분)
```json
{
  "sub": "user_id (UUID)",
  "email": "user@example.com",
  "display_name": "홍길동",
  "groups": ["보안팀", "개발팀"],
  "tenant_id": "tenant UUID",
  "role": "admin | user",
  "auth_method": "local | oidc",
  "iat": 1710000000,
  "exp": 1710000900
}
```

**Refresh Token** (만료: 7일)
```json
{
  "sub": "user_id (UUID)",
  "tenant_id": "tenant UUID",
  "type": "refresh",
  "iat": 1710000000,
  "exp": 1710604800
}
```

#### JWT 서명
- 알고리즘: HS256 (HMAC-SHA256)
- 비밀키: 환경변수 `JWT_SECRET`
- 향후 RS256 전환 가능 (SSO JWKS 연동 시)

#### 환경변수 추가
```env
JWT_SECRET=<랜덤 256비트 이상 문자열>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

#### 모듈 구조
```
backend/src/auth/
├── auth.module.ts          # JWT 모듈 등록, AuthService/Guard export
├── auth.service.ts         # 로그인 검증, JWT 발급, 토큰 갱신
├── auth.controller.ts      # /auth/login, /auth/refresh, /auth/me
├── jwt-auth.guard.ts       # JWT 검증 Guard (Extension + Admin 공통)
├── jwt.strategy.ts         # Passport JWT Strategy (선택)
├── extension-auth.guard.ts # 기존 유지 (하위호환), JWT 우선 → fallback 고정토큰
└── dto/
    ├── login.dto.ts        # { email, password }
    ├── refresh.dto.ts      # { refresh_token }
    └── auth-response.dto.ts # { access_token, refresh_token, user }
```

### 4.2 Phase 2 — Local 로그인

#### DB 변경 (Prisma)
```prisma
model users {
  // 기존 필드 유지
  password_hash String?   @db.VarChar(255)  // BCrypt, SSO 전용 사용자는 null
  role          String    @default("user") @db.VarChar(20)  // "admin" | "user"
  last_login_at DateTime? @db.Timestamptz(6)
}
```

#### API 엔드포인트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/v1/auth/login` | 이메일+비밀번호 → JWT 발급 | 없음 |
| POST | `/api/v1/auth/refresh` | refresh_token → 새 access_token | 없음 (refresh_token 검증) |
| GET | `/api/v1/auth/me` | 현재 사용자 정보 | Bearer JWT |
| POST | `/api/v1/auth/logout` | refresh_token 무효화 | Bearer JWT |
| PATCH | `/api/v1/auth/password` | 비밀번호 변경 | Bearer JWT |

#### 로그인 흐름
```
POST /auth/login { email, password }
  → BCrypt 비교
  → 성공: { access_token, refresh_token, user: { email, display_name, groups, role } }
  → 실패: 401 { code: "AUTH_INVALID_CREDENTIALS" }
  → 5회 실패: 계정 잠금 30분 (향후)
```

#### Guard 전환 전략
```
Phase 2 완료 시:
- Extension 엔드포인트: JWT 우선 검증, fallback으로 기존 EXT_DEVICE_TOKEN 허용 (하위호환)
- Admin 엔드포인트: JWT 필수 (@UseGuards(JwtAuthGuard))

Phase 4 완료 후:
- Extension도 JWT 필수로 전환
- EXT_DEVICE_TOKEN fallback 제거
```

### 4.3 Phase 3 — OIDC/SSO 연동

#### Backend 역할
- Backend가 **OIDC Relying Party (Client)** 역할
- Extension/Admin Console은 SSO를 직접 모름
- Backend가 인증 후 **자체 JWT 발급** (SSO 토큰을 그대로 전달하지 않음)

#### 환경변수
```env
AUTH_MODE=local              # "local" | "oidc" | "both"
OIDC_ISSUER=https://sso.aines.kr
OIDC_CLIENT_ID=ai-aware-sse
OIDC_CLIENT_SECRET=<secret>
OIDC_REDIRECT_URI=https://sse.aines.kr/api/v1/auth/sso/callback
OIDC_SCOPES=openid,profile,email
```

#### API 엔드포인트 추가

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/auth/sso/authorize` | OIDC authorize URL 생성 → 302 리다이렉트 |
| GET | `/api/v1/auth/sso/callback` | authorization_code → 토큰 교환 → 자체 JWT 발급 |
| GET | `/api/v1/auth/sso/config` | SSO 활성화 여부/로그인 URL (프론트엔드용) |

#### OIDC 흐름
```
1. 클라이언트 → GET /auth/sso/authorize?redirect_after=/dashboard
2. Backend → PKCE 생성 (code_verifier, code_challenge)
3. Backend → 302 Redirect: sso.aines.kr/oauth2/authorize
     ?client_id=ai-aware-sse
     &redirect_uri=https://sse.aines.kr/api/v1/auth/sso/callback
     &response_type=code
     &scope=openid profile email
     &code_challenge=xxx
     &code_challenge_method=S256
     &state=encrypted(redirect_after + nonce)
4. 사용자 → SSO에서 로그인
5. SSO → 302 Redirect: /api/v1/auth/sso/callback?code=xxx&state=xxx
6. Backend → POST sso.aines.kr/oauth2/token (code + code_verifier)
7. Backend → SSO access_token으로 /oauth2/userinfo 호출
8. Backend → users 테이블에서 조회 또는 자동 생성 (email 기준)
9. Backend → 자체 JWT 발급
10. Backend → 302 Redirect: /dashboard (JWT를 쿠키 또는 fragment로 전달)
```

#### 사용자 자동 등록 (JIT Provisioning)
```
SSO 로그인 성공 시 users 테이블에 해당 email이 없으면:
- 자동 생성 (display_name, email, external_id 매핑)
- password_hash = null (SSO 사용자는 비밀번호 없음)
- 기본 그룹 자동 배정 (설정 가능)
```

#### 모듈 구조 추가
```
backend/src/auth/
├── ...기존 파일...
├── oidc.service.ts         # OIDC 토큰 교환, userinfo 호출
├── oidc.controller.ts      # /auth/sso/authorize, /auth/sso/callback
└── dto/
    └── oidc-state.dto.ts   # state 파라미터 구조
```

### 4.4 Phase 4 — Extension 로그인 UI

#### 현재 Options 페이지 → 로그인 페이지로 전환

```
Extension 로드 시:
  JWT 없음 → 로그인 필요 알림 표시 (content script에서 배너)
  ↓
  사용자가 Extension 아이콘 클릭 → popup.html (로그인 폼)
  ↓
  AUTH_MODE에 따라:
  - local: 이메일/비밀번호 입력 → POST /auth/login
  - oidc: "SSO로 로그인" 버튼 → chrome.identity.launchWebAuthFlow()
  - both: 두 옵션 모두 표시
  ↓
  JWT 수신 → chrome.storage.local 저장
  ↓
  이후 API 호출에 자동 사용
```

#### 파일 구조 변경
```
extension/
├── popup.html              # 로그인 UI (새로 추가)
├── src/
│   ├── popup.ts            # 로그인 로직 (새로 추가)
│   ├── auth-manager.ts     # JWT 저장/갱신/만료 체크 (새로 추가)
│   ├── api.ts              # authHeaders()에서 auth-manager 사용
│   ├── config.ts           # deviceToken 관련 제거, JWT 기반으로 전환
│   └── content.ts          # JWT 없으면 로그인 안내 배너 표시
├── options.html            # 고급 설정만 남김 (API Base URL 등)
└── manifest.json           # + "identity" permission, popup 등록
```

#### 토큰 갱신 전략
```
background.ts (Service Worker):
  - 5분마다 access_token 만료 확인
  - 만료 3분 전 자동 갱신 (POST /auth/refresh)
  - refresh_token도 만료 시 → 로그인 필요 상태로 전환
  - 갱신 실패 시 → 로그인 필요 알림
```

---

## 5. DB 마이그레이션 계획

### Phase 1-2 마이그레이션
```sql
-- users 테이블에 인증 필드 추가
ALTER TABLE sse.users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE sse.users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE sse.users ADD COLUMN last_login_at TIMESTAMPTZ;

-- 초기 관리자 계정 생성 (비밀번호: 별도 설정)
-- seed 스크립트에서 처리
```

### Phase 3 마이그레이션
```sql
-- SSO 연동 정보 (users.external_id 이미 존재)
-- OIDC 세션/상태 저장용 테이블 (선택)
CREATE TABLE sse.auth_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES sse.users(user_id),
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_auth_sessions_user ON sse.auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires ON sse.auth_sessions(expires_at);
```

---

## 6. 보안 고려사항

| 항목 | 설계 |
|------|------|
| 비밀번호 저장 | BCrypt (cost factor 12) |
| JWT 비밀키 | 환경변수, 최소 256비트 |
| Refresh Token | DB 저장 (해시), 1회용 rotation |
| PKCE | OIDC 흐름에서 필수 적용 |
| CORS | JWT 인증으로 전환 후에도 기존 정책 유지 |
| Rate Limiting | 로그인 엔드포인트 분당 10회 제한 (향후) |
| XSS 방어 | JWT는 httpOnly 쿠키 또는 chrome.storage.local (Extension) |

---

## 7. 하위 호환성

Phase별 전환 기간 동안의 호환성:

| Phase | Extension (기존) | Extension (신규) | Admin Console |
|-------|:----------------:|:----------------:|:-------------:|
| Phase 2 완료 | ✅ EXT_DEVICE_TOKEN 유지 | ✅ JWT 사용 가능 | ✅ JWT 필수 |
| Phase 3 완료 | ✅ EXT_DEVICE_TOKEN 유지 | ✅ JWT (local/SSO) | ✅ JWT (local/SSO) |
| Phase 4 완료 | ⚠️ 지원 중단 예정 | ✅ 로그인 UI 제공 | ✅ JWT (local/SSO) |
| Phase 4+1개월 | ❌ EXT_DEVICE_TOKEN 제거 | ✅ JWT 필수 | ✅ JWT 필수 |
