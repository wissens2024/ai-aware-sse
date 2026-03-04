import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY_EVENTS = {
  items: [] as object[],
  next_cursor: null as string | null,
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(params: {
    from: string;
    to: string;
    domain?: string;
    decision?: string;
    user?: string;
    group?: string;
    detector?: string;
    q?: string;
    cursor?: string;
    limit?: number;
  }) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant) return EMPTY_EVENTS;
      const limit = Math.min(params.limit ?? 50, 500);
      const fromDate = new Date(params.from);
      const toDate = new Date(params.to);
      const where: Record<string, unknown> = {
        tenant_id: tenant.tenant_id,
        time: { gte: fromDate, lte: toDate },
      };
      if (params.domain) where.domain = params.domain;
      if (params.user)
        where.actor_email = { contains: params.user, mode: 'insensitive' };
      const events = await this.prisma.events.findMany({
        where,
        orderBy: { time: 'desc' },
        take: limit + 1,
        cursor: params.cursor ? { event_id: params.cursor } : undefined,
        include: {
          decisions: { take: 1, orderBy: { created_at: 'desc' } },
          approval_cases: { take: 1 },
        },
      });
      let items = events.slice(0, limit).map((e) => {
        const dec = e.decisions[0];
        const outcome = dec?.outcome ?? 'ALLOW';
        if (params.decision && outcome !== params.decision) return null;
        const caseId = e.approval_cases[0]?.case_id ?? null;
        return {
          event_id: e.event_id,
          time: e.time.toISOString(),
          user: {
            email: e.actor_email ?? null,
            groups: (e.group_snapshot as string[]) ?? [],
          },
          app: { domain: e.domain ?? null },
          event_type: e.event_type,
          decision: outcome,
          risk_score: dec?.risk_score ?? 0,
          case_id: caseId,
        };
      });
      items = items.filter(Boolean) as NonNullable<(typeof items)[number]>[];
      const next_cursor =
        events.length > limit ? events[limit - 1]?.event_id : null;
      if (items.length === 0 && events.length === 0) {
        this.logger.debug(
          `Events search: 0 results (tenant=${tenant.tenant_id}, from=${fromDate.toISOString()}, to=${toDate.toISOString()})`,
        );
      }
      return { items, next_cursor };
    } catch (err) {
      this.logger.warn(
        `Events search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY_EVENTS;
    }
  }

  async getDetail(eventId: string) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        });
      const event = await this.prisma.events.findFirst({
        where: { event_id: eventId, tenant_id: tenant.tenant_id },
        include: {
          decisions: {
            orderBy: { created_at: 'desc' },
            take: 1,
            include: { policies: true },
          },
          approval_cases: { take: 1 },
        },
      });
      if (!event)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        });
      const dec = event.decisions[0];
      const audit = await this.prisma.audit_trail.findMany({
        where: {
          tenant_id: tenant.tenant_id,
          OR: [
            { target_type: 'event', target_id: eventId },
            { target_type: 'decision', target_id: dec?.decision_id },
          ],
        },
        orderBy: { time: 'asc' },
      });
      return {
        event: {
          event_id: event.event_id,
          time: event.time.toISOString(),
          app: { domain: event.domain ?? null, url: event.url ?? null },
          actor: {
            email: event.actor_email ?? null,
            groups: (event.group_snapshot as string[]) ?? [],
            device_id: null,
          },
          content_meta: {
            kind: event.content_kind,
            length: event.content_length,
            sha256: event.content_sha256 ?? null,
          },
          content_sample_masked: event.content_sample_masked ?? null,
        },
        decision: dec
          ? {
              outcome: dec.outcome,
              matched_policy: dec.policies
                ? {
                    policy_id: dec.policies.policy_id,
                    name: dec.policies.name,
                    priority: dec.policies.priority,
                    version: dec.policies.version,
                  }
                : null,
              detector_hits:
                (dec.detector_hits_json as Array<{
                  type: string;
                  count: number;
                  evidence?: string;
                }>) ?? [],
              explanation: {
                summary: dec.explanation_text ?? '',
                safe_details: [],
              },
            }
          : {
              outcome: 'ALLOW' as const,
              matched_policy: null,
              detector_hits: [],
              explanation: { summary: '', safe_details: [] },
            },
        approval_case: event.approval_cases[0]
          ? {
              case_id: event.approval_cases[0].case_id,
              status: event.approval_cases[0].status,
            }
          : null,
        audit_trail: audit.map((a) => ({
          time: a.time.toISOString(),
          actor: a.actor_email ?? a.actor_user_id ?? '',
          action: a.action,
        })),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `Events getDetail failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }
  }
}
