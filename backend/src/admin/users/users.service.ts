import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY = { items: [] as object[], next_cursor: null as string | null };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
    q?: string;
    cursor?: string;
    limit?: number;
  }) {
    try {
      const tenantId = await this.resolveTenantId(params.tenant_id);
      if (!tenantId) return EMPTY;
      const limit = Math.min(params.limit ?? 50, 500);
      const where: {
        tenant_id: string;
        email?: { contains: string; mode: 'insensitive' };
      } = {
        tenant_id: tenantId,
      };
      if (params.q?.trim())
        where.email = { contains: params.q.trim(), mode: 'insensitive' };
      const list = await this.prisma.users.findMany({
        where,
        orderBy: { email: 'asc' },
        take: limit + 1,
        cursor: params.cursor ? { user_id: params.cursor } : undefined,
        include: {
          user_groups: { include: { groups: { select: { name: true } } } },
        },
      });
      const items = list.slice(0, limit).map((u) => ({
        user_id: u.user_id,
        email: u.email ?? null,
        display_name: u.display_name ?? null,
        groups: u.user_groups.map((ug) => ug.groups.name),
        created_at: u.created_at.toISOString(),
      }));
      const next_cursor =
        list.length > limit
          ? (items[items.length - 1] as { user_id: string })?.user_id
          : null;
      return { items, next_cursor };
    } catch (err) {
      this.logger.warn(
        `Users list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY;
    }
  }

  async import(body: {
    tenant_id?: string;
    users: Array<{ email: string; display_name?: string; groups: string[] }>;
  }) {
    const tenantId = await this.resolveTenantId(body.tenant_id);
    if (!tenantId) throw new Error('Tenant not found');
    let imported = 0;
    for (const u of body.users ?? []) {
      if (!u.email?.trim()) continue;
      const email = u.email.trim();
      const user = await this.prisma.users.upsert({
        where: { tenant_id_email: { tenant_id: tenantId, email } },
        create: {
          tenant_id: tenantId,
          email,
          display_name: u.display_name ?? null,
        },
        update: { display_name: u.display_name ?? undefined },
      });
      const groupNames = [
        ...new Set((u.groups ?? []).map((g) => g.trim()).filter(Boolean)),
      ];
      for (const name of groupNames) {
        let group = await this.prisma.groups.findUnique({
          where: { tenant_id_name: { tenant_id: tenantId, name } },
        });
        if (!group) {
          group = await this.prisma.groups.create({
            data: { tenant_id: tenantId, name },
          });
        }
        await this.prisma.user_groups.upsert({
          where: {
            tenant_id_user_id_group_id: {
              tenant_id: tenantId,
              user_id: user.user_id,
              group_id: group.group_id,
            },
          },
          create: {
            tenant_id: tenantId,
            user_id: user.user_id,
            group_id: group.group_id,
          },
          update: {},
        });
      }
      imported++;
    }
    return { ok: true, imported_users: imported };
  }
}
