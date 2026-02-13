# AI-Aware SSE 테스트 시나리오 및 샘플값

## 사전 준비

- **Backend**: `http://localhost:8080` 기동, DB 시드 적용(`initdb/03_seed.sql`)
- **Extension**: 빌드 후 Chrome에 로드, API Base = `http://localhost:8080/api/v1`, Device Token = `devtoken-123`(또는 `.env`의 `EXT_DEVICE_TOKEN`과 동일)
- **Admin**: `http://localhost:3000` 기동, Backend URL 설정

---

## 시나리오별 기대 정책 (체크리스트)

테스트 시 아래 표를 기준으로 **해당 시나리오에서 어떤 정책이 매칭되어 어떤 outcome이 나와야 하는지** 확인할 수 있다.

| 시나리오 | 이벤트/조건 | actor 그룹 | 기대 매칭 정책 | 기대 outcome |
|----------|-------------|------------|----------------|--------------|
| 1.2 | SUBMIT, 일반 텍스트, 탐지 없음 | AllEmployees | (없음) | ALLOW |
| 1.3 | PASTE, Secrets 탐지(예: sk-xxx) | AllEmployees | Block Secrets on AI Text | BLOCK |
| 1.4 | SUBMIT, PII 3건 이상 | AllEmployees | Block High PII on AI Text | BLOCK |
| 1.5 | UPLOAD_SELECT, 파일 ext=csv/xlsx | **Finance** | Finance Require Approval for CSV/XLSX Upload | REQUIRE_APPROVAL |
| (추가) | PASTE, CODE 탐지 + 길이≥1500 | **Dev** | Dev Warn Large Code Paste | WARN |
| (추가) | UPLOAD_SELECT, 파일 ext=js/ts/py 등 | **Dev** | Dev Warn Code File Upload | WARN |

**참고**: 그룹이 맞아야 해당 정책이 매칭된다. **Options에 아무것도 넣지 않으면** 확장 기본값은 그룹 **Dev**, 이메일 **alice@example.com** 이다 (테스트 편의). Options에서 그룹/이메일을 바꾸면 해당 값이 사용된다.

**스크립트 실행**: `docs/run-decision-scenarios.sh`로 1.1~1.5 요청을 한 번에 호출할 수 있다. (Git Bash/WSL: `BASE_URL=http://localhost:8080/api/v1 TOKEN=devtoken-123 ./docs/run-decision-scenarios.sh`)

---

## 1. Extension → Backend API

### 1.1 Ping (연결 확인)

**요청**
```http
GET /api/v1/extension/ping
Authorization: Bearer devtoken-123
```

**예상 응답 (200)**
```json
{
  "ok": true,
  "server_time": "2025-02-06T12:00:00.000Z",
  "version": "0.1.0"
}
```

---

### 1.2 Decision Request – ALLOW (일반 텍스트)

**시나리오**: 사용자가 ChatGPT/Claude 등에서 일반 문장만 입력 후 전송. 탐지 결과 없음 → ALLOW.

**요청**
```http
POST /api/v1/extension/decision-requests
Authorization: Bearer devtoken-123
Content-Type: application/json
```

**샘플 Body**
```json
{
  "trace_id": "tr-allow-001",
  "event": {
    "type": "SUBMIT",
    "occurred_at": "2025-02-06T12:00:00.000Z",
    "app": { "domain": "chatgpt.com", "url": "https://chatgpt.com/" },
    "page_context": { "submit_kind": "text" }
  },
  "actor": {
    "user_hint": { "groups": ["AllEmployees"], "email": "user@example.com" },
    "device": { "browser": "Chrome", "extension_version": "0.1.0" }
  },
  "content": {
    "kind": "TEXT",
    "length": 24,
    "local_detectors": [],
    "sample_masked": "오늘 날씨가 좋네요."
  },
  "schema_version": 1
}
```

**예상 응답 (201)**  
- `outcome`: `"ALLOW"`  
- `matched_policy`: `null`  
- `detector_hits`: `[]` 또는 서버 탐지 결과만(정책 미매칭)

**확인**
- Admin → Events: 해당 `trace_id` / event_type=SUBMIT 인 이벤트 생성
- Admin → Events → 상세: decision outcome = ALLOW

---

### 1.3 Decision Request – BLOCK (Secrets 탐지)

