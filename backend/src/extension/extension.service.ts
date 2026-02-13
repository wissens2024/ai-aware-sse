import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DetectorService,
  type DetectorHit,
} from '../detector/detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyCacheService } from '../policy/policy-cache.service';
import { PolicyEngineService } from '../policy/policy-engine.service';
import { DecisionRequestDto } from './dto/decision-request.dto';

/** DB 체크 제약 chk_events_sample_len: content_sample_masked 최대 512자 */
const EVENTS_SAMPLE_MAX_LEN = 512;

@Injectable()
export class ExtensionService {
  private readonly logger = new Logger(ExtensionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEngine: PolicyEngineService,
    private readonly policyCache: PolicyCacheService,
    private readonly detector: DetectorService,
  ) {}

  async evaluateDecision(dto: DecisionRequestDto) {
    this.logger.log(
      `Decision request: type=${dto.event?.type} trace=${dto.trace_id}`,
    );
    const tenant = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    if (!tenant)
      throw new NotFoundException({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: 'No tenant found; run initdb seed (03_seed.sql).',
        },
      });
    const tenantId = tenant.tenant_id;

    // 승인 후 1회 허용: approved_case_id가 있고 해당 케이스가 APPROVED이며 미사용이면 ALLOW 후 소진
    if (dto.approved_case_id) {
      const allowResult = await this.tryAllowByApprovedCase(tenantId, dto);
      if (allowResult) return allowResult;
    }

    const domain = dto.event.app.domain;
    const appDomain = await this.prisma.app_domains.findFirst({
      where: { tenant_id: tenantId, domain },
      include: { apps: true },
    });
    const appId = appDomain?.app_id ?? null;

    const eventType = this.normalizeEventType(dto.event.type);
    const contentKind = dto.content.kind === 'FILE_META' ? 'FILE_META' : 'TEXT';
    const contentLengthRaw = dto.content.length ?? 0;
    const contentLength = Math.min(
      Math.max(0, Math.floor(Number(contentLengthRaw))),
      2147483647,
    );

    const event = await this.prisma.events.create({
      data: {
        tenant_id: tenantId,
        actor_email: dto.actor?.user_hint?.email ?? null,
        group_snapshot: (dto.actor?.user_hint?.groups ?? []) as object,
        app_id: appId,
        domain,
        url: dto.event.app?.url ?? null,
        event_type: eventType,
        trace_id: dto.trace_id,
        content_kind: contentKind,
        content_length: contentLength,
        content_sha256: dto.content.hashes?.sha256 ?? null,
        content_sample_masked: this.truncateSampleForDb(
          dto.content.sample_masked,
        ),
        file_name: dto.file?.name ?? null,
        file_size_bytes:
          dto.file?.size_bytes != null ? BigInt(dto.file.size_bytes) : null,
        file_mime: dto.file?.mime ?? null,
        file_ext: dto.file?.ext ?? null,
        file_sha256: dto.file?.hashes
          ? (dto.file.hashes as { sha256?: string }).sha256
          : null,
        client_meta_json: {
          ...((dto.actor?.device ?? {}) as object),
          ...((dto.event as { page_context?: { submit_kind?: string } })
            ?.page_context?.submit_kind != null
            ? {
                submit_kind: (
                  dto.event as { page_context?: { submit_kind?: string } }
                ).page_context!.submit_kind,
              }
            : {}),
        } as object,
        schema_version: dto.schema_version ?? 1,
      },
    });
    const eventId = event.event_id;

    const policies = await this.policyCache.getEnabledPolicies(tenantId);

    const localDetectors = (dto.content.local_detectors ?? []) as DetectorHit[];
    const serverHits = this.detector.run(dto.content.sample_masked);
    const mergedDetectors = this.mergeDetectorHits(localDetectors, serverHits);

    // 사용자 그룹: 이메일이 있으면 DB에서 조회(Admin에 등록된 사용자·그룹), 없으면 요청의 groups 사용
    let userGroups = dto.actor?.user_hint?.groups ?? [];
    const actorEmail = dto.actor?.user_hint?.email ?? null;
    if (actorEmail) {
      const user = await this.prisma.users.findUnique({
        where: { tenant_id_email: { tenant_id: tenantId, email: actorEmail } },
        include: {
          user_groups: { include: { groups: { select: { name: true } } } },
        },
      });
      if (user?.user_groups?.length) {
        userGroups = user.user_groups.map((ug) => ug.groups.name);
      }
    }

