import { getApiBase, getDeviceToken } from './config';

export type Outcome = 'ALLOW' | 'WARN' | 'BLOCK' | 'MASK' | 'ANONYMIZE' | 'REQUIRE_APPROVAL';

export type DecisionResponse = {
  decision_id: string;
  event_id: string;
  outcome: Outcome;
  action: {
    type: Outcome;
    message: string | null;
    allow_approval_request?: boolean;
    mask?: Record<string, string>;
    anonymize?: Record<string, string>;
  };
  risk_score: number;
  matched_policy: { policy_id: string; name: string } | null;
  detector_hits: Array<{ type: string; count: number }>;
  explanation: { summary: string; safe_details: string[] };
  next?: { approval?: { supported: boolean; ttl_seconds?: number } };
};

export type DecisionRequest = {
  trace_id: string;
  event: {
    type: 'PASTE' | 'SUBMIT' | 'UPLOAD_SELECT' | 'UPLOAD_SUBMIT';
    occurred_at: string;
    app: { domain: string; url: string };
    page_context?: { path?: string; title?: string };
  };
  actor: {
    user_hint: { groups: string[]; email?: string; display_name?: string };
    device: { browser?: string; extension_version?: string };
    network?: object;
  };
  content: {
    kind: 'TEXT' | 'FILE_META';
    length: number;
    hashes?: { sha256?: string };
    sample_masked?: string;
    local_detectors: Array<{ type: string; count: number; confidence?: number }>;
  };
  file?: { name: string; size_bytes: number; mime?: string; ext?: string };
  schema_version?: number;
  /** 승인 후 1회 허용용. 백엔드에서 해당 케이스가 APPROVED이고 미사용이면 ALLOW 후 소진 */
  approved_case_id?: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const token = await getDeviceToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function requestDecision(body: DecisionRequest): Promise<DecisionResponse> {
  const base = await getApiBase();
  const res = await fetch(`${base}/extension/decision-requests`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[AI-Aware SSE] requestDecision 실패', res.status, body.event?.type, text.slice(0, 500));
    throw new Error(`Decision request failed: ${res.status} ${text}`);
  }
  const data = JSON.parse(text) as DecisionResponse;
  return data;
}

export async function createApprovalCase(params: {
  event_id: string;
  decision_id: string;
  request_reason?: string;
  requested_at: string;
  requested_by_email?: string;
}): Promise<{ case_id: string; status: string; expires_at: string | null }> {
  const base = await getApiBase();
  const res = await fetch(`${base}/extension/approval-cases`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Create approval case failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getApprovalCaseStatus(
  caseId: string,
): Promise<{ case_id: string; status: string; decision: object | null; updated_at: string }> {
  const base = await getApiBase();
  const res = await fetch(`${base}/extension/approval-cases/${caseId}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Get approval status failed: ${res.status}`);
  return res.json();
}

function genTraceId(): string {
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function sampleMask(text: string, maxLen: number = 200): string {
  if (text.length <= maxLen) return text;
  const half = Math.floor((maxLen - 20) / 2); // 20 = '...[truncated]...'.length
  return text.slice(0, half) + '...[truncated]...' + text.slice(-half);
}

export type SubmitKind = 'text' | 'files' | 'mixed';

export function buildDecisionRequest(params: {
  eventType: 'PASTE' | 'SUBMIT' | 'UPLOAD_SELECT' | 'UPLOAD_SUBMIT';
  textContent?: string;
  fileMeta?: { name: string; size_bytes: number; mime?: string; ext?: string };
  /** SUBMIT 시 구분: 텍스트만 / 첨부만 / 텍스트+첨부 (백엔드·Admin에서 구분용) */
  submitKind?: SubmitKind;
  /** Options에 설정한 사용자 식별. 없으면 백엔드가 익명/기본 그룹 처리 */
  actor?: { email?: string | null; groups?: string[] };
}): DecisionRequest {
  const { eventType, textContent = '', fileMeta, submitKind, actor } = params;
  const domain = window.location.hostname;
  const url = window.location.href;
  const contentLength = textContent.length;
  const pageContext: { path?: string; title?: string; submit_kind?: string } = {
    path: window.location.pathname,
    title: document.title,
  };
  if (submitKind) pageContext.submit_kind = submitKind;
  const isSubmit = eventType === 'SUBMIT';
  const contentKind = isSubmit ? 'TEXT' : (fileMeta ? 'FILE_META' : 'TEXT');
  const contentLen =
    isSubmit ? contentLength : (fileMeta ? Math.max(0, Math.floor(Number(fileMeta.size_bytes))) : contentLength);
  // 옵션 미설정 시 테스트 편의를 위해 기본 Dev + alice (시드 사용자)
  const groups = (actor?.groups?.length ? actor.groups : ['Dev']) as string[];
  const email = (actor?.email?.trim() || 'alice@example.com');
  // PASTE/SUBMIT 시 서버 코드 탐지를 위해 샘플을 2000자까지 전달 (기본 200자는 코드 패턴을 놓침)
  const sampleMaxLen = eventType === 'PASTE' || eventType === 'SUBMIT' ? 2000 : 200;
  return {
    trace_id: genTraceId(),
    schema_version: 1,
    event: {
      type: eventType,
      occurred_at: new Date().toISOString(),
      app: { domain, url },
      page_context: pageContext,
    },
    actor: {
      user_hint: {
        email,
        groups,
      },
      device: { browser: navigator.userAgent.slice(0, 80), extension_version: '0.1.0' },
    },
    content: {
      kind: contentKind,
      length: contentLen,
      sample_masked: textContent ? sampleMask(textContent, sampleMaxLen) : undefined,
      local_detectors: [],
    },
    ...(fileMeta && { file: fileMeta }),
  };
}
