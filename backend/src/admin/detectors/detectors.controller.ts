import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DetectorsService } from './detectors.service';

@ApiTags('Admin')
@Controller('admin/detectors')
export class DetectorsController {
  constructor(private readonly detectorsService: DetectorsService) {}

  @Get()
  @ApiOperation({ summary: 'List detector configs' })
  list() {
    return this.detectorsService.list();
  }

  @Put(':detector_id')
  @ApiOperation({ summary: 'Update a detector config' })
  update(@Param('detector_id') detectorId: string, @Body() body: object) {
    return this.detectorsService.update(detectorId, body);
  }
}
