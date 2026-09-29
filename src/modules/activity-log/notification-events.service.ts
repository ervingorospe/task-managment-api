import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * In-memory pub/sub for the notification bell's SSE stream — one Subject
 * per currently-connected user, kept only for as long as at least one of
 * their tabs is streaming. Fine for a single backend instance (this app's
 * actual deployment); if this ever runs as more than one instance, a
 * notify() on one instance would miss subscribers connected to another,
 * and this would need a shared layer (Redis pub/sub or similar) instead.
 */
@Injectable()
export class NotificationEventsService {
  private readonly subjectsByUserId = new Map<number, Subject<void>>();
  // A user can have more than one tab/connection open at once, all
  // sharing the same Subject — this tracks how many, so unsubscribe()
  // only tears the Subject down once every one of them has closed,
  // rather than the first tab closing silently breaking the rest.
  private readonly connectionCounts = new Map<number, number>();

  /** The stream itself only ever carries a "something changed, go
   * refetch" signal — never the notification payload directly — so the
   * client always ends up re-querying GET /activity-log/notifications,
   * the same single source of truth the initial load and the poll
   * fallback use. Simpler than keeping the SSE payload and the REST
   * response shape in sync forever. */
  subscribe(userId: number) {
    this.connectionCounts.set(
      userId,
      (this.connectionCounts.get(userId) ?? 0) + 1,
    );

    let subject = this.subjectsByUserId.get(userId);
    if (!subject) {
      subject = new Subject<void>();
      this.subjectsByUserId.set(userId, subject);
    }
    return subject.asObservable();
  }

  /** Call when one connection for this user closes (see the controller's
   * finalize()). Only tears down the Subject once every connection for
   * that user has closed. */
  unsubscribe(userId: number): void {
    const remaining = (this.connectionCounts.get(userId) ?? 1) - 1;
    if (remaining <= 0) {
      this.connectionCounts.delete(userId);
      this.subjectsByUserId.delete(userId);
    } else {
      this.connectionCounts.set(userId, remaining);
    }
  }

  /** Called once per involved user (never the actor) right after a
   * TICKET-module activity entry is logged — see activity-log.service.ts.
   * A no-op if that user has no stream open right now; they'll pick the
   * change up on their next poll/page load instead. */
  notify(userId: number): void {
    this.subjectsByUserId.get(userId)?.next();
  }
}
