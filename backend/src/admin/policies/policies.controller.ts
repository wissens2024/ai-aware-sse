import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';

@ApiTags('Admin')
@Controller('admin/policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'List policies' })
  @ApiQuery({ name: 'enabled', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('enabled') enabled?: boolean,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.policiesService.list({ enabled, cursor, limit });
  }

  @Post()
  @ApiOperation({ summary: 'Create a policy' })
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      priority: number;
      enabled: boolean;
      scope: object;
      condition: object;
      action: object;
    },
  ) {
    return this.policiesService.create(body);
  }

  @Get(':policy_id')
  @ApiOperation({ summary: 'Get a policy' })
  async get(@Param('policy_id') policyId: string) {
    return this.policiesService.get(policyId);
  }

  @Put(':policy_id')
  @ApiOperation({ summary: 'Update a policy' })
  async update(@Param('policy_id') policyId: string, @Body() body: object) {
    return this.policiesService.update(policyId, body);
  }

  @Post(':policy_id/disable')
  @ApiOperation({ summary: 'Disable a policy' })
  async disable(@Param('policy_id') policyId: string) {
    return this.policiesService.disable(policyId);
  }
}
