import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { PersonalActivityLogQueryDto } from './dto/personal-activity-log-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  // actorId comes from the session, not the body — otherwise any logged-in
  // caller could forge a log entry attributed to someone else.
  @Post()
  log(@Body() dto: LogActivityDto, @CurrentUser() user: RequestUser) {
    return this.activityLogService.log({ ...dto, actorId: user.id });
  }

  // Ahead of the plain `@Get()` below isn't strictly necessary (both are
  // static paths, no param collision), but kept alongside it for symmetry
  // with the personal ticket routes. userId comes from the session, same
  // reasoning as the personal ticket routes.
  @Get('personal')
  listPersonal(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonalActivityLogQueryDto,
  ) {
    return this.activityLogService.listPersonal(user.id, query);
  }

  @RequirePermissions({
    anyOf: [
      PERMISSIONS.ACTIVITY_LOG_VIEW_ALL,
      PERMISSIONS.ACTIVITY_LOG_VIEW_INCLUDED,
    ],
  })
  @Get()
  list(@Query() query: ActivityLogQueryDto) {
    return this.activityLogService.list(query);
  }
}
