import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY_SUMMARY = {
  metrics: {
    events_total: 0,
    blocked: 0,
    warned: 0,
    masked: 0,
    approval_pending: 0,
  },
  top_apps: [],
  top_detectors: [],
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(from: string, to: string) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant) {
        return EMPTY_SUMMARY;
      }
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return EMPTY_SUMMARY;
      }
      const [eventsTotal, decisions, pendingApprovals, eventsByDomain] =
        await Promise.all([
          this.prisma.events.count({
            where: {
              tenant_id: tenant.tenant_id,
              time: { gte: fromDate, lt: toDate },
            },
          }),
          this.prisma.decisions.findMany({
            where: {
              tenant_id: tenant.tenant_id,
              created_at: { gte: fromDate, lt: toDate },
            },
            select: { outcome: true, detector_hits_json: true },
          }),
          this.prisma.approval_cases.count({
            where: { tenant_id: tenant.tenant_id, status: 'PENDING' },
          }),
          this.prisma.events.groupBy({
            by: ['domain'],
            where: {
              tenant_id: tenant.tenant_id,
              time: { gte: fromDate, lt: toDate },
              domain: { not: null },
            },
            _count: { event_id: true },
          }),
        ]);
      const blocked = decisions.filter((d) => d.outcome === 'BLOCK').length;
      const warned = decisions.filter((d) => d.outcome === 'WARN').length;
      const masked = decisions.filter((d) => d.outcome === 'MASK').length;
      const topDetectors: Record<string, number> = {};
      for (const d of decisions) {
        const arr = (d.detector_hits_json as Array<{ type: string }>) ?? [];
        for (const h of arr) {
          topDetectors[h.type] = (topDetectors[h.type] ?? 0) + 1;
        }
      }
      return {
        metrics: {
          events_total: eventsTotal,
          blocked,
          warned,
          masked,
          approval_pending: pendingApprovals,
        },
        top_apps: eventsByDomain
          .map((g) => ({
            domain: g.domain ?? '',
            events: g._count.event_id,
            blocked: 0,
          }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 10),
        top_detectors: Object.entries(topDetectors).map(([type, hits]) => ({
          type,
          hits,
        })),
      };
    } catch (err) {
      this.logger.warn(
        `Dashboard getSummary failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY_SUMMARY;
    }
  }
}
