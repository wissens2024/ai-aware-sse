import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';

@ApiTags('Admin')
@Controller('admin/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Search events' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'domain', required: false })
  @ApiQuery({ name: 'decision', required: false })
  @ApiQuery({ name: 'user', required: false })
  @ApiQuery({ name: 'group', required: false })
  @ApiQuery({ name: 'detector', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async search(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('domain') domain?: string,
    @Query('decision') decision?: string,
    @Query('user') user?: string,
    @Query('group') group?: string,
    @Query('detector') detector?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.search({
      from,
      to,
      domain,
      decision,
      user,
      group,
      detector,
      q,
      cursor,
      limit,
    });
  }

  @Get(':event_id')
  @ApiOperation({ summary: 'Get event details' })
  async getDetail(@Param('event_id') eventId: string) {
    return this.eventsService.getDetail(eventId);
  }
}
