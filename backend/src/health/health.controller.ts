import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  get() {
    return {
      ok: true,
      server_time: new Date().toISOString(),
      version: '0.1.0',
    };
  }
}
