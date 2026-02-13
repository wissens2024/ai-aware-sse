import { Injectable } from '@nestjs/common';
import type { PolicyRecord } from './policy-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 60_000; // 1분

type CacheEntry = { policies: PolicyRecord[]; expiresAt: number };

/** tenant별 enabled 정책 메모리 캐시. TTL 경과 또는 무효화 시 DB 재조회 */
@Injectable()
export class PolicyCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** 해당 tenant의 enabled 정책 목록 (캐시 hit 시 반환, miss/만료 시 DB 조회 후 캐시) */
  async getEnabledPolicies(tenantId: string): Promise<PolicyRecord[]> {
    const now = Date.now();
    const entry = this.cache.get(tenantId);
    if (entry && entry.expiresAt > now) return entry.policies;

    const rows = await this.prisma.policies.findMany({
      where: { tenant_id: tenantId, enabled: true },
      orderBy: { priority: 'asc' },
    });

    const policies: PolicyRecord[] = rows.map((p) => ({
      policy_id: p.policy_id,
      tenant_id: p.tenant_id,
      name: p.name,
      priority: p.priority,
      version: p.version,
      scope_json: p.scope_json as PolicyRecord['scope_json'],
      condition_json: p.condition_json as object,
      action_json: p.action_json as PolicyRecord['action_json'],
    }));

    this.cache.set(tenantId, { policies, expiresAt: now + TTL_MS });
    return policies;
  }

  /** 정책 생성/수정/비활성화 시 해당 tenant 캐시 무효화 */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
