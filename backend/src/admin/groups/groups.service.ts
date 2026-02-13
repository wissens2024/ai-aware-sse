import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY = { items: [] as object[], next_cursor: null as string | null };

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

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

  async list(params: { tenant_id?: string; cursor?: string; limit?: number }) {
    try {
      const tenantId = await this.resolveTenantId(params.tenant_id);
      if (!tenantId) return EMPTY;
      const limit = Math.min(params.limit ?? 50, 500);
      const list = await this.prisma.groups.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
        take: limit + 1,
        cursor: params.cursor ? { group_id: params.cursor } : undefined,
        include: { _count: { select: { user_groups: true } } },
      });
      const items = list.slice(0, limit).map((g) => ({
        group_id: g.group_id,
        name: g.name,
        member_count: g._count.user_groups,
        created_at: g.created_at.toISOString(),
      }));
      const next_cursor =
        list.length > limit
          ? (items[items.length - 1] as { group_id: string })?.group_id
          : null;
      return { items, next_cursor };
    } catch (err) {
      this.logger.warn(
        `Groups list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY;
    }
  }
}
