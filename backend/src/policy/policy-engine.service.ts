import { Injectable } from '@nestjs/common';

export type PolicyRecord = {
  policy_id: string;
  tenant_id: string;
  name: string;
  priority: number;
  version: number;
  scope_json: { apps?: string[]; groups?: string[]; event_types?: string[] };
  condition_json: object;
  action_json: {
    type?: string;
    message?: string;
    allow_approval_request?: boolean;
    [k: string]: unknown;
  };
};

export type EvalContext = {
  tenantId: string;
  appId: string | null;
  domain: string;
  eventType: string;
  userGroups: string[];
  contentKind: string;
  contentLength: number;
  localDetectors: Array<{ type: string; count: number; confidence?: number }>;
  file?: { name: string; size_bytes: number; mime?: string; ext?: string };
};

export type EvalResult = {
  outcome:
    | 'ALLOW'
    | 'WARN'
    | 'BLOCK'
    | 'MASK'
    | 'ANONYMIZE'
    | 'REQUIRE_APPROVAL';
  matchedPolicy: PolicyRecord | null;
  riskScore: number;
  action: {
    type: string;
    message: string | null;
    allow_approval_request: boolean;
    mask: object | null;
    anonymize?: object | null;
  };
  explanation: { summary: string; safe_details: string[] };
  detectorHits: Array<{ type: string; count: number; evidence: string | null }>;
};

function scopeMatches(
  scope: PolicyRecord['scope_json'],
  ctx: EvalContext,
): boolean {
  if (
    scope.apps &&
    scope.apps.length > 0 &&
    ctx.appId &&
    !scope.apps.includes(ctx.appId)
  )
    return false;
  if (
    scope.event_types &&
    scope.event_types.length > 0 &&
    !scope.event_types.includes(ctx.eventType)
  )
    return false;
  if (scope.groups && scope.groups.length > 0) {
    const hasGroup = scope.groups.some((g) => ctx.userGroups.includes(g));
    if (!hasGroup) return false;
  }
  return true;
}

function conditionMatches(condition: object, ctx: EvalContext): boolean {
  const c = condition as { any?: object[]; all?: object[] };
  if (c.any && Array.isArray(c.any)) {
    return c.any.some((rule) => matchRule(rule, ctx));
  }
  if (c.all && Array.isArray(c.all)) {
    return c.all.every((rule) => matchRule(rule, ctx));
  }
  return true;
}

function matchRule(rule: object, ctx: EvalContext): boolean {
  const r = rule as {
    detector?: string;
    op?: string;
    value?: number | string[];
    content?: string;
    file?: string;
  };
  if (r.detector && (r.op === 'count_gte' || r.op === 'score_gte')) {
    const det = ctx.localDetectors.find((d) => d.type === r.detector);
    const count = det?.count ?? 0;
    const threshold = typeof r.value === 'number' ? r.value : 0;
    if (r.op === 'count_gte') return count >= threshold;
    if (r.op === 'score_gte') return (det?.confidence ?? 0) >= threshold;
  }
  if (r.content === 'length_gte' && typeof r.value === 'number') {
    return ctx.contentLength >= r.value;
  }
  if (r.file === 'ext_in' && Array.isArray(r.value) && ctx.file?.ext) {
    const ext = ctx.file.ext.toLowerCase().replace(/^\./, '');
    return r.value.map((x) => x.toLowerCase()).includes(ext);
  }
  if (r.file === 'mime_in' && Array.isArray(r.value) && ctx.file?.mime) {
    return r.value.includes(ctx.file.mime);
  }
  return false;
}

@Injectable()
export class PolicyEngineService {
  evaluate(policies: PolicyRecord[], ctx: EvalContext): EvalResult {
    const sorted = [...policies].sort((a, b) => a.priority - b.priority);
    const detectorHits = ctx.localDetectors.map((d) => ({
      type: d.type,
      count: d.count,
      evidence: null as string | null,
    }));

    for (const policy of sorted) {
      if (!scopeMatches(policy.scope_json, ctx)) continue;
      if (!conditionMatches(policy.condition_json, ctx)) continue;

      const action = policy.action_json;
      const outcome = (action.type as EvalResult['outcome']) ?? 'ALLOW';
      const riskScore = Math.min(
        100,
        ctx.localDetectors.reduce((s, d) => s + d.count * 20, 0),
      );

      return {
        outcome,
        matchedPolicy: policy,
        riskScore,
        action: {
          type: outcome,
          message: action.message ?? null,
          allow_approval_request: action.allow_approval_request ?? false,
          mask: (action as { mask?: object }).mask ?? null,
          anonymize: (action as { anonymize?: object }).anonymize ?? null,
        },
        explanation: {
          summary: `Matched policy: ${policy.name}.`,
          safe_details: [policy.name],
        },
        detectorHits,
      };
    }

    return {
      outcome: 'ALLOW',
      matchedPolicy: null,
      riskScore: 0,
      action: {
        type: 'ALLOW',
        message: null,
        allow_approval_request: true,
        mask: null,
      },
      explanation: {
        summary: 'No policy matched; default allow.',
        safe_details: [],
      },
      detectorHits,
    };
  }
}
