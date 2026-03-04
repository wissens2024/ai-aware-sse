import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PolicyCacheService } from '../../policy/policy-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

const EMPTY_POLICIES = {
  items: [] as object[],
  next_cursor: null as string | null,
};

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyCache: PolicyCacheService,
  ) {}

  async list(params: { enabled?: boolean; cursor?: string; limit?: number }) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant) return EMPTY_POLICIES;
      const limit = Math.min(params.limit ?? 50, 500);
      const where: { tenant_id: string; enabled?: boolean } = {
        tenant_id: tenant.tenant_id,
      };
      if (params.enabled !== undefined) where.enabled = params.enabled;
      const list = await this.prisma.policies.findMany({
        where,
        orderBy: { priority: 'asc' },
        take: limit + 1,
        cursor: params.cursor ? { policy_id: params.cursor } : undefined,
      });
      const items = list.slice(0, limit).map((p) => ({
        ...p,
        scope: p.scope_json as object,
        condition: p.condition_json as object,
        action: p.action_json as object,
        updated_at: p.updated_at.toISOString(),
      }));
      const next_cursor =
        list.length > limit ? items[items.length - 1]?.policy_id : null;
      return { items, next_cursor };
    } catch (err) {
      this.logger.warn(
        `Policies list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return EMPTY_POLICIES;
    }
  }

  async create(body: {
    name: string;
    description?: string;
    priority: number;
    enabled: boolean;
    scope: object;
    condition: object;
    action: object;
  }) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        });
      const p = await this.prisma.policies.create({
        data: {
          tenant_id: tenant.tenant_id,
          name: body.name,
          description: body.description ?? null,
          priority: body.priority,
          enabled: body.enabled,
          scope_json: body.scope,
          condition_json: body.condition,
          action_json: body.action,
        },
      });
      this.policyCache.invalidate(tenant.tenant_id);
      return {
        ...p,
        scope: p.scope_json as object,
        condition: p.condition_json as object,
        action: p.action_json as object,
        updated_at: p.updated_at.toISOString(),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `Policies create failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }

  async get(policyId: string) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      const p = await this.prisma.policies.findFirst({
        where: { policy_id: policyId, tenant_id: tenant.tenant_id },
      });
      if (!p)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      return {
        ...p,
        scope: p.scope_json as object,
        condition: p.condition_json as object,
        action: p.action_json as object,
        updated_at: p.updated_at.toISOString(),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `Policies get failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Policy not found' },
      });
    }
  }

  async update(
    policyId: string,
    body: {
      name?: string;
      description?: string;
      priority?: number;
      enabled?: boolean;
      scope?: object;
      condition?: object;
      action?: object;
    },
  ) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      const existing = await this.prisma.policies.findFirst({
        where: { policy_id: policyId, tenant_id: tenant.tenant_id },
      });
      if (!existing)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      const p = await this.prisma.policies.update({
        where: { policy_id: policyId },
        data: {
          ...(body.name != null && { name: body.name }),
          ...(body.description !== undefined && {
            description: body.description,
          }),
          ...(body.priority != null && { priority: body.priority }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
          ...(body.scope != null && { scope_json: body.scope }),
          ...(body.condition != null && { condition_json: body.condition }),
          ...(body.action != null && { action_json: body.action }),
          version: existing.version + 1,
          updated_at: new Date(),
        },
      });
      await this.prisma.audit_trail.create({
        data: {
          tenant_id: tenant.tenant_id,
          action: 'policy_updated',
          target_type: 'policy',
          target_id: policyId,
          details_json: { version: p.version } as object,
        },
      });
      this.policyCache.invalidate(tenant.tenant_id);
      return {
        ...p,
        scope: p.scope_json as object,
        condition: p.condition_json as object,
        action: p.action_json as object,
        updated_at: p.updated_at.toISOString(),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `Policies update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }

  async disable(policyId: string) {
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { name: 'PoC Tenant' },
      });
      if (!tenant)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      const existing = await this.prisma.policies.findFirst({
        where: { policy_id: policyId, tenant_id: tenant.tenant_id },
      });
      if (!existing)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Policy not found' },
        });
      const p = await this.prisma.policies.update({
        where: { policy_id: policyId },
        data: { enabled: false, updated_at: new Date() },
      });
      await this.prisma.audit_trail.create({
        data: {
          tenant_id: tenant.tenant_id,
          action: 'policy_disabled',
          target_type: 'policy',
          target_id: policyId,
          details_json: {} as object,
        },
      });
      this.policyCache.invalidate(tenant.tenant_id);
      return {
        ...p,
        scope: p.scope_json as object,
        condition: p.condition_json as object,
        action: p.action_json as object,
        updated_at: p.updated_at.toISOString(),
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `Policies disable failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }
}