**시나리오**: 비밀키/토큰이 포함된 텍스트 전송. 시드 정책 "Block Secrets on AI Text"(SECRETS count >= 1) 매칭 → BLOCK.

**요청**  
동일 엔드포인트, 아래 Body 사용.

**샘플 Body**
```json
{
  "trace_id": "tr-block-secrets-001",
  "event": {
    "type": "PASTE",
    "occurred_at": "2025-02-06T12:01:00.000Z",
    "app": { "domain": "claude.ai", "url": "https://claude.ai/" }
  },
  "actor": {
    "user_hint": { "groups": ["AllEmployees"] },
    "device": {}
  },
  "content": {
    "kind": "TEXT",
    "length": 80,
    "local_detectors": [{ "type": "SECRETS", "count": 1, "confidence": 80 }],
    "sample_masked": "API key is sk-abc123xyz. Use it in header."
  },
  "schema_version": 1
}
```

**참고**: 시드 정책의 `detector`는 `"SECRETS"`(대문자). 서버 측 Detector는 `"Secrets"`를 반환할 수 있으므로, 정책 매칭을 위해 확장/서버에서 타입을 `SECRETS`로 통일하거나 정책 조건을 소문자로 두는 편이 좋다. 위 샘플은 `local_detectors`에 `SECRETS`를 넣어 정책 매칭이 되도록 한 경우.

**예상 응답 (201)**  
- `outcome`: `"BLOCK"`  
- `matched_policy.name`: `"Block Secrets on AI Text"`  
- `action.message`: 비밀키/토큰 관련 메시지  
- `action.allow_approval_request`: `true`

**확인**
- Admin → Events: PASTE 이벤트, decision = BLOCK
- 확장: BLOCK 모달 + "승인 요청" 버튼 노출

---

### 1.4 Decision Request – BLOCK (PII 다량)

**시나리오**: 개인정보(PII) 다량 포함. 시드 정책 "Block High PII on AI Text"(PII count >= 3) 매칭 → BLOCK.

**샘플 Body**
```json
{
  "trace_id": "tr-block-pii-001",
  "event": {
    "type": "SUBMIT",
    "occurred_at": "2025-02-06T12:02:00.000Z",
    "app": { "domain": "chatgpt.com", "url": "https://chatgpt.com/" },
    "page_context": { "submit_kind": "text" }
  },
  "actor": {
    "user_hint": { "groups": ["AllEmployees"] },
    "device": {}
  },
  "content": {
    "kind": "TEXT",
    "length": 200,
    "local_detectors": [{ "type": "PII", "count": 3, "confidence": 90 }],
    "sample_masked": "홍길동 010-1234-5678, kim@example.com, 900101-1234567"
  },
  "schema_version": 1
}
```

**예상 응답 (201)**  
- `outcome`: `"BLOCK"`  
- `matched_policy.name`: `"Block High PII on AI Text"`

---

### 1.5 Decision Request – UPLOAD_SELECT (파일 메타)

**테스트 목적**: PII/Secrets가 아닌 **파일 업로드 이벤트(UPLOAD_SELECT) + 그룹·확장자 정책** 동작 검증. 사용자 그룹(Finance)과 파일 확장자(csv) 조건으로 REQUIRE_APPROVAL이 내려오는지 확인.

**시나리오**: CSV 파일 선택. 시드 정책 "Finance Require Approval for CSV/XLSX Upload"(Finance 그룹 + ext csv) → REQUIRE_APPROVAL.

**샘플 Body**
```json
{
  "trace_id": "tr-upload-csv-001",
  "event": {
    "type": "UPLOAD_SELECT",
    "occurred_at": "2025-02-06T12:03:00.000Z",
    "app": { "domain": "chatgpt.com", "url": "https://chatgpt.com/" }
  },
  "actor": {
    "user_hint": { "groups": ["Finance"] },
    "device": {}
  },
  "content": {
    "kind": "FILE_META",
    "length": 0,
    "local_detectors": []
  },
  "file": {
    "name": "sales_2025.csv",
    "size_bytes": 4096,
    "mime": "text/csv",
    "ext": "csv"
  },
  "schema_version": 1
}
```

**예상 응답 (201)**  
- `outcome`: `"REQUIRE_APPROVAL"`  
- `matched_policy.name`: `"Finance Require Approval for CSV/XLSX Upload"`

