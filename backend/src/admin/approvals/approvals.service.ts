import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY_APPROVALS = {
  items: [] as object[],
  next_cursor: null as string | null,
};

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOne(caseId: string) {
    try {
      const c = await this.prisma.approval_cases.findUnique({
        where: { case_id: caseId },
        include: {
          events: {
            select: {
              event_id: true,
              domain: true,
              actor_email: true,
              group_snapshot: true,
            },
          },
          decisions: {
            select: {
              risk_score: true,
              detector_hits_json: true,
              explanation_text: true,
              matched_policy_id: true,
              policies: { select: { name: true } },
            },
          },
        },
      });
      if (!c)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Approval case not found' },
        });
      const dec = c.decisions;
      const blockReason = dec
        ? {
            explanation: dec.explanation_text ?? null,
            policy_name: dec.policies?.name ?? null,
            policy_id: dec.matched_policy_id ?? null,
          }
        : null;
      return {
        case_id: c.case_id,
        event_id: c.event_id,
        requested_at: c.created_at.toISOString(),
        request_reason: c.request_reason ?? null,
        block_reason: blockReason,
        requested_by: {
          email:
            c.requested_by_email ?? (c.events?.actor_email as string) ?? null,
          groups: (c.events?.group_snapshot as string[]) ?? [],
        },
        app: { domain: c.events?.domain ?? null },
        summary: {
          risk_score: (dec?.risk_score as number) ?? 0,
          detectors: (
            (dec?.detector_hits_json as Array<{ type: string }>) ?? []
          ).map((d) => d.type),
        },
        expires_at: c.expires_at?.toISOString() ?? null,
        status: c.status,
        decision_comment: c.decision_comment ?? null,
        decision_payload: (c.decision_payload_json ?? null) as {
          approval_kind?: string;
          exception_id?: string;
        } | null,
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof UnprocessableEntityException
      )
        throw err;
      this.logger.warn(
        `Approvals getOne failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Approval case not found' },
      });
    }
  }

  async list(params: {
    status?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant) return EMPTY_APPROVALS;
      const limit = Math.min(params.limit ?? 50, 500);
      const where: {
        tenant_id: string;
        status?: approval_status;
        created_at?: object;
      } = {
        tenant_id: tenant.tenant_id,
      };
      if (
        params.status &&
        ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(
          params.status,
        )
      ) {
        where.status = params.status as approval_status;
      }
      if (params.from || params.to) {
        where.created_at = {};
        if (params.from)
          (where.created_at as { gte?: Date }).gte = new Date(params.from);
        if (params.to)
          (where.created_at as { lt?: Date }).lt = new Date(params.to);
      }
      const items = await this.prisma.approval_cases.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        cursor: params.cursor ? { case_id: params.cursor } : undefined,
        include: {
          events: {
            select: {
              event_id: true,
              domain: true,
              actor_email: true,
              group_snapshot: true,
            },
          },
          decisions: {
            select: {
              risk_score: true,
              detector_hits_json: true,
              explanation_text: true,
              policies: { select: { name: true } },
            },
          },
        },
      });
      const next = items.length > limit ? items[limit - 1]?.case_id : null;
      const list = items.slice(0, limit);
      const mapped = list.map((c) => {
        const dec = c.decisions;
        return {
          case_id: c.case_id,
          event_id: c.event_id,
          requested_at: c.created_at.toISOString(),
          request_reason: c.request_reason ?? null,
          block_reason: dec
            ? {
                explanation: dec.explanation_text ?? null,
                policy_name: dec.policies?.name ?? null,
              }
            : null,
          requested_by: {
            email:
              c.requested_by_email ?? (c.events?.actor_email as string) ?? null,
            groups: (c.events?.group_snapshot as string[]) ?? [],
          },
          app: { domain: c.events?.domain ?? null },
          summary: {
            risk_score: (dec?.risk_score as number) ?? 0,
            detectors: (
              (dec?.detector_hits_json as Array<{ type: string }>) ?? []
            ).map((d) => d.type),
          },
          expires_at: c.expires_at?.toISOString() ?? null,
          status: c.status,
        };
      });
      return { items: mapped, next_cursor: next };
    } catch (err) {
      this.logger.warn(
        `Approvals list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY_APPROVALS;
    }
  }

  async decide(
    caseId: string,
    body: {
      decision: {
        type: string;
        conditions?: object;
        comment?: string;
        approval_kind?: 'one_time' | 'user_exception';
        exception_expires_in_hours?: number;
      };
    },
  ) {
    try {
      const c = await this.prisma.approval_cases.findUnique({
        where: { case_id: caseId },
        include: {
          events: { select: { actor_email: true } },
          decisions: { select: { matched_policy_id: true } },
        },
      });
      if (!c)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Approval case not found' },
        });
      if (c.status !== 'PENDING') {
        throw new UnprocessableEntityException({
          error: {
            code: 'PAYLOAD_INVALID',
            message: 'Case already decided or expired',
          },
        });
      }
      if (c.expires_at && c.expires_at < new Date()) {
        await this.prisma.approval_cases.update({
          where: { case_id: caseId },
          data: { status: 'EXPIRED' },
        });
        return {
          ok: true,
          case_id: caseId,
          status: 'EXPIRED' as const,
          updated_at: new Date().toISOString(),
        };
      }
      const type = body.decision?.type?.toUpperCase();
      const status =
        type === 'APPROVE'
          ? 'APPROVED'
          : type === 'REJECT'
            ? 'REJECTED'
            : 'APPROVED';
      const approvalKind = body.decision?.approval_kind ?? 'one_time';
      const exceptionExpiresInHours = Math.min(
        8760,
        Math.max(1, body.decision?.exception_expires_in_hours ?? 24),
      );
      let exceptionId: string | null = null;

      if (
        status === 'APPROVED' &&
        approvalKind === 'user_exception' &&
        c.decisions?.matched_policy_id
      ) {
        const actorEmail = c.requested_by_email ?? c.events?.actor_email;
        if (actorEmail) {
          const expiresAt = new Date(
            Date.now() + exceptionExpiresInHours * 60 * 60 * 1000,
          );
          const ex = await this.prisma.policy_exceptions.create({
            data: {
              tenant_id: c.tenant_id,
              actor_email: actorEmail,
              policy_id: c.decisions.matched_policy_id,
              expires_at: expiresAt,
              created_from_case_id: caseId,
            },
          });
          exceptionId = ex.exception_id;
          this.logger.log(
            `Policy exception created: ${ex.exception_id} for ${actorEmail} policy ${c.decisions.matched_policy_id} until ${expiresAt.toISOString()}`,
          );
        }
      }

      await this.prisma.approval_cases.update({
        where: { case_id: caseId },
        data: {
          status,
          decision_comment: body.decision?.comment ?? null,
          decision_payload_json: {
            type: body.decision?.type,
            conditions: body.decision?.conditions,
            comment: body.decision?.comment,
            approval_kind: approvalKind,
            exception_expires_in_hours:
              approvalKind === 'user_exception'
                ? exceptionExpiresInHours
                : undefined,
            exception_id: exceptionId ?? undefined,
          } as object,
          updated_at: new Date(),
        },
      });
      await this.prisma.audit_trail.create({
        data: {
          tenant_id: c.tenant_id,
          action: 'approval_decided',
          target_type: 'approval_case',
          target_id: caseId,
          details_json: {
            status,
            comment: body.decision?.comment,
            approval_kind: approvalKind,
            exception_id: exceptionId,
          } as object,
        },
      });
      const updated = await this.prisma.approval_cases.findUnique({
        where: { case_id: caseId },
      });
      return {
        ok: true,
        case_id: caseId,
        status: updated!.status,
        approval_kind: approvalKind,
        exception_id: exceptionId ?? undefined,
        updated_at: updated!.updated_at.toISOString(),
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof UnprocessableEntityException
      )
        throw err;
      this.logger.warn(
        `Approvals decide failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }
}

type approval_status =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';
