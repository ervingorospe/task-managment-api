import {
  computeInviteExpiry,
  markExpiredInvites,
} from './invite-expiration.helper';
import type { PrismaService } from '../../prisma/prisma.service';

const FROM = new Date('2026-01-01T00:00:00.000Z');

describe('computeInviteExpiry', () => {
  it('adds hours for an "N_hours" key', () => {
    const result = computeInviteExpiry('2_hours', FROM);
    expect(result.toISOString()).toBe('2026-01-01T02:00:00.000Z');
  });

  it('adds days for an "N_day" key', () => {
    const result = computeInviteExpiry('3_days', FROM);
    expect(result.toISOString()).toBe('2026-01-04T00:00:00.000Z');
  });

  it('adds weeks for an "N_week" key', () => {
    const result = computeInviteExpiry('1_week', FROM);
    expect(result.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('adds months for an "N_month" key', () => {
    const result = computeInviteExpiry('1_month', FROM);
    expect(result.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('defaults to 1 day when durationKey is null', () => {
    const result = computeInviteExpiry(null, FROM);
    expect(result.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('defaults to 1 day when durationKey is undefined', () => {
    const result = computeInviteExpiry(undefined, FROM);
    expect(result.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('treats an unrecognized unit as days, keeping the given amount', () => {
    const result = computeInviteExpiry('5_fortnights', FROM);
    expect(result.toISOString()).toBe('2026-01-06T00:00:00.000Z');
  });

  it('defaults the amount to 1 when it does not parse as a number', () => {
    const result = computeInviteExpiry('x_hours', FROM);
    expect(result.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });

  it('anchors to the current time when "from" is omitted', () => {
    const before = Date.now();
    const result = computeInviteExpiry('1_hour');
    const after = Date.now();

    expect(result.getTime()).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 60 * 60 * 1000);
  });
});

describe('markExpiredInvites', () => {
  it('updates every PENDING, non-deleted, past-expiry invite for the org to EXPIRED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { memberInvite: { updateMany } } as unknown as PrismaService;

    await markExpiredInvites(prisma, 7);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        orgId: 7,
        status: 'PENDING',
        isDeleted: false,
        expiry: { lt: expect.any(Date) },
      },
      data: { status: 'EXPIRED' },
    });
  });
});
