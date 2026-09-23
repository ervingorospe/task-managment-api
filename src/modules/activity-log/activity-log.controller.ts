import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { PersonalActivityLogQueryDto } from './dto/personal-activity-log-query.dto';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Post()
  log(@Body() dto: LogActivityDto) {
    return this.activityLogService.log(dto);
  }

  // Ahead of the plain `@Get()` below isn't strictly necessary (both are
  // static paths, no param collision), but kept alongside it for symmetry
  // with the personal ticket routes.
  @Get('personal')
  listPersonal(
    @Query('userId', ParseIntPipe) userId: number,
    @Query() query: PersonalActivityLogQueryDto,
  ) {
    return this.activityLogService.listPersonal(userId, query);
  }

  @Get()
  list(@Query() query: ActivityLogQueryDto) {
    return this.activityLogService.list(query);
  }
}
