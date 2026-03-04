import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ExceptionsService } from './exceptions.service';

@ApiTags('Admin')
@Controller('admin/exceptions')
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List policy exceptions (user-scoped bypass)' })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'active_only', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('tenant_id') tenantId?: string,
    @Query('active_only') activeOnly?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.exceptionsService.list({
      tenant_id: tenantId,
      active_only: activeOnly !== 'false',
      cursor,
      limit,
    });
  }

  @Delete(':exception_id')
  @ApiOperation({ summary: 'Revoke a policy exception' })
  async revoke(
    @Param('exception_id') exceptionId: string,
    @Query('tenant_id') tenantId?: string,
  ) {
    return this.exceptionsService.revoke(exceptionId, tenantId);
  }
}
