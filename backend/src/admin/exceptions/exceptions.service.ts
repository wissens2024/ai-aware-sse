import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY = { items: [] as object[], next_cursor: null as string | null };

@Injectable()
export class ExceptionsService {
  private readonly logger = new Logger(ExceptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(tenantId?: string) {
    if (tenantId) {
      const t = await this.prisma.tenants.findUnique({
        where: { tenant_id: tenantId },
      });
      return t?.tenant_id ?? null;
    }
    const t = await this.prisma.tenants.findFirst({
      where: { name: 'PoC Tenant' },
    });
    return t?.tenant_id ?? null;
  }

  async list(params: {
    tenant_id?: string;
    active_only?: boolean;
    cursor?: string;
    limit?: number;
  }) {
    try {
      const tenantId = await this.resolveTenantId(params.tenant_id);
      if (!tenantId) return EMPTY;
      const limit = Math.min(params.limit ?? 50, 500);
      const where: { tenant_id: string; expires_at?: { gt: Date } } = {
        tenant_id: tenantId,
      };
      if (params.active_only !== false) where.expires_at = { gt: new Date() };
      const list = await this.prisma.policy_exceptions.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
        cursor: params.cursor ? { exception_id: params.cursor } : undefined,
        include: { policies: { select: { name: true } } },
      });
      const items = list.slice(0, limit).map((e) => ({
        exception_id: e.exception_id,
        tenant_id: e.tenant_id,
        actor_email: e.actor_email ?? null,
        policy_id: e.policy_id,
        policy_name: e.policies.name,
        expires_at: e.expires_at.toISOString(),
        created_from_case_id: e.created_from_case_id,
        created_at: e.created_at.toISOString(),
        active: e.expires_at > new Date(),
      }));
      const next_cursor =
        list.length > limit
          ? (items[items.length - 1] as { exception_id: string })?.exception_id
          : null;
      return { items, next_cursor };
    } catch (err) {
      this.logger.warn(
        `Exceptions list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY;
    }
  }

  async revoke(exceptionId: string, tenantId?: string) {
    const tid = await this.resolveTenantId(tenantId);
    const ex = await this.prisma.policy_exceptions.findFirst({
      where: { exception_id: exceptionId, ...(tid ? { tenant_id: tid } : {}) },
    });
    if (!ex)
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Exception not found' },
      });
    await this.prisma.policy_exceptions.delete({
      where: { exception_id: exceptionId },
    });
    return { ok: true, exception_id: exceptionId };
  }
}
