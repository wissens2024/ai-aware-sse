# AI-Aware SSE Extension

Chrome MV3 확장 프로그램. AI 웹 서비스에서 텍스트/파일 전송 시 정책 기반 제어.

- paste / submit / upload 이벤트 훅
- 로컬 PII 탐지 + 마스킹/익명화
- Backend 정책 판정 요청 → ALLOW / WARN / BLOCK / MASK / REQUIRE_APPROVAL UI

---

## 지원 사이트

| 사이트 | 도메인 |
|--------|--------|
| ChatGPT | `chatgpt.com` |
| Copilot | `copilot.microsoft.com` |
| Gemini | `gemini.google.com` |
| Claude | `claude.ai` |

---

## 빌드

```bash
pnpm install

# 개발 (sourcemap, 로컬 API)
pnpm run build:dev

# 운영 (minify, 운영 API)
pnpm run build:prod
```

빌드 결과: `dist/` 폴더

### Chrome 로드

1. `chrome://extensions` → "개발자 모드" 켜기
2. "압축해제된 확장 프로그램을 로드합니다" → `extension/dist` 선택

### 설정

확장 프로그램 카드 → "옵션" → API Base URL, Device Token 입력 후 저장.

### 빌드 모드별 차이

| | development | production |
|---|---|---|
| API_BASE | `http://localhost:8080/api/v1` | `https://sse.aines.kr/api/v1` |
| DEVICE_TOKEN | `devtoken-123` | (옵션 페이지에서 설정) |
| Sourcemap | O | X |
| Minify | X | O |

---

## 동작

| 이벤트 | 훅 | 제어 |
|--------|-----|------|
| **paste** | `document paste` 캡처 | 클립보드 텍스트 → 정책 판정 → ALLOW면 삽입, 아니면 모달 |
| **submit** | 전송 버튼 클릭 + Enter | 입력 텍스트 → 정책 판정 → ALLOW면 전송, 아니면 모달 |
| **upload** | `input[type=file]` change | 파일 메타 → 정책 판정 → BLOCK이면 선택 취소 + 모달 |

---

## 파일 구조

```
extension/
├── manifest.json           # Chrome MV3 매니페스트
├── build.mjs               # esbuild 빌드 스크립트
├── options.html            # 옵션 페이지 HTML
├── icons/                  # 확장 아이콘 (16/48/128)
└── src/
    ├── content.ts          # Content Script (이벤트 훅 + 탐지 + 정책 요청)
    ├── background.ts       # Service Worker
    ├── options.ts          # 옵션 페이지 (토큰 설정)
    ├── api.ts              # Backend API 통신
    ├── modal.ts            # WARN/BLOCK/APPROVAL 모달 UI
    ├── transform.ts        # PII 마스킹/익명화 (12종 패턴)
    ├── site-config.ts      # 사이트별 DOM 선택자 설정
    └── config.ts           # 환경 설정
```

---

## 마스킹

`transform.ts`에서 정책 룰에 따라 텍스트를 변환. 상세: [루트 README](../README.md) 참조.

| 유형 | 마스킹 예시 |
|------|------------|
| 이름 | `홍**` |
| 전화번호 | `010-****-5678` |
| 일반전화 | `02-****-5678` |
| 이메일 | `user@***.***` |
| 주민등록번호 | `900101-*******` |
| 운전면허 | `11-**-******-**` |
| 사업자등록번호 | `123-**-*****` |
| 카드번호 | `1234-****-****-3456` |
| 생년월일 | `1990-**-**` |