---

### 1.6 Approval Case 생성 및 상태 조회

**시나리오**: BLOCK/REQUIRE_APPROVAL 후 사용자가 "승인 요청" 클릭 → case 생성 → 폴링으로 상태 확인.

**1) Case 생성**
```http
POST /api/v1/extension/approval-cases
Authorization: Bearer devtoken-123
Content-Type: application/json
```
```json
{
  "event_id": "<위 decision 응답의 event_id>",
  "decision_id": "<위 decision 응답의 decision_id>",
  "request_reason": "업무상 필요",
  "requested_at": "2025-02-06T12:05:00.000Z",
  "requested_by_email": "user@example.com"
}
```

**예상 응답 (201)**  
- `case_id`: UUID  
- `status`: `"PENDING"`  
- `expires_at`: ISO 8601 (예: 2시간 후)

**2) 상태 조회**
```http
GET /api/v1/extension/approval-cases/:case_id
Authorization: Bearer devtoken-123
```

**예상 (대기 중)**  
- `status`: `"PENDING"`  
- `decision`: `null`

**Admin에서 승인 후 재조회**  
- `status`: `"APPROVED"`  
- `decision.type`: `"APPROVE"`

---

## 2. Admin 콘솔

### 2.1 Dashboard

- **URL**: `http://localhost:3000`
- **확인**: 기간 필터, 이벤트/차단/승인 대기 메트릭, top_apps / top_detectors 등 표시. 위에서 발생시킨 이벤트가 반영되는지 확인.

### 2.2 Events 목록·상세

- **목록**: Events 메뉴에서 최근 이벤트 목록( trace_id, event_type, domain, outcome, 시간 등) 확인.
- **상세**: 이벤트 클릭 시 메타데이터, 결정( outcome, matched_policy, detector_hits ), 설명( explanation ) 확인.
- **샘플 검증**: `tr-allow-001`, `tr-block-secrets-001`, `tr-block-pii-001`, `tr-upload-csv-001` trace_id로 필터/검색하여 위 시나리오와 일치하는지 확인.

### 2.3 Policies 목록·편집·비활성화

- **목록**: 시드 정책 4종 표시(Block Secrets, Block High PII, Dev Warn Large Code, Finance Require Approval for CSV/XLSX).
- **편집**: 정책 선택 → enable/priority/scope·condition·action 수정 → 저장. **정책 캐시**: 수정 후 동일 tenant로 decision 요청 시 캐시 무효화되어 새 정책이 반영되는지 확인.
- **비활성화**: 정책 비활성화 후 decision 요청 시 해당 정책이 매칭되지 않는지 확인.

### 2.4 Approvals 대기·승인/거절

- **대기 목록**: Approval Case 생성된 건이 "대기" 상태로 표시.
- **승인**: 케이스 선택 → 승인 → 코멘트(선택) 저장. Extension 폴링 시 `APPROVED` 수신.
- **거절**: 케이스 선택 → 거절 → 저장. Extension에서 계속 차단 유지.

---

## 3. 서버 측 Detector + 정책 캐시

### 3.1 서버 탐지 반영

- **조건**: `content.sample_masked`에 PII/Secrets/Code 패턴 포함.
- **예**: `sample_masked`에 이메일·휴대폰 번호 여러 개 → 서버 Detector가 PII hit → 로컬 `local_detectors`와 병합 후 정책 평가.
- **확인**: `local_detectors`를 빈 배열로 보내도, `sample_masked`만으로 PII/Secrets가 탐지되면 해당 정책(BLOCK 등)이 매칭될 수 있음. 응답의 `detector_hits`에 서버에서 추가된 타입이 포함되는지 확인.

### 3.2 정책 캐시 무효화

- **동작**: Admin에서 정책 수정 또는 비활성화 시 해당 tenant 캐시 무효화.
- **검증**: 1) decision 요청으로 캐시 warm-up. 2) Admin에서 정책 비활성화 또는 조건 변경. 3) 같은 tenant로 다시 decision 요청 → DB에서 다시 조회한 정책이 적용되는지(비활성화 반영, 변경된 조건 반영) 확인.

---

## 4. Extension E2E (실제 사이트)

