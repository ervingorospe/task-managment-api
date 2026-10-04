import { ActivityLogController } from './activity-log.controller';
import { NotificationEventsService } from './notification-events.service';
import type { ActivityLogService } from './activity-log.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeActivityLogService() {
  return {
    log: jest.fn(),
    listPersonal: jest.fn(),
    list: jest.fn(),
    getNotifications: jest.fn(),
    markNotificationsSeen: jest.fn().mockResolvedValue(undefined),
  } as unknown as ActivityLogService;
}

describe('ActivityLogController', () => {
  it('log() stamps actorId from the session, not the body', () => {
    const activityLogService = makeActivityLogService();
    const controller = new ActivityLogController(
      activityLogService,
      new NotificationEventsService(),
    );
    const dto = { module: 'TICKET', action: 'create' } as never;

    void controller.log(dto, USER);

    expect(activityLogService.log).toHaveBeenCalledWith({
      module: 'TICKET',
      action: 'create',
      actorId: 7,
    });
  });

  it('listPersonal() scopes by the session user id', () => {
    const activityLogService = makeActivityLogService();
    const controller = new ActivityLogController(
      activityLogService,
      new NotificationEventsService(),
    );
    const query = {} as never;

    void controller.listPersonal(USER, query);
    expect(activityLogService.listPersonal).toHaveBeenCalledWith(7, query);
  });

  it('list() delegates the query straight through', () => {
    const activityLogService = makeActivityLogService();
    const controller = new ActivityLogController(
      activityLogService,
      new NotificationEventsService(),
    );
    const query = { orgId: 5 } as never;

    void controller.list(query);
    expect(activityLogService.list).toHaveBeenCalledWith(query);
  });

  it('getNotifications() scopes by the session user id', () => {
    const activityLogService = makeActivityLogService();
    const controller = new ActivityLogController(
      activityLogService,
      new NotificationEventsService(),
    );

    void controller.getNotifications(USER);
    expect(activityLogService.getNotifications).toHaveBeenCalledWith(7);
  });

  it('markNotificationsSeen() delegates and returns a confirmation message', async () => {
    const activityLogService = makeActivityLogService();
    const controller = new ActivityLogController(
      activityLogService,
      new NotificationEventsService(),
    );

    const result = await controller.markNotificationsSeen(USER);

    expect(activityLogService.markNotificationsSeen).toHaveBeenCalledWith(7);
    expect(result).toEqual({ message: 'Notifications marked as seen.' });
  });

  describe('streamNotifications', () => {
    it('emits a notification MessageEvent when notify() fires for this user', (done) => {
      const notificationEvents = new NotificationEventsService();
      const controller = new ActivityLogController(
        makeActivityLogService(),
        notificationEvents,
      );

      const sub = controller.streamNotifications(USER).subscribe((event) => {
        expect(event).toEqual({ type: 'notification', data: 'update' });
        sub.unsubscribe();
        done();
      });

      notificationEvents.notify(7);
    });

    it('unsubscribes from NotificationEventsService when the stream is torn down', () => {
      const notificationEvents = new NotificationEventsService();
      const unsubscribeSpy = jest.spyOn(notificationEvents, 'unsubscribe');
      const controller = new ActivityLogController(
        makeActivityLogService(),
        notificationEvents,
      );

      const sub = controller.streamNotifications(USER).subscribe();
      sub.unsubscribe();

      expect(unsubscribeSpy).toHaveBeenCalledWith(7);
    });

    it('emits a heartbeat MessageEvent on its own cadence, independent of notify()', (done) => {
      jest.useFakeTimers();
      const notificationEvents = new NotificationEventsService();
      const controller = new ActivityLogController(
        makeActivityLogService(),
        notificationEvents,
      );

      const sub = controller.streamNotifications(USER).subscribe((event) => {
        expect(event).toEqual({ type: 'heartbeat', data: 'ping' });
        sub.unsubscribe();
        jest.useRealTimers();
        done();
      });

      jest.advanceTimersByTime(20_000);
    });
  });
});
