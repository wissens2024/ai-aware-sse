import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GroupsService } from './groups.service';

@ApiTags('Admin')
@Controller('admin/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List groups' })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('tenant_id') tenantId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.groupsService.list({ tenant_id: tenantId, cursor, limit });
  }
}