| 순서 | 사이트 | 동작 | 기대 결과 |
|------|--------|------|-----------|
| 1 | chatgpt.com 또는 claude.ai | 페이지 로드 | 콘솔에 `[AI-Aware SSE] Content script 로드됨`, 약 1.5초 후 `[AI-Aware SSE] DOM 검증 결과` 1회 출력 |
| 2 | 동일 | 입력창에 일반 문장 입력 후 전송(버튼 또는 Enter) | ALLOW, 메시지 전송됨. Admin Events에 SUBMIT 이벤트 기록 |
| 3 | 동일 | 비밀키 유사 텍스트(예: `api_key=sk-xxx`) 붙여넣기 또는 전송 | BLOCK 모달, "승인 요청" 버튼 노출. Admin에 PASTE/SUBMIT + BLOCK 기록 |
| 4 | 동일 | BLOCK 후 "승인 요청" 클릭 | 승인 케이스 생성, Extension에서 폴링. Admin Approvals에 대기 건 표시 |
| 5 | Admin | Approvals에서 해당 건 승인 | Extension 폴링 시 APPROVED 수신, 사용자가 재전송 가능 |
| 6 | 동일 | 파일 첨부(CSV/PDF 등) 후 전송 | UPLOAD_SELECT 및 SUBMIT 이벤트 Admin에 기록. 정책에 따라 ALLOW/REQUIRE_APPROVAL 등 |

---

## 5. 샘플값 요약표

| 용도 | trace_id | event.type | content.kind | local_detectors | sample_masked / file | 기대 outcome |
|------|-----------|------------|--------------|-----------------|------------------------|--------------|
| ALLOW | tr-allow-001 | SUBMIT | TEXT | [] | "오늘 날씨가 좋네요." | ALLOW |
| BLOCK (Secrets) | tr-block-secrets-001 | PASTE | TEXT | [{ "type": "SECRETS", "count": 1 }] | "API key is sk-abc123xyz" | BLOCK |
| BLOCK (PII) | tr-block-pii-001 | SUBMIT | TEXT | [{ "type": "PII", "count": 3 }] | PII 포함 문장 | BLOCK |
| REQUIRE_APPROVAL (파일) | tr-upload-csv-001 | UPLOAD_SELECT | FILE_META | [] | file: csv, 4096 bytes | REQUIRE_APPROVAL |

---

## 6. 인증 실패 시

**요청**: `Authorization: Bearer wrong-token` 또는 헤더 생략.

**예상**: `401 Unauthorized`. 이벤트/결정 생성되지 않음.

---

## 7. 샘플 텍스트 (복사용)

아래 블록을 복사해 ChatGPT/Claude 입력창에 붙여넣거나 전송하면, 정책·그룹에 따라 ALLOW / WARN / BLOCK이 나온다.

**일반 텍스트 (ALLOW 기대)**  
그룹 무관. 탐지 없음 → ALLOW.

```
오늘 날씨가 좋네요. 내일 회의 일정 확인 부탁드립니다.
```

---

**비밀키 포함 (BLOCK 기대)**  
그룹 AllEmployees 등. Secrets 탐지 1건 이상 → BLOCK.

```
API key is sk-abc123xyz789. Use it in the Authorization header.
```

---

**PII 다량 (BLOCK 기대)**  
그룹 AllEmployees 등. PII 3건 이상 → BLOCK. (이메일 + 휴대폰 + 한글 이름/주민등록 등)

```
문의 드립니다. 담당자 홍길동, 연락처 010-1234-5678, 이메일 kim@example.com 로 회신 부탁드립니다. 주민번호 900101-1234567 확인 필요합니다.
```

---

**코드형 대량 텍스트 (WARN 기대, Dev 그룹)**  
그룹 **Dev**, 1500자 이상 + 코드 패턴 → **붙여넣기(PASTE) 시점에만** WARN. 아래 통째로 **입력창에 붙여넣기** (1500자 이상).

> **설계**: 소스코드는 보통 붙여넣기이므로, "Dev Warn Large Code Paste" 정책은 **PASTE에만** 적용된다. 붙여넣기에서 한 번 경고하고 사용자가 "계속 진행"하면 텍스트가 입력창에 들어가고, **전송(SUBMIT) 시에는 이 정책으로 다시 경고하지 않는다.** 개인정보/비밀키는 타이핑 가능하므로 PASTE·SUBMIT 모두에서 검사한다.

