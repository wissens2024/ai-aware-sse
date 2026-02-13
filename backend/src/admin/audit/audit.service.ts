import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    from?: string;
    to?: string;
    action?: string;
    cursor?: string;
    limit?: number;
  }) {
    const tenant = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    if (!tenant) return { items: [], next_cursor: null as string | null };

    const limit = Math.min(params.limit ?? 100, 500);
    const where: {
      tenant_id: string;
      time?: { gte?: Date; lte?: Date };
      action?: string;
    } = {
      tenant_id: tenant.tenant_id,
    };
    if (params.from) where.time = { ...where.time, gte: new Date(params.from) };
    if (params.to) {
      const toEnd = new Date(params.to);
      toEnd.setSeconds(59, 999);
      where.time = { ...where.time, lte: toEnd };
    }
    if (params.action) where.action = params.action;

    const rows = await this.prisma.audit_trail.findMany({
      where,
      orderBy: { time: 'desc' },
      take: limit + 1,
      cursor: params.cursor ? { audit_id: params.cursor } : undefined,
    });

    const items = rows.slice(0, limit).map((a) => ({
      audit_id: a.audit_id,
      time: a.time.toISOString(),
      actor_email: a.actor_email ?? null,
      actor_user_id: a.actor_user_id ?? null,
      action: a.action,
      target_type: a.target_type ?? null,
      target_id: a.target_id ?? null,
      details: a.details_json as object,
    }));

    return {
      items,
      next_cursor:
        rows.length > limit
          ? (items[items.length - 1]?.audit_id ?? null)
          : null,
    };
  }
}
