# AI-Aware SSE MVP: 다음 단계 → 출시 가능 MVP 작업 명세서

## 0. 목표 정의

### MVP 목표
- **브라우저 Extension**이 AI 웹앱(chatgpt.com 등)에서 사용자의 **텍스트/파일 업로드** 행동을 감지  
- → **Backend**에 decision 요청  
- → **정책/탐지** 결과에 따라 **ALLOW / WARN / BLOCK / REQUIRE_APPROVAL** 처리  
- → **이벤트/결정/승인 이력** 저장  
- → **Admin 콘솔**에서 모니터링·정책관리·승인처리 가능  

### MVP 범위 (명확)
| 영역 | 범위 |
|------|------|
| SSE 기능 | AI Web 대상 “텍스트 전송/붙여넣기/업로드” 제어 |
| 정책 | seed 정책 4종을 1:1로 동작시키는 **최소 정책 엔진** |
| 탐지 | Secrets / PII / Code **간단 규칙 기반** (서버 또는 클라) |
| 승인 | **요청 → 대기 → 승인/거절** end-to-end |

---

## 1. 시스템 전체 모듈 분해 (완성 상태)

### 1.1 Backend (NestJS) 모듈

| 모듈 | 책임 | 현재 상태 |
|------|------|-----------|
| **Auth/Tenant** | device token 기반(PoC) → JWT/OIDC 확장 가능 구조 | ✅ Extension: EXT_DEVICE_TOKEN Bearer Guard (PoC) |
| **Policy** | 정책 조회/캐시/우선순위 평가 | ✅ PolicyModule + policy-engine (scope/condition 매칭), DB 로드 |
| **Detector** | PII/Secrets/Code 규칙 기반 + 결과 표준화 | ✅ 서버 DetectorService(sample_masked 기반) + local_detectors 병합 |
| **Decision** | event 저장 → 정책 평가 → decision 저장 → 응답 | ✅ ExtensionService에서 구현 |
| **Approval** | 승인요청 생성, 승인/거절, TTL 만료 | ✅ Extension/Admin DB 연동, decide 시 상태 갱신·만료 처리 |
| **Admin API** | events/decisions/approval/policies CRUD (최소 R+U) | ✅ dashboard/events/approvals/policies Prisma 연동 |
| **Audit** | 정책 변경/승인 결정/관리자 액션 로그 | ✅ decision_created, policy_updated, policy_disabled, approval_decided |

### 1.2 Frontend (Admin) 화면

| 화면 | 책임 | 현재 상태 |
|------|------|-----------|
| **Dashboard (요약)** | 메트릭/요약 표시 | ✅ 기간 필터, 메트릭 카드, top_apps/top_detectors |
| **Events List + Event Detail** | 이벤트 목록/상세 | ✅ /events, /events/[id] |
| **Policies List + Policy Edit** | 정책 목록, enable/priority/JSON 편집 | ✅ /policies, /policies/[id] (저장/비활성화) |
| **Approvals Queue + Approval Detail/Decision** | 승인 대기 목록, 상세, 승인/거절 | ✅ /approvals, /approvals/[id] (승인/거절) |

### 1.3 Extension

| 항목 | 책임 | 현재 상태 |
|------|------|-----------|
| **Domain match** | chatgpt/copilot/gemini 시드 기반 | ✅ manifest + isTargetDomain() |
| **Event capture** | paste, submit, upload_select/upload_submit | ✅ paste(capture), submit, file change |
| **Decision request + UI** | API 호출, 모달/토스트 | ✅ requestDecision + showDecisionModal |
| **Approvals** | “승인 요청” → case 생성 → 상태 polling | ✅ createApprovalCase + 폴링 |

---

## 2. 갭 분석 요약

- **Backend**: Decision 흐름·정책 엔진·Approval·Admin API·Audit 구현됨. **서버 측 Detector** 구현됨(content_sample_masked 기반 PII/Secrets/Code 탐지 후 local_detectors와 병합). **정책 캐시** 구현됨(tenant별 메모리 캐시, TTL 1분, 정책 수정 시 무효화).
- **Frontend**: Dashboard, Events 목록/상세, Policies 목록/편집, Approvals 대기/승인·거절 화면 구현됨.
- **Extension**: paste/submit/upload_select 훅 + decision + 모달 + 승인 요청/폴링 구현됨. claude.ai 포함 시드 도메인 적용.

---

## 3. 출시 가능 MVP까지 작업 명세 (우선순위)

### Phase A: Backend 완결 (Extension/Admin이 붙을 수 있는 최소)

