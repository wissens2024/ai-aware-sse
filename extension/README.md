# AI-Aware SSE Browser Extension (MVP)

Chrome Manifest V3 확장. AI 웹앱(chatgpt.com 등)에서 **paste / submit / upload_select** 이벤트를 가로채고, Backend에 decision 요청 후 **ALLOW / WARN / BLOCK / REQUIRE_APPROVAL** 로 UI 레벨 제어.

## 빌드

```bash
pnpm install
pnpm run build
```

산출물: `dist/` 안에 `manifest.json`, `options.html`, `content.js`, `background.js`, `options.js`

## 로드 방법

1. Chrome에서 `chrome://extensions` 열기
2. "개발자 모드" 켜기
3. "압축 해제된 확장 프로그램을 로드합니다" → **`extension/dist`** 폴더 선택  
   - `dist` 안에 `manifest.json`이 있으므로 **`dist`** 폴더만 로드하면 됨

## 설정

- 확장 프로그램 카드에서 "옵션" 클릭 → **API Base URL** (`http://localhost:8080/api/v1`), **Device Token** (backend `.env`의 `EXT_DEVICE_TOKEN`과 동일, 예: `devtoken-123`) 입력 후 저장.

## 동작 요약

| 이벤트 | 훅 | 제어 |
|--------|-----|------|
| **paste** | `document.addEventListener('paste', ..., true)` | clipboard 텍스트 → decision 요청 → ALLOW면 삽입, BLOCK/WARN/REQUIRE_APPROVAL면 모달 |
| **submit** | 전송 버튼 클릭 + Enter 키 | 입력 텍스트 → decision 요청 → ALLOW면 전송, 아니면 모달 (계속 진행 / 승인 요청) |
| **upload_select** | `input[type=file]` change | 파일 메타만 전송 → BLOCK이면 선택 취소 + 모달 |

## MVP 성공 기준 (chatgpt.com)

- [x] paste 시 차단/경고 시 모달, ALLOW 시 붙여넣기
- [x] submit 시 차단/경고 시 모달, ALLOW 시 전송
- [x] upload_select 시 파일 메타 전송, 승인 요청 버튼
- [x] decision 요청 시 DB에 event/decision 기록
- [x] REQUIRE_APPROVAL 또는 BLOCK+승인요청 → case 생성 → Admin에서 승인 → (재시도 시 수동으로 다시 시도)

## 개발 흐름

1. DB up, backend up (`cd backend && pnpm run start:dev`)
2. `cd extension && pnpm run build`
3. Chrome 확장 프로그램 새로고침
4. chatgpt.com 접속 후 붙여넣기/전송/파일 선택으로 동작 확인

## 테스트 시나리오

기능별·순서별 체크 항목은 **`docs/EXTENSION_TEST_SCENARIOS.md`** 참고.
