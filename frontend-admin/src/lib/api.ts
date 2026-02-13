const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1';

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type HealthResponse = {
  ok: boolean;
  server_time: string;
  version: string;
};

export type DashboardSummary = {
  metrics: {
    events_total: number;
    blocked: number;
    warned: number;
    masked: number;
    approval_pending: number;
  };
  top_apps: Array<{ domain: string; events: number; blocked: number }>;
  top_detectors: Array<{ type: string; hits: number }>;
};

export type EventListItem = {
  event_id: string;
  time: string;
  user: { email: string | null; groups: string[] };
  app: { domain: string | null };
  event_type: string;
  decision: string;
  risk_score: number;
  case_id: string | null;
};

export type EventSearchResponse = { items: EventListItem[]; next_cursor: string | null };

export type BlockReason = {
  explanation: string | null;
  policy_name: string | null;
  policy_id?: string | null;
};

export type ApprovalListItem = {
  case_id: string;
  event_id: string;
  requested_at: string;
  request_reason: string | null;
  block_reason: BlockReason | null;
  requested_by: { email: string | null; groups: string[] };
  app: { domain: string | null };
  summary: { risk_score: number; detectors: string[] };
  expires_at: string | null;
  status: string;
  decision_comment?: string | null;
  decision_payload?: { approval_kind?: string; exception_id?: string } | null;
};

export type ApprovalListResponse = { items: ApprovalListItem[]; next_cursor: string | null };

export type PolicyItem = {
  policy_id: string;
  name: string;
  description: string | null;
  priority: number;
  enabled: boolean;
  scope: object;
  condition: object;
  action: object;
  version: number;
  updated_at: string;
};

export type PolicyListResponse = { items: PolicyItem[]; next_cursor: string | null };

export type TenantItem = { tenant_id: string; name: string; created_at: string };
export type TenantListResponse = { items: TenantItem[] };

export type UserListItem = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  groups: string[];
  created_at: string;
};
export type UserListResponse = { items: UserListItem[]; next_cursor: string | null };

export type GroupListItem = {
  group_id: string;
  name: string;
  member_count: number;
  created_at: string;
};
export type GroupListResponse = { items: GroupListItem[]; next_cursor: string | null };

export type ExceptionListItem = {
  exception_id: string;
  tenant_id: string;
  actor_email: string | null;
  policy_id: string;
  policy_name: string;
  expires_at: string;
  created_from_case_id: string;
  created_at: string;
  active: boolean;
};
export type ExceptionListResponse = { items: ExceptionListItem[]; next_cursor: string | null };

export type AuditListItem = {
  audit_id: string;
  time: string;
  actor_email: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: object;
};
export type AuditListResponse = { items: AuditListItem[]; next_cursor: string | null };
