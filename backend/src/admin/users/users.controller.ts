import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Admin')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (tenant-scoped, with groups)' })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('tenant_id') tenantId?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.list({ tenant_id: tenantId, q, cursor, limit });
  }

  @Post('import')
  @ApiOperation({ summary: 'Import users and assign groups' })
  async import(
    @Body()
    body: {
      tenant_id?: string;
      users: Array<{ email: string; display_name?: string; groups: string[] }>;
    },
  ) {
    return this.usersService.import(body);
  }
}