    const ctx = {
      tenantId,
      appId,
      domain,
      eventType,
      userGroups,
      contentKind: dto.content.kind,
      contentLength: dto.content.length ?? 0,
      localDetectors: mergedDetectors,
      file: dto.file,
    };

    const result = this.policyEngine.evaluate(policies, ctx);

    // 사용자 예외: BLOCK/REQUIRE_APPROVAL 시 해당 사용자·정책에 대한 유효 예외가 있으면 ALLOW 처리
    if (
      (result.outcome === 'BLOCK' || result.outcome === 'REQUIRE_APPROVAL') &&
      result.matchedPolicy?.policy_id &&
      actorEmail
    ) {
      const exception = await this.prisma.policy_exceptions.findFirst({
        where: {
          tenant_id: tenantId,
          actor_email: actorEmail,
          policy_id: result.matchedPolicy.policy_id,
          expires_at: { gt: new Date() },
        },
      });
      if (exception) {
        const decision = await this.prisma.decisions.create({
          data: {
            tenant_id: tenantId,
            event_id: eventId,
            outcome: 'ALLOW',
            action_json: {
              type: 'ALLOW',
              message: null,
              allow_approval_request: true,
              mask: null,
            },
            risk_score: 0,
            matched_policy_id: result.matchedPolicy.policy_id,
            matched_policy_version: result.matchedPolicy.version,
            detector_hits_json: result.detectorHits as object,
            explanation_text: `User exception applied (exception_id: ${exception.exception_id}).`,
          },
        });
        this.logger.log(
          `User exception applied: ${exception.exception_id} -> event ${eventId}`,
        );
        return {
          decision_id: decision.decision_id,
          event_id: eventId,
          outcome: 'ALLOW',
          action: {
            type: 'ALLOW',
            message: null,
            allow_approval_request: true,
          },
          risk_score: 0,
          matched_policy: result.matchedPolicy
            ? {
                policy_id: result.matchedPolicy.policy_id,
                name: result.matchedPolicy.name,
                priority: result.matchedPolicy.priority,
                version: result.matchedPolicy.version,
              }
            : null,
          detector_hits: result.detectorHits,
          explanation: { summary: 'User exception applied.', safe_details: [] },
          next: {
            approval: {
              supported: true,
              approver_group: null,
              ttl_seconds: 7200,
            },
          },
        };
      }
    }

    const decision = await this.prisma.decisions.create({
      data: {
        tenant_id: tenantId,
        event_id: eventId,
        outcome: result.outcome,
        action_json: result.action as object,
        risk_score: result.riskScore,
        matched_policy_id: result.matchedPolicy?.policy_id ?? null,
        matched_policy_version: result.matchedPolicy?.version ?? null,
        detector_hits_json: result.detectorHits as object,
        explanation_text: result.explanation.summary,
      },
    });

    await this.prisma.audit_trail.create({
      data: {
        tenant_id: tenantId,
        actor_email: dto.actor?.user_hint?.email ?? null,
        action: 'decision_created',
        target_type: 'decision',
        target_id: decision.decision_id,
        details_json: {
          event_id: eventId,
          outcome: result.outcome,
          trace_id: dto.trace_id,
        } as object,
      },
    });

