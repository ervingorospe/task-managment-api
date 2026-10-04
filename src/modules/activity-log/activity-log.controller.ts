import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { interval, merge, type Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { ActivityLogService } from './activity-log.service';
import { NotificationEventsService } from './notification-events.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { PersonalActivityLogQueryDto } from './dto/personal-activity-log-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions/permissions.constant';

// Sent on this cadence for as long as a bell is streaming, whether or not
// anything happened — keeps the connection alive against idle timeouts
// (intermediary proxies, the browser itself, and Render's free-tier
// spin-down, which only resets on actual traffic, not a merely-open
// socket).
const HEARTBEAT_MS = 20_000;

@Controller('activity-log')
export class ActivityLogController {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationEvents: NotificationEventsService,
  ) {}

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

  // The bell icon — "my" ticket notifications across every org I belong
  // to, so it's scoped by session id like /personal above, not gated by
  // an org-specific Rule the way the plain @Get() list is.
  @Get('notifications')
  getNotifications(@CurrentUser() user: RequestUser) {
    return this.activityLogService.getNotifications(user.id);
  }

  @Patch('notifications/seen')
  @HttpCode(200)
  async markNotificationsSeen(@CurrentUser() user: RequestUser) {
    await this.activityLogService.markNotificationsSeen(user.id);
    return { message: 'Notifications marked as seen.' };
  }

  // The bell's real-time push — a plain signal that something changed,
  // never the notification payload itself (see NotificationEventsService's
  // doc comment). The frontend reacts by re-calling GET .../notifications,
  // same as it already does on mount and on its poll fallback, so there's
  // only ever one code path that decides what a notification actually is.
  @Sse('notifications/stream')
  streamNotifications(
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    const changes$ = this.notificationEvents
      .subscribe(user.id)
      .pipe(
        map((): MessageEvent => ({ type: 'notification', data: 'update' })),
      );
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: 'ping' })),
    );

    return merge(changes$, heartbeat$).pipe(
      finalize(() => this.notificationEvents.unsubscribe(user.id)),
    );
  }
}