> **중요**: 코드(CODE) 탐지는 **붙여넣기/입력창 텍스트**에만 적용됩니다. **파일 첨부**로 넣으면 이벤트가 `FILE_META`로 기록되고, 파일 내용은 서버로 전송되지 않아 CODE 탐지가 되지 않습니다. 소스코드 WARN을 보려면 반드시 **텍스트로 붙여넣기**하세요.

```
// Sample code for WARN test (Dev group, 1500+ chars)
import React from 'react';

function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="container">
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

export default App;

// --- repeated to exceed 1500 chars ---
function helper() {
  const a = [1, 2, 3].map(x => x * 2);
  return a.filter(Boolean);
}
const config = { apiUrl: '/api', timeout: 5000 };
export const utils = { helper, config };

function AnotherComponent() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(config.apiUrl).then(r => r.json()).then(setData);
  }, []);
  return data ? <pre>{JSON.stringify(data)}</pre> : <span>Loading...</span>;
}

class OldComponent extends React.Component {
  render() {
    return <div>{this.props.title}</div>;
  }
}

// Lorem to pad length. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident. const fn = () => {}; export { AnotherComponent, OldComponent };

// Padding: Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. function pad() { return 'x'.repeat(100); }
```

---

## 8. 경고(WARN) 및 마스킹(MASK) 테스트

### 8.1 경고(WARN) 테스트

**현재 동작**: WARN 시 확장에서 **경고** 모달이 뜨고, "계속 진행" 시 원문 그대로 전송/삽입, "취소" 시 전송/삽입 안 함. Admin Events에는 outcome=WARN으로 기록됨.

**테스트 방법 (실제 사이트)**

| 방법 | 조건 | 기대 결과 |
|------|------|-----------|
| **A. 코드 붙여넣기** | Extension Options에서 그룹 **Dev**, 이메일 `alice@example.com`(또는 DB에 Dev 소속 사용자). ChatGPT/Claude 입력창에 **1500자 이상** 코드(예: `function foo() { ... }` 반복, 또는 import/class 포함 JS) 붙여넣기 | 경고 모달 "코드/대량 텍스트로 보입니다. 민감정보가 없는지 확인 후 진행하세요." → "계속 진행" 시 텍스트 삽입, "취소" 시 삽입 안 함 |
| **B. 코드 파일 첨부** | 그룹 **Dev**. 채팅 창에 **.js / .ts / .py** 등 소스 파일 드래그 또는 파일 선택 | 경고 모달 "소스 코드 파일 첨부입니다. ..." → "계속 진행" 시 첨부 진행, "취소" 시 취소 |

**샘플 텍스트**: 위 **§7. 샘플 텍스트** 의 "코드형 대량 텍스트 (WARN 기대)" 블록을 복사해 붙여넣기.

**붙여넣기 시 경고가 안 뜰 때**

- **PASTE 시점**에 경고가 나오는 것이 정상이다. 반응이 없으면 다음을 확인한다.
  1. **텍스트로 붙여넣기했는지**: Admin Events에서 Content가 **FILE_META**로 나오면 **파일 첨부** 이벤트다. 파일 내용은 서버에 안 보내지므로 코드 탐지가 되지 않고, "No policy matched"로 ALLOW될 수 있다. **입력창에 직접 붙여넣기**한 뒤 전송하면 **TEXT**로 기록되고 코드 패턴 검사가 적용된다.
  2. **Extension Options**: 아무것도 안 넣으면 기본이 그룹 **Dev**, 이메일 **alice@example.com** 이다. 다른 그룹/이메일을 직접 넣었다면 Dev 소속이어야 이 정책이 매칭된다.
  3. **PASTE에서만 경고**: 시드 정책 "Dev Warn Large Code Paste"는 **PASTE에만** 적용된다. 전송(SUBMIT) 시에는 이 정책으로 경고하지 않으므로, 코드 경고는 **붙여넣기 순간**에만 뜨는지 확인하면 된다.
  4. **사이트/포커스**: ChatGPT·Claude 입력창에 포커스가 있는 상태에서 붙여넣기했는지, 지원 도메인(chatgpt.com, claude.ai 등)인지 확인.
  5. **개발자 도구 콘솔**: `[AI-Aware SSE]` 로그로 PASTE/SUBMIT 요청 전송 여부, 에러 메시지가 있는지 확인.