| # | 작업 | 상세 | 산출물 |
|---|------|------|--------|
| A1 | **Extension 인증 (PoC)** | `EXT_DEVICE_TOKEN` env로 Bearer 검증, Guard 적용 (extension/*) | AuthGuard(extension), 401 처리 |
| A2 | **Approval 실구현** | `POST /extension/approval-cases` → approval_cases insert; `GET /extension/approval-cases/:id` → DB 조회; `POST /admin/approvals/:id/decide` → status 갱신, 만료/거절 처리 | ApprovalService DB 연동 |
| A3 | **Admin API DB 연동** | dashboard/summary: events/decisions 집계; events: 목록/상세 Prisma 조회; approvals: 목록/상세; policies: 목록/단건/수정/비활성화 | Admin 서비스 전부 Prisma 사용 |
| A4 | **Audit 확장** | 정책 수정/비활성화 시 audit_trail; 승인 decide 시 audit_trail | audit_trail 호출 추가 |

### Phase B: Frontend (Admin) MVP 화면

| # | 작업 | 상세 | 산출물 |
|---|------|------|--------|
| B1 | **Dashboard** | Summary API 연동, 메트릭 카드/차트(선택), 기간 필터 | `/` 개선 |
| B2 | **Events List + Detail** | GET events 목록(테이블), 필터(from/to, decision 등); 이벤트 클릭 시 상세 페이지 | `/events`, `/events/[id]` |
| B3 | **Policies List + Edit** | GET policies 목록; 단건 수정(enable/priority/scope·condition·action JSON 편집), PUT/POST disable | `/policies`, `/policies/[id]` |
| B4 | **Approvals Queue + Decision** | GET approvals 목록(대기 우선); 상세에서 승인/거절/코멘트, POST decide | `/approvals`, `/approvals/[id]` |

### Phase C: Extension MVP

| # | 작업 | 상세 | 산출물 |
|---|------|------|--------|
| C1 | **프로젝트 구성** | Chrome MV3, TypeScript, manifest + 빌드 | `extension/` 디렉터리 |
| C2 | **Domain match** | chatgpt.com, copilot.microsoft.com, gemini.google.com 등 시드 도메인에서만 활성화 | content script / background |
| C3 | **Event capture** | paste, submit, upload_select/upload_submit 후킹, 메타+컨텐츠(길이/해시/로컬 탐지) 수집 | DecisionRequest 페이로드 생성 |
| C4 | **Decision request + UI** | POST /api/v1/extension/decision-requests, 응답에 따라 ALLOW/WARN/BLOCK/REQUIRE_APPROVAL 모달·토스트·차단 | 모달/토스트 UI |
| C5 | **Approval 플로우** | BLOCK/REQUIRE_APPROVAL 시 “승인 요청” → POST approval-cases; GET approval-cases/:id 폴링; 결과에 따라 진행/차단 | 승인 요청 → 폴링 → 반영 |

### Phase D: 탐지·정책 보강 (선택, MVP 최소 범위 내)

| # | 작업 | 상세 | 산출물 |
|---|------|------|--------|
| D1 | **서버 측 Detector (최소)** | 요청에 local_detectors 없거나 부족할 때, content_sample_masked 또는 메타만으로 PII/Secrets/Code 간단 규칙 실행, policy-engine에 반영 | DetectorService(규칙 기반) |
| D2 | **정책 캐시** | tenant별 enabled 정책 메모리 캐시, TTL 또는 정책 수정 시 무효화 | PolicyService cache 레이어 |

---

## 4. 권장 진행 순서

1. **A1 → A2 → A3 → A4**  
   Backend에서 Extension/Admin이 실제로 쓸 수 있는 API와 DB·감사까지 마무리.
2. **B1 → B2 → B3 → B4**  
   Admin 콘솔로 이벤트/정책/승인을 확인·관리 가능하게.
3. **C1 → C2 → C3 → C4 → C5**  
   Extension으로 실제 AI 사이트에서 decision 요청·승인 요청까지 E2E 동작 검증.
4. 필요 시 **D1, D2**로 탐지·정책 품질 보강.

---

## 5. 완료 기준 (출시 가능 MVP)

- [x] Extension이 시드 도메인에서 paste/submit/upload 이벤트 감지 후 decision-requests 호출
- [x] Backend가 정책(시드 4종+α)에 따라 ALLOW/WARN/BLOCK/REQUIRE_APPROVAL 반환
- [x] BLOCK/REQUIRE_APPROVAL 시 Extension에서 “승인 요청” 가능, Admin에서 승인/거절 가능
- [x] Admin에서 Events 목록·상세, Policies 목록·편집, Approvals 대기·처리 가능
- [x] 서버 측 PII/Secrets/Code 탐지: sample_masked 기반 DetectorService + local_detectors 병합 (Phase D1)
- [x] 정책 캐시: tenant별 enabled 정책 메모리 캐시, TTL 1분, 수정 시 무효화 (Phase D2)

---

## 6. 남은 구현 / 다음 단계 (선택)

| 구분 | 항목 | 비고 |
|------|------|------|
| **검증** | 시나리오별 정책 동작 테스트 | TEST_SCENARIOS.md 기반 수동/스크립트 테스트 |
| **정책·탐지** | 정책/패턴 지속 업그레이드 | 시드 정책 추가·조건 보강, PII/Code/Secrets 패턴 개선 |
| **Admin (선택)** | Detectors 설정 화면 | 탐지기 on/off·규칙 설정 UI (현재는 코드/시드 기반) |
| **Admin (선택)** | Apps(지원 도메인) 설정 | 현재 site-config/시드 기반, DB/UI로 확장 가능 |
| **보안 (선택)** | Admin 로그인(OIDC) | 현재 인증 없음, 백엔드 URL만 설정 |
| **보안 (선택)** | Extension 토큰 발급/관리 | PoC는 EXT_DEVICE_TOKEN 고정, 제품화 시 사용자별 토큰 |

이 명세서는 AI agent가 “다음 단계부터 출시 가능한 MVP”까지 작업할 때 참고하는 **단일 작업 명세서**로 사용할 수 있습니다.
