#!/usr/bin/env bash
# Decision Request 시나리오 1.2 ~ 1.5 한 번에 호출 (연결 확인 + ALLOW/BLOCK/PII/REQUIRE_APPROVAL)
# 사용: BASE_URL과 TOKEN 설정 후 실행. (Windows: Git Bash 또는 WSL에서 실행)
# 예: BASE_URL=http://localhost:8080/api/v1 TOKEN=devtoken-123 ./run-decision-scenarios.sh

set -e
BASE_URL="${BASE_URL:-http://localhost:8080/api/v1}"
TOKEN="${TOKEN:-devtoken-123}"

echo "=== 1.1 Ping ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE_URL/extension/ping" | tail -5

echo ""
echo "=== 1.2 ALLOW (일반 텍스트) ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/extension/decision-requests" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"trace_id":"tr-allow-001","event":{"type":"SUBMIT","occurred_at":"2025-02-06T12:00:00.000Z","app":{"domain":"chatgpt.com","url":"https://chatgpt.com/"},"page_context":{"submit_kind":"text"}},"actor":{"user_hint":{"groups":["AllEmployees"],"email":"user@example.com"},"device":{"browser":"Chrome","extension_version":"0.1.0"}},"content":{"kind":"TEXT","length":24,"local_detectors":[],"sample_masked":"오늘 날씨가 좋네요."},"schema_version":1}' \
  | jq -r '.outcome // .message' 2>/dev/null || cat

echo ""
echo "=== 1.3 BLOCK (Secrets) ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/extension/decision-requests" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"trace_id":"tr-block-secrets-001","event":{"type":"PASTE","occurred_at":"2025-02-06T12:01:00.000Z","app":{"domain":"claude.ai","url":"https://claude.ai/"}},"actor":{"user_hint":{"groups":["AllEmployees"]},"device":{}},"content":{"kind":"TEXT","length":80,"local_detectors":[{"type":"SECRETS","count":1,"confidence":80}],"sample_masked":"API key is sk-abc123xyz. Use it in header."},"schema_version":1}' \
  | jq -r '.outcome // .message' 2>/dev/null || cat

echo ""
echo "=== 1.4 BLOCK (PII) ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/extension/decision-requests" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"trace_id":"tr-block-pii-001","event":{"type":"SUBMIT","occurred_at":"2025-02-06T12:02:00.000Z","app":{"domain":"chatgpt.com","url":"https://chatgpt.com/"},"page_context":{"submit_kind":"text"}},"actor":{"user_hint":{"groups":["AllEmployees"]},"device":{}},"content":{"kind":"TEXT","length":200,"local_detectors":[{"type":"PII","count":3,"confidence":90}],"sample_masked":"홍길동 010-1234-5678, kim@example.com, 900101-1234567"},"schema_version":1}' \
  | jq -r '.outcome // .message' 2>/dev/null || cat

echo ""
echo "=== 1.5 REQUIRE_APPROVAL (Finance + CSV) ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/extension/decision-requests" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"trace_id":"tr-upload-csv-001","event":{"type":"UPLOAD_SELECT","occurred_at":"2025-02-06T12:03:00.000Z","app":{"domain":"chatgpt.com","url":"https://chatgpt.com/"}},"actor":{"user_hint":{"groups":["Finance"]},"device":{}},"content":{"kind":"FILE_META","length":0,"local_detectors":[]},"file":{"name":"sales_2025.csv","size_bytes":4096,"mime":"text/csv","ext":"csv"},"schema_version":1}' \
  | jq -r '.outcome // .message' 2>/dev/null || cat

echo ""
echo "=== 완료. 기대: ALLOW, BLOCK, BLOCK, REQUIRE_APPROVAL ==="
