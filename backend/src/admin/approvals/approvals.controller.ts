import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';

@ApiTags('Admin')
@Controller('admin/approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List approval cases' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.approvalsService.list({ status, from, to, cursor, limit });
  }

  @Get(':case_id')
  @ApiOperation({ summary: 'Get one approval case' })
  async getOne(@Param('case_id') caseId: string) {
    return this.approvalsService.getOne(caseId);
  }

  @Post(':case_id/decide')
  @ApiOperation({ summary: 'Decide an approval case' })
  async decide(
    @Param('case_id') caseId: string,
    @Body()
    body: {
      decision: {
        type: string;
        conditions?: object;
        comment?: string;
        approval_kind?: 'one_time' | 'user_exception';
        exception_expires_in_hours?: number;
      };
    },
  ) {
    return this.approvalsService.decide(caseId, body);
  }
}
