import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { ActivityModule } from '../../generated/prisma/client.js';

/**
 * In-memory pub/sub for live "something changed" signals on ticket/
 * request/project lists — same single-Subject-per-key, single-instance
 * shape as NotificationEventsService (see its own header comment for the
 * multi-instance caveat), just keyed by a channel string instead of a
 * bare user id, since these lists are scoped by organization, not always
 * by the viewing user — see orgChannel()/userChannel().
 */
@Injectable()
export class RealtimeEventsService {
  private readonly subjectsByChannel = new Map<
    string,
    Subject<ActivityModule>
  >();
  // Same multi-tab accounting as NotificationEventsService — a channel's
  // Subject is only torn down once every connection subscribed to it has
  // closed.
  private readonly connectionCounts = new Map<string, number>();

  /** Org-scoped lists (org tickets, requests, projects) — every active
   * member of the org shares this one channel; the frontend's regular
   * permission-filtered GET re-fetch decides what each of them actually
   * sees, same as the notification bell never carries the payload
   * itself. */
  static orgChannel(orgId: number): string {
    return `org:${orgId}`;
  }

  /** Personal (org-less) tickets — scoped to the owner, so their other
   * open tabs pick up a change too. Unlike the notification bell, this
   * deliberately does NOT exclude the actor's own action from the
   * signal: a second tab of the same user still needs to refetch. */
  static userChannel(userId: number): string {
    return `user:${userId}`;
  }

  subscribe(channel: string) {
    this.connectionCounts.set(
      channel,
      (this.connectionCounts.get(channel) ?? 0) + 1,
    );

    let subject = this.subjectsByChannel.get(channel);
    if (!subject) {
      subject = new Subject<ActivityModule>();
      this.subjectsByChannel.set(channel, subject);
    }
    return subject.asObservable();
  }

  /** Call when one connection for this channel closes (see the
   * controller's finalize()). Only tears down the Subject once every
   * connection on it has closed. */
  unsubscribe(channel: string): void {
    const remaining = (this.connectionCounts.get(channel) ?? 1) - 1;
    if (remaining <= 0) {
      this.connectionCounts.delete(channel);
      this.subjectsByChannel.delete(channel);
    } else {
      this.connectionCounts.set(channel, remaining);
    }
  }

  /** Called right after a TICKET/REQUEST/PROJECT activity entry is
   * logged — see activity-log.service.ts. A no-op if nothing's
   * subscribed to this channel right now; they'll see the change on
   * their next load instead. */
  publish(channel: string, resource: ActivityModule): void {
    this.subjectsByChannel.get(channel)?.next(resource);
  }
}
