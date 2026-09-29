import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { NotificationEventsService } from './notification-events.service';

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService, NotificationEventsService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