**테스트 방법 (API)**

WARN을 기대 outcome으로 받으려면, 시드 정책 "Dev Warn Large Code Paste" 조건을 만족하는 요청을 보내면 된다.

```json
POST /api/v1/extension/decision-requests
Authorization: Bearer devtoken-123
Content-Type: application/json

{
  "trace_id": "tr-warn-code-001",
  "event": { "type": "PASTE", "occurred_at": "2025-02-06T12:00:00.000Z", "app": { "domain": "chatgpt.com", "url": "https://chatgpt.com/" } },
  "actor": { "user_hint": { "groups": ["Dev"], "email": "alice@example.com" }, "device": {} },
  "content": {
    "kind": "TEXT",
    "length": 2000,
    "local_detectors": [],
    "sample_masked": "import React from 'react';\nfunction App() {\n  return <div>Hello</div>;\n}\n\n".repeat(80)
  },
  "schema_version": 1
}
```

**예상 응답**: `outcome`: `"WARN"`, `matched_policy.name`: `"Dev Warn Large Code Paste"`. Admin Events에서 해당 trace_id로 outcome=WARN 확인.

---

### 8.2 마스킹(MASK)과 익명화(ANONYMIZE) — 정책에 둘 다 두는 것이 좋은 이유

**의견**: 마스킹과 익명화 **둘 다** 정책 옵션으로 두는 것이 좋다. 용도가 다르기 때문이다.

| 구분 | 마스킹 (MASK) | 익명화 (ANONYMIZE) |
|------|----------------|---------------------|
| **방식** | 일부를 `*` 등으로 가림, **자리수 보존** | 다른 값으로 치환(예: 홍길동 → 김철수, 1990-01-15 → 1985-07-22) |
| **AI 인지** | "여기는 개인정보가 마스킹된 구간이구나" 인지 가능 | "실제와 비슷한 형식의 데이터"로 인식, 원본인지 구분 어려움 |
| **적합한 경우** | 감사·규정 대응, 전송/로그에서 "가렸다"를 명확히 보여줄 때 | 통계·학습·테스트에서 형식은 유지하되 식별만 제거할 때 |

정책에서 `action.type`을 `"MASK"` 또는 `"ANONYMIZE"`로 두고, 각각 `action.mask` / `action.anonymize` 규칙을 두면 된다. 그룹·조건별로 "이 구간은 마스킹", "이 구간은 익명화"를 나눌 수 있다.

**시드 정책**: 둘 다 시드에 포함되어 있으며 기본은 비활성화다. Admin에서 켜서 사용.
- **PII Mask Partial** (priority 55): `type: "MASK"`, `action.mask` 규칙.
- **PII Anonymize Partial** (priority 54): `type: "ANONYMIZE"`, `action.anonymize` 규칙.

---

#### 마스킹(MASK) — 일부 마스킹 정책·예시

**설계**: **일부분 마스킹**(일부만 `*`로 가림) 시 **자리수 보존**. 예: 홍길동(3자) → 홍**(3자). AI가 "여기는 마스킹된 구간이구나"를 인지할 수 있게. `action.type: "MASK"` + `action.mask` 규칙.

#### 샘플 정책 (PII 일부 마스킹)

시드에 **"PII Mask Partial"** 정책이 추가되어 있으며, 기본은 **비활성화**(enabled: false)이다. Admin에서 활성화 후 사용할 수 있다.

| 항목 | 값 |
|------|-----|
| **이름** | PII Mask Partial |
| **범위(Scope)** | apps: AI 앱들, groups: AllEmployees, event_types: PASTE, SUBMIT |
| **조건(Condition)** | PII 탐지 1건 이상 |
| **동작(Action)** | type: MASK, message: "개인정보가 일부 마스킹되어 전송됩니다.", mask 규칙 아래 참고 |

**Scope (JSON) 예시**
```json
{
  "apps": ["<app_id_chatgpt>", "<app_id_copilot>", "<app_id_gemini>"],
  "groups": ["AllEmployees"],
  "event_types": ["PASTE", "SUBMIT"]
}
```

**조건 (JSON) 예시**
```json
{
  "all": [
    { "detector": "PII", "op": "count_gte", "value": 1 }
  ]
}
```