    return {
      decision_id: decision.decision_id,
      event_id: eventId,
      outcome: result.outcome,
      action: result.action,
      risk_score: result.riskScore,
      matched_policy: result.matchedPolicy
        ? {
            policy_id: result.matchedPolicy.policy_id,
            name: result.matchedPolicy.name,
            priority: result.matchedPolicy.priority,
            version: result.matchedPolicy.version,
          }
        : null,
      detector_hits: result.detectorHits,
      explanation: result.explanation,
      next: {
        approval: { supported: true, approver_group: null, ttl_seconds: 7200 },
      },
    };
  }

  /**
   * approved_case_id로 승인 케이스 조회 → APPROVED이고 미사용이면 이번 요청을 ALLOW로 처리하고 케이스 소진.
   * 소진 시 decision_payload_json에 consumed_at 기록.
   */
  private async tryAllowByApprovedCase(
    tenantId: string,
    dto: DecisionRequestDto,
  ): Promise<{
    decision_id: string;
    event_id: string;
    outcome: string;
    action: object;
    risk_score: number;
    matched_policy: null;
    detector_hits: object[];
    explanation: object;
    next: object;
  } | null> {
    const ac = await this.prisma.approval_cases.findFirst({
      where: { case_id: dto.approved_case_id!, tenant_id: tenantId },
    });
    if (!ac || ac.status !== 'APPROVED') return null;
    const payload = (ac.decision_payload_json ?? {}) as {
      consumed_at?: string;
    };
    if (payload.consumed_at) return null;

    const domain = dto.event.app.domain;
    const appDomain = await this.prisma.app_domains.findFirst({
      where: { tenant_id: tenantId, domain },
      include: { apps: true },
    });
    const appId = appDomain?.app_id ?? null;
    const eventType = this.normalizeEventType(dto.event.type);
    const contentKind = dto.content.kind === 'FILE_META' ? 'FILE_META' : 'TEXT';
    const contentLengthRaw = dto.content.length ?? 0;
    const contentLength = Math.min(
      Math.max(0, Math.floor(Number(contentLengthRaw))),
      2147483647,
    );

    const event = await this.prisma.events.create({
      data: {
        tenant_id: tenantId,
        actor_email: dto.actor?.user_hint?.email ?? null,
        group_snapshot: (dto.actor?.user_hint?.groups ?? []) as object,
        app_id: appId,
        domain,
        url: dto.event.app?.url ?? null,
        event_type: eventType,
        trace_id: dto.trace_id,
        content_kind: contentKind,
        content_length: contentLength,
        content_sha256: dto.content.hashes?.sha256 ?? null,
        content_sample_masked: this.truncateSampleForDb(
          dto.content.sample_masked,
        ),
        file_name: dto.file?.name ?? null,
        file_size_bytes:
          dto.file?.size_bytes != null ? BigInt(dto.file.size_bytes) : null,
        file_mime: dto.file?.mime ?? null,
        file_ext: dto.file?.ext ?? null,
        file_sha256: dto.file?.hashes
          ? (dto.file.hashes as { sha256?: string }).sha256
          : null,
        client_meta_json: { approved_case_id: dto.approved_case_id } as object,
        schema_version: dto.schema_version ?? 1,
      },
    });
    const decision = await this.prisma.decisions.create({
      data: {
        tenant_id: tenantId,
        event_id: event.event_id,
        outcome: 'ALLOW',
        action_json: {
          type: 'ALLOW',
          message: null,
          allow_approval_request: true,
          mask: null,
        },
        risk_score: 0,
        matched_policy_id: null,
        matched_policy_version: null,
        detector_hits_json: [],
        explanation_text: 'Approved case one-time bypass.',
      },
    });
    // 1회 허용 소진: 실제 "전송"(SUBMIT/UPLOAD_SUBMIT) 시에만 소진. PASTE/UPLOAD_SELECT는 허용만 하고 소진하지 않음 → 붙여넣기 후 전송 한 번에 1회 사용
    const consumeNow = eventType === 'SUBMIT' || eventType === 'UPLOAD_SUBMIT';
    if (consumeNow) {
      await this.prisma.approval_cases.update({
        where: { case_id: ac.case_id },
        data: {
          decision_payload_json: {
            ...payload,
            consumed_at: new Date().toISOString(),
          } as object,
          updated_at: new Date(),
        },
      });
      this.logger.log(
        `Approved case consumed: ${ac.case_id} -> event ${event.event_id} (${eventType})`,
      );
    } else {
      this.logger.log(
        `Approved case one-time bypass (not consumed): ${ac.case_id} -> event ${event.event_id} (${eventType}), will consume on SUBMIT`,
      );
    }
    return {
      decision_id: decision.decision_id,
      event_id: event.event_id,
      outcome: 'ALLOW',
      action: { type: 'ALLOW', message: null, allow_approval_request: true },
      risk_score: 0,
      matched_policy: null,
      detector_hits: [],
      explanation: {
        summary: 'Approved case one-time bypass.',
        safe_details: [],
      },
      next: {
        approval: { supported: true, approver_group: null, ttl_seconds: 7200 },
      },
    };
  }

  /** DB chk_events_sample_len(512자) 준수를 위해 저장 전 샘플 길이 제한. 탐지에는 원본 전체 사용 */
  private truncateSampleForDb(
    sample: string | null | undefined,
  ): string | null {
    if (sample == null || sample === '') return null;
    if (sample.length <= EVENTS_SAMPLE_MAX_LEN) return sample;
    return sample.slice(0, EVENTS_SAMPLE_MAX_LEN);
  }

  private normalizeEventType(
    type: string,
  ): 'TYPE' | 'PASTE' | 'SUBMIT' | 'UPLOAD_SELECT' | 'UPLOAD_SUBMIT' {
    const t = type?.toUpperCase();
    const allowed = [
      'TYPE',
      'PASTE',
      'SUBMIT',
      'UPLOAD_SELECT',
      'UPLOAD_SUBMIT',
    ] as const;
    return allowed.includes(t as (typeof allowed)[number])
      ? (t as (typeof allowed)[number])
      : 'PASTE';
  }

  /** 시드 정책이 PII/SECRETS/CODE(대문자)를 사용하므로, 탐지 타입을 대문자로 정규화 */
  private normalizeDetectorType(type: string): string {
    const u = type.toUpperCase();
    if (u === 'SECRETS' || u === 'PII' || u === 'CODE') return u;
    return type;
  }

  /** 로컬(확장) 탐지 결과와 서버 탐지 결과를 타입별로 합침 (count 합산, confidence는 최대값). 타입은 정책 매칭을 위해 대문자로 통일 */
  private mergeDetectorHits(
    local: DetectorHit[],
    server: DetectorHit[],
  ): DetectorHit[] {
    const byType = new Map<string, DetectorHit>();
    for (const h of local) {
      const t = this.normalizeDetectorType(h.type);
      const cur = byType.get(t);
      if (!cur)
        byType.set(t, { type: t, count: h.count, confidence: h.confidence });
      else
        byType.set(t, {
          type: t,
          count: cur.count + h.count,
          confidence: Math.max(cur.confidence ?? 0, h.confidence ?? 0),
        });
    }
    for (const h of server) {
      const t = this.normalizeDetectorType(h.type);
      const cur = byType.get(t);
      if (!cur)
        byType.set(t, { type: t, count: h.count, confidence: h.confidence });
      else
        byType.set(t, {
          type: t,
          count: cur.count + h.count,
          confidence: Math.max(cur.confidence ?? 0, h.confidence ?? 0),
        });
    }
    return Array.from(byType.values());
  }

  recordUserAction(_body: object): { ok: boolean } {
    return { ok: true };
  }

  async createApprovalCase(body: {
    event_id: string;
    decision_id: string;
    request_reason?: string;
    requested_at: string;
    requested_by_email?: string;
  }) {
    const tenant = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    if (!tenant) throw new Error('No tenant found.');
    const event = await this.prisma.events.findFirst({
      where: { event_id: body.event_id, tenant_id: tenant.tenant_id },
    });
    if (!event)
      throw new UnprocessableEntityException({
        error: { code: 'PAYLOAD_INVALID', message: 'Event not found' },
      });
    const decision = await this.prisma.decisions.findFirst({
      where: {
        decision_id: body.decision_id,
        tenant_id: tenant.tenant_id,
        event_id: body.event_id,
      },
    });
    if (!decision)
      throw new UnprocessableEntityException({
        error: { code: 'PAYLOAD_INVALID', message: 'Decision not found' },
      });
    const expiresAt = new Date(Date.now() + 7200 * 1000);
    const c = await this.prisma.approval_cases.create({
      data: {
        tenant_id: tenant.tenant_id,
        event_id: body.event_id,
        decision_id: body.decision_id,
        request_reason: body.request_reason ?? null,
        requested_by_email: body.requested_by_email ?? null,
        expires_at: expiresAt,
      },
    });
    return {
      case_id: c.case_id,
      status: c.status,
      expires_at: c.expires_at?.toISOString() ?? null,
    };
  }

  async getApprovalCaseStatus(caseId: string) {
    const c = await this.prisma.approval_cases.findUnique({
      where: { case_id: caseId },
    });
    if (!c)
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Approval case not found' },
      });
    let status = c.status;
    if (status === 'PENDING' && c.expires_at && c.expires_at < new Date()) {
      await this.prisma.approval_cases.update({
        where: { case_id: caseId },
        data: { status: 'EXPIRED' },
      });
      status = 'EXPIRED';
    }
    const payload = c.decision_payload_json as {
      conditions?: object;
      approval_kind?: string;
    } | null;
    const decision =
      status !== 'PENDING' && status !== 'EXPIRED'
        ? {
            type:
              status === 'APPROVED'
                ? 'APPROVE'
                : status === 'REJECTED'
                  ? 'REJECT'
                  : 'CONDITIONAL_APPROVAL',
            conditions: payload?.conditions ?? null,
            comment: c.decision_comment ?? null,
            approval_kind: payload?.approval_kind ?? 'one_time',
          }
        : null;
    return {
      case_id: c.case_id,
      status,
      decision,
      updated_at: c.updated_at.toISOString(),
    };
  }

  ping() {
    return {
      ok: true,
      server_time: new Date().toISOString(),
      version: '0.1.0',
    };
  }
}
