import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppsService } from './apps.service';

@ApiTags('Admin')
@Controller('admin/apps')
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Get()
  @ApiOperation({ summary: 'List apps/domains' })
  list() {
    return this.appsService.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create an app/domain entry' })
  create(@Body() body: object) {
    return this.appsService.create(body);
  }

  @Put(':app_id')
  @ApiOperation({ summary: 'Update an app/domain entry' })
  update(@Param('app_id') appId: string, @Body() body: object) {
    return this.appsService.update(appId, body);
  }
}
