import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Admin')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary metrics' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'ISO8601 datetime (inclusive)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'ISO8601 datetime (exclusive)',
  })
  async getSummary(@Query('from') from: string, @Query('to') to: string) {
    return this.dashboardService.getSummary(from, to);
  }
}
