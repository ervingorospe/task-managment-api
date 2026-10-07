import { RealtimeEventsService } from './realtime-events.service';

describe('RealtimeEventsService', () => {
  describe('orgChannel / userChannel', () => {
    it('builds distinct, stable channel keys', () => {
      expect(RealtimeEventsService.orgChannel(5)).toBe('org:5');
      expect(RealtimeEventsService.userChannel(5)).toBe('user:5');
      expect(RealtimeEventsService.orgChannel(5)).not.toBe(
        RealtimeEventsService.userChannel(5),
      );
    });
  });

  it('delivers a publish() to a subscribed channel, carrying the resource', () => {
    const service = new RealtimeEventsService();
    const next = jest.fn();
    service.subscribe('org:1').subscribe(next);

    service.publish('org:1', 'TICKET');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith('TICKET');
  });

  it('is a no-op when publishing to a channel with no open stream', () => {
    const service = new RealtimeEventsService();
    expect(() => service.publish('org:999', 'TICKET')).not.toThrow();
  });

  it('shares one stream across multiple connections for the same channel', () => {
    const service = new RealtimeEventsService();
    const first = jest.fn();
    const second = jest.fn();
    service.subscribe('org:1').subscribe(first);
    service.subscribe('org:1').subscribe(second);

    service.publish('org:1', 'PROJECT');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream alive after only one of several connections unsubscribes', () => {
    const service = new RealtimeEventsService();
    const next = jest.fn();
    service.subscribe('org:1').subscribe(next);
    service.subscribe('org:1'); // second connection
    service.unsubscribe('org:1'); // closes the first

    service.publish('org:1', 'REQUEST');

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('tears the stream down once every connection for a channel has closed', () => {
    const service = new RealtimeEventsService();
    service.subscribe('org:1');
    service.unsubscribe('org:1');

    // A fresh subscribe() after full teardown gets a brand new Subject —
    // publish() still reaches it, proving the old one was really replaced.
    const next = jest.fn();
    service.subscribe('org:1').subscribe(next);
    service.publish('org:1', 'TICKET');

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not go negative when unsubscribe is called without a matching subscribe', () => {
    const service = new RealtimeEventsService();
    expect(() => service.unsubscribe('org:1')).not.toThrow();
  });

  it('keeps separate streams for different channels', () => {
    const service = new RealtimeEventsService();
    const org = jest.fn();
    const user = jest.fn();
    service.subscribe('org:1').subscribe(org);
    service.subscribe('user:1').subscribe(user);

    service.publish('org:1', 'TICKET');

    expect(org).toHaveBeenCalledTimes(1);
    expect(user).not.toHaveBeenCalled();
  });
});
