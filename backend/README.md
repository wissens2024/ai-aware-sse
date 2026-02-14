# AI-Aware SSE Backend

NestJS 기반 정책 엔진 + 관리 API 서버.

- 정책 평가 (Extension → DecisionRequest → 결정 반환)
- PII / Secrets / Code 서버 측 탐지
- Admin Console API (대시보드, 이벤트, 승인, 정책 관리)
- 감사 로그 (모든 결정·정책변경·승인 기록)

---

## 실행

```bash
pnpm install
npx prisma generate

# 개발
pnpm run start:dev

# 운영
pnpm run build
pnpm run start:prod    # node dist/main
```

- 기본 포트: `8080` (환경변수 `PORT`로 변경 가능)
- Swagger UI: `http://localhost:8080/api`
- 전역 prefix: `/api/v1`

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `8080` |
| `NODE_ENV` | `development` / `production` | `development` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | — |
| `EXT_DEVICE_TOKEN` | Extension 인증 토큰 | — |
| `CORS_ORIGINS` | 추가 CORS 허용 origin (쉼표 구분) | — |

---

## API 구조

### Extension API (`/api/v1/extension/`)

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /decision-requests` | 정책 판정 요청 (paste/submit/upload) |
| `POST /approval-cases` | 승인 케이스 생성 |
| `GET /approval-cases/:id` | 승인 상태 조회 (Extension 폴링) |

### Admin API (`/api/v1/admin/`)

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /dashboard/summary` | 대시보드 메트릭 |
| `GET /events` | 이벤트 목록 (기간 필터) |
| `GET /events/:id` | 이벤트 상세 |
| `GET /approvals` | 승인 대기 목록 |
| `POST /approvals/:id/decide` | 승인/거절 처리 |
| `GET /policies` | 정책 목록 |
| `GET /policies/:id` | 정책 상세 |
| `PUT /policies/:id` | 정책 수정 |
| `POST /policies/:id/disable` | 정책 비활성화 |
| `GET /apps`, `GET /groups`, `GET /users` | 앱/그룹/사용자 관리 |
| `GET /tenants` | 테넌트 관리 |
| `GET /audit` | 감사 로그 |

---

## 모듈 구조

```
src/
├── main.ts                 # 부트스트랩 (Swagger, CORS, Helmet, Pino)
├── app.module.ts           # 루트 모듈
├── extension/              # Extension API (decision-requests, approval-cases)
│   ├── extension.controller.ts
│   ├── extension.service.ts
│   └── dto/decision-request.dto.ts
├── admin/                  # Admin Console API
│   ├── admin.module.ts
│   ├── dashboard/          # 대시보드 메트릭
│   ├── events/             # 이벤트 조회
│   ├── approvals/          # 승인 큐
│   ├── policies/           # 정책 CRUD
│   ├── apps/               # 지원 앱(도메인) 관리
│   ├── groups/             # 그룹 관리
│   ├── users/              # 사용자 관리
│   ├── tenants/            # 테넌트 관리
│   ├── detectors/          # 탐지기 설정
│   ├── exceptions/         # 예외 관리
│   └── audit/              # 감사 로그
├── policy/                 # 정책 엔진
│   ├── policy-engine.service.ts   # 정책 평가 (scope 매칭 → 룰 실행)
│   └── policy-cache.service.ts    # tenant별 메모리 캐시 (TTL 1분)
├── detector/               # 서버 측 탐지
│   └── detector.service.ts        # PII(12종) / Secrets / Code 규칙 탐지
├── auth/                   # 인증
│   └── extension-auth.guard.ts    # Bearer EXT_DEVICE_TOKEN 검증
├── prisma/                 # DB
│   └── prisma.service.ts          # Prisma 클라이언트
└── health/                 # 헬스체크
    └── health.controller.ts
```

---

## 탐지 (Detector)

서버 측 `DetectorService`는 텍스트에서 3가지 유형을 탐지:

| 유형 | 탐지 항목 |
|------|----------|
| **PII** | 주민등록번호, 휴대전화, 일반전화, 이메일, 여권(키워드 문맥), 운전면허, 사업자등록번호, 카드번호, 계좌번호(키워드 문맥), 주소, 한글 이름(문맥 필수) |
| **Secrets** | Bearer 토큰, API key/secret, OpenAI/Anthropic 키, AWS 키, hex 키 |
| **Code** | 코드 블록, import/function/class 키워드, export/화살표함수, 괄호 밸런스 |

> 한글 이름은 레이블(`이름:`) / 호칭(`님`, `씨`) / 근처 PII 중 하나가 있어야 탐지. 상세: [루트 README](../README.md) 참조.

---

## 배포

PM2로 프로세스 관리, GitHub Actions로 자동 배포.

```bash
# 서버에서 수동 배포
pnpm install --frozen-lockfile
npx prisma generate
pnpm run build
pm2 restart sse-backend
```