**동작 (JSON) 예시 — 일부 마스킹 규칙**
```json
{
  "type": "MASK",
  "message": "개인정보가 일부 마스킹되어 전송됩니다.",
  "require_reason": false,
  "mask": {
    "name": "first_char_only",
    "birthdate": "year_only",
    "phone": "middle_masked",
    "email": "domain_hidden"
  }
}
```

#### 일부 마스킹 규칙 예시 (자리수 보존)

**원칙**: 치환 후에도 **글자 수를 원본과 동일**하게 둔다. AI가 "여기는 마스킹된 개인정보 구간"임을 알 수 있게 하기 위함.

| 규칙 키 | 의미 | 입력 예 | 출력 예 (자리수 동일) |
|--------|------|---------|------------------------|
| **name: first_char_only** | 첫 글자만 노출, 나머지는 `*`로 채움(길이 유지) | 홍길동(3자), 김철수(3자) | 홍**(3자), 김**(3자) |
| **birthdate: year_only** | 연도만 노출, 월·일은 `*`로 채움(형식·길이 유지) | 1990-01-15(10자) | 1990-**-** (10자) |
| **phone: middle_masked** | 가운데 자리만 `*`로 치환(길이 유지) | 010-1234-5678 | 010-****-5678 |
| **email: domain_hidden** | 로컬은 유지, 도메인은 `*`로 채움(구간별 길이 유지) | hong@example.com | hong@********.*** |

**추가 규칙 예 (확장 시, 모두 자리수 보존)**  
- `name: "full_masked"` → 홍길동 → `***` (3자)  
- `birthdate: "full_masked"` → 1990-01-15 → `****-**-**` (10자)  
- `phone: "last_four_only"` → 010-1234-5678 → `***-***-5678`  
- `email: "local_only"` → hong@example.com → `h***@********.***` (각 부분 길이 유지)

#### 샘플 텍스트 (PII 포함 — 마스킹 후 기대)

**원문**
```
담당자 홍길동(1990-01-15), 연락처 010-1234-5678, 이메일 hong@example.com 로 연락 주세요.
```

**일부 마스킹 적용 후 (규칙 위와 동일 시)**
```
담당자 홍**(1990-**-**), 연락처 010-****-5678, 이메일 hong@***.*** 로 연락 주세요.
```

#### 구현 요약 (지금 바로 쓰는 방법)

1. **Admin**  
   - Policies에서 **PII Mask Partial** 또는 **PII Anonymize Partial**을 **사용**으로 켠다.  
   - (기본은 비활성화)

2. **붙여넣기(PASTE)**  
   - PII가 포함된 문장을 붙여넣으면 → 백엔드가 MASK/ANONYMIZE 결정 → 확장이 `applyMask`/`applyAnonymize`로 **변환된 텍스트만** 입력창에 삽입한 뒤, 알림 모달을 띄운다.

3. **전송(SUBMIT)**  
   - PII가 포함된 상태로 전송 버튼을 누르면 → 백엔드가 MASK/ANONYMIZE 결정 → 확장이 입력창 내용을 **변환된 텍스트로 덮어쓰고** 곧바로 전송한다. (AI에는 마스킹/익명화된 문장만 전달됨)

4. **코드 위치**  
   - `extension/src/transform.ts`: `applyMask`, `applyAnonymize` (이름·생년월일·전화·이메일 패턴, 자리수 보존).  
   - `extension/src/content.ts`: PASTE 시 `res.outcome === 'MASK'|'ANONYMIZE'` → 변환 후 `insertTextAtCursor(transformed)`; SUBMIT 시 → `setInputText(transformed)` 후 `onAllow()`.  
   - 백엔드 `policy-engine.service.ts`: 정책 `action_json`의 `mask`/`anonymize`를 응답에 그대로 넘김.

**테스트**

1. Admin에서 "PII Mask Partial" 정책을 **사용**으로 켠 뒤,  
   `담당자 홍길동(1990-01-15), 연락처 010-1234-5678, 이메일 hong@example.com` 를 붙여넣기 또는 전송.
2. **붙여넣기**: 입력창에 `담당자 홍**(1990-**-**), 연락처 010-****-5678, 이메일 hong@***.*** ...` 처럼 들어가야 함.
3. **전송**: 위 문장이 있는 상태에서 전송하면, 입력창이 마스킹된 문장으로 바뀐 뒤 그대로 전송됨.
