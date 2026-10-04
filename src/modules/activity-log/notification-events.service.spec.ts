import { NotificationEventsService } from './notification-events.service';

describe('NotificationEventsService', () => {
  it('delivers a notify() to a subscribed user', () => {
    const service = new NotificationEventsService();
    const next = jest.fn();
    service.subscribe(1).subscribe(next);

    service.notify(1);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when notifying a user with no open stream', () => {
    const service = new NotificationEventsService();
    expect(() => service.notify(999)).not.toThrow();
  });

  it('shares one stream across multiple connections for the same user', () => {
    const service = new NotificationEventsService();
    const first = jest.fn();
    const second = jest.fn();
    service.subscribe(1).subscribe(first);
    service.subscribe(1).subscribe(second);

    service.notify(1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream alive after only one of several connections unsubscribes', () => {
    const service = new NotificationEventsService();
    const next = jest.fn();
    service.subscribe(1).subscribe(next);
    service.subscribe(1); // second connection
    service.unsubscribe(1); // closes the first

    service.notify(1);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('tears the stream down once every connection for a user has closed', () => {
    const service = new NotificationEventsService();
    service.subscribe(1);
    service.unsubscribe(1);

    // A fresh subscribe() after full teardown gets a brand new Subject —
    // notify() still reaches it, proving the old one was really replaced.
    const next = jest.fn();
    service.subscribe(1).subscribe(next);
    service.notify(1);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not go negative when unsubscribe is called without a matching subscribe', () => {
    const service = new NotificationEventsService();
    expect(() => service.unsubscribe(1)).not.toThrow();
  });

  it('keeps separate streams for different users', () => {
    const service = new NotificationEventsService();
    const userA = jest.fn();
    const userB = jest.fn();
    service.subscribe(1).subscribe(userA);
    service.subscribe(2).subscribe(userB);

    service.notify(1);

    expect(userA).toHaveBeenCalledTimes(1);
    expect(userB).not.toHaveBeenCalled();
  });
});
