import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    try {
      const list = await this.prisma.tenants.findMany({
        orderBy: { name: 'asc' },
        select: { tenant_id: true, name: true, created_at: true },
      });
      return {
        items: list.map((t) => ({
          tenant_id: t.tenant_id,
          name: t.name,
          created_at: t.created_at.toISOString(),
        })),
      };
    } catch (err) {
      this.logger.warn(
        `Tenants list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { items: [] };
    }
  }
}
