import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Post()
  log(@Body() dto: LogActivityDto) {
    return this.activityLogService.log(dto);
  }

  @Get()
  list(@Query() query: ActivityLogQueryDto) {
    return this.activityLogService.list(query);
  }
}
